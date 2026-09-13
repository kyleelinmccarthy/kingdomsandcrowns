"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings, loadRealmFlags } from "@/lib/services/realm-play";
import { loadKingdomOverview } from "@/lib/services/deeds";
import { loadSpellbookPages, ensureStarterSpell, type SpellPage } from "@/lib/services/spells";
import { loadUnlockedMountIds } from "@/lib/services/mounts";
import { loadSeasons } from "@/lib/services/crowns";
import { bannerCount, pendingCeremony, seasonLabel } from "@/lib/utils/seasons";
import { crownById, type CrownTier } from "@/lib/utils/crown-catalog";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import { profileFromRow, type LearningProfile } from "@/lib/utils/learning-profile";
import { isValidAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { realmDepth, type DepthOverride, type RealmDepth } from "@/lib/realm/depth";
import { TUTORIAL_STEPS } from "@/lib/realm/tutorial";

export type RealmBundle = {
  heroName: string;
  avatarConfig: AvatarConfig | null;
  castleType: string;
  kingdom: KingdomState;
  kingdomError?: string; // set when the kingdom could not load; the world still opens, without villagers
  profile: LearningProfile;
  settings: { enabled: boolean; toneMode: "gentle" | "monsters" };
  spellbook: { spells: SpellPage[]; slots: number };
  mounts: { unlocked: string[] };
  /** The crown ceremony waiting for the hero; always null for a parent's preview. */
  ceremony: { seasonId: string; crownId: string; ordinal: number; grade: string; seasonLabel: string } | null;
  banners: number; // completed seasons, capped; one castle banner each
  wornCrown: CrownTier | null; // the crown on the hero's avatar, if any
  helpSeen: boolean; // false until the hero has seen the how-to-play card
  /** The stored preference: 'auto' follows the tutorial, 'simple' and 'full' pin it. */
  depthOverride: DepthOverride;
  /**
   * Computed here, once, from `tutorialStep` and `depthOverride`, so no client recomputes it
   * from two fields and gets a different answer. `RealmOpen` snapshots it for the visit.
   */
  depth: RealmDepth;
  /** The highest tutorial step the hero has finished, 0 through `TUTORIAL_STEPS.length`. */
  tutorialStep: number;
};

const VILLAGERS_RESTING = "The villagers are resting. Try again.";

async function loadKingdomState(childId: string): Promise<KingdomState> {
  const overview = await loadKingdomOverview(childId);
  return { tone: overview.tone, buildings: overview.buildings };
}

/** The kingdom alone, for the HUD's retry after a failed bundle load. */
export async function getRealmKingdom(childId: string): Promise<KingdomState> {
  await requireChildAccess(childId);
  return loadKingdomState(childId);
}

/** Everything the Realm page needs, in one round of parallel reads. A hero may read their own. */
export async function getRealmBundle(childId: string): Promise<RealmBundle> {
  const { access } = await requireChildAccess(childId);
  // Also hands back the flags it read (post-update), so the parallel batch below does not
  // pay a second `loadRealmFlags` round trip just to read `helpSeenAt`. On the (rare) failure
  // path, fall back to a direct read so a starter-spell hiccup never misreports `helpSeen`.
  const flags = await ensureStarterSpell(childId)
    .then((result) => result.flags)
    .catch(async (err: unknown) => {
      console.error("Starter spell failed", err);
      return loadRealmFlags(childId);
    });
  const [childRows, castleRows, profileRows, settings, kingdomResult, spellbook, mounts, seasons] = await Promise.all([
    db.select({ displayName: schema.child.displayName, avatarConfig: schema.child.avatarConfig }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ type: schema.castle.type }).from(schema.castle).where(eq(schema.castle.childId, childId)).limit(1),
    db.select().from(schema.learningProfile).where(eq(schema.learningProfile.childId, childId)).limit(1),
    loadRealmSettings(childId),
    loadKingdomState(childId).then((kingdom) => ({ kingdom, error: undefined as string | undefined })).catch((err: unknown) => {
      console.error("Realm kingdom failed to load", err);
      return { kingdom: { tone: "gentle" as const, buildings: [] }, error: VILLAGERS_RESTING };
    }),
    loadSpellbookPages(childId),
    loadUnlockedMountIds(childId),
    loadSeasons(childId),
  ]);
  const child = childRows[0];
  if (!child) throw new Error("Hero not found.");

  let avatarConfig: AvatarConfig | null = null;
  if (child.avatarConfig) {
    try {
      const parsed = JSON.parse(child.avatarConfig) as unknown;
      const normalized = normalizeAvatarConfig((parsed ?? {}) as Record<string, unknown>);
      avatarConfig = isValidAvatarConfig(normalized) ? normalized : null;
    } catch {
      avatarConfig = null; // a corrupt look falls back to the placeholder sprite, never a crash
    }
  }

  const pending = isChildActor(access) ? pendingCeremony(seasons) : null;
  const ceremony = pending && pending.crownId
    ? { seasonId: pending.id, crownId: pending.crownId, ordinal: pending.ordinal, grade: pending.grade, seasonLabel: seasonLabel(pending.startDate) }
    : null;
  const wornCrown = avatarConfig?.crown ? crownById(avatarConfig.crown) : null;
  const helpSeen = flags.helpSeenAt !== null;

  return {
    heroName: child.displayName,
    avatarConfig,
    castleType: castleRows[0]?.type ?? "campsite",
    kingdom: kingdomResult.kingdom,
    ...(kingdomResult.error ? { kingdomError: kingdomResult.error } : {}),
    profile: profileFromRow(profileRows[0] ?? null),
    settings: { enabled: settings.enabled, toneMode: settings.toneMode },
    spellbook: { spells: spellbook.spells, slots: spellbook.slots },
    mounts: { unlocked: mounts },
    ceremony,
    banners: bannerCount(seasons),
    wornCrown,
    helpSeen,
    depthOverride: settings.depthOverride,
    // `auto` follows THE TUTORIAL, which is what `depth.ts` has always documented. It used to
    // be handed `helpSeen` because there was no tutorial to follow; now there is one, it is
    // persisted, and it rides on this bundle. Off `helpSeen` a child was at full depth from
    // visit two — numerals, every spell page, trouble names, fast travel — while the box on
    // screen still read "Use W, A, S and D to walk." The ramp belongs to doing, not to
    // dismissing a card, and erring toward staying simple longer is the safe direction here.
    depth: realmDepth({ tutorialComplete: settings.tutorialStep >= TUTORIAL_STEPS.length, override: settings.depthOverride }),
    tutorialStep: settings.tutorialStep,
  };
}
