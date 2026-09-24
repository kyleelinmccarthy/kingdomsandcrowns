"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings, loadRealmFlags } from "@/lib/services/realm-play";
import { loadKingdomOverview } from "@/lib/services/deeds";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadSpellbookPages, ensureStarterSpell, type SpellPage } from "@/lib/services/spells";
import { loadUnlockedMountIds } from "@/lib/services/mounts";
import { loadSeasons } from "@/lib/services/crowns";
import { bannerCount, pendingCeremony, seasonLabel } from "@/lib/utils/seasons";
import { crownById, type CrownTier } from "@/lib/utils/crown-catalog";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import { profileFromRow, type LearningProfile } from "@/lib/utils/learning-profile";
import { isValidAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { realmDepth, type DepthOverride, type RealmDepth } from "@/lib/realm/depth";
import { tutorialLearned } from "@/lib/realm3d/tutorial";
import { loadRealmSound } from "@/lib/services/realm-sound";
import { DEFAULT_SOUND, type SoundSettings } from "@/lib/realm3d/sound/settings";
import { loadPlacesFound } from "@/lib/services/realm-places";
import type { RealmAccessMode } from "@/lib/utils/realm-access";

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
  /** Tutorial progress as stored: the flat Realm's 0..4, the 3D lessons above (`lib/realm3d/tutorial.ts`). */
  tutorialStep: number;
  /** The 3D Realm's sound settings for whoever is looking: the hero's own, or a visiting grown-up's own. */
  sound?: SoundSettings;
  /**
   * May whoever is looking change this child's Realm (`setRealmDepth`, `updateRealmSettings`)?
   * The hero on their own Realm, and a grown-up with edit rights; never a view-only member (a
   * teacher, say), whose writes the server refuses. Their own sound needs no write access, so it
   * is not gated by this. Always set by `getRealmBundle`; optional only so hand-built bundles in
   * tests need not carry it.
   */
  canEdit?: boolean;
  /**
   * The places of the 3D Realm this hero has found (`realm_place_found`): the one record behind
   * the HUD's count, the minimap's filled marks and fast travel. Optional only so hand-built
   * bundles in tests need not carry it; `getRealmBundle` always sets it.
   */
  placesFound?: string[];
  /**
   * What the earning copy needs (`earningLines` in `lib/realm/spells/bounty.ts`), from the
   * settings row already read here — no extra query. Always set by `getRealmBundle`.
   */
  earning?: {
    enabled: boolean;
    accessMode: RealmAccessMode;
    earnedMinutesPerQuest: number;
    dailyCapMinutes: number;
    troubleBonusCapMinutes: number;
  };
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
  // In flight alongside everything below; a failed read is the defaults, never a closed Realm.
  const soundRead = loadRealmSound(childId, isChildActor(access) ? null : access.userId).catch(() => ({ ...DEFAULT_SOUND }));
  // Likewise: a failed read is "nothing found yet on this load", never a closed Realm. The
  // client keeps its own unsaved finds and merges the server's answer on its next save.
  const placesRead = loadPlacesFound(childId).catch((err: unknown) => {
    console.error("Realm places failed to load", err);
    return [] as string[];
  });
  // Also hands back the flags it read (post-update), so the parallel batch below does not
  // pay a second `loadRealmFlags` round trip just to read `helpSeenAt`. On the (rare) failure
  // path, fall back to a direct read so a starter-spell hiccup never misreports `helpSeen`.
  const flags = await ensureStarterSpell(childId)
    .then((result) => result.flags)
    .catch(async (err: unknown) => {
      console.error("Starter spell failed", err);
      return loadRealmFlags(childId);
    });
  const [childRows, castleRows, profileRow, settings, kingdomResult, spellbook, mounts, seasons] = await Promise.all([
    db.select({ displayName: schema.child.displayName, avatarConfig: schema.child.avatarConfig }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ type: schema.castle.type }).from(schema.castle).where(eq(schema.castle.childId, childId)).limit(1),
    // Memoized per request; loadKingdomOverview below reads the same row for the hero's grades.
    loadLearningProfileRow(childId),
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
    profile: profileFromRow(profileRow),
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
    // Either tutorial finished counts (`tutorialLearned`): the flat one's 4, or every 3D lesson.
    depth: realmDepth({ tutorialComplete: tutorialLearned(settings.tutorialStep), override: settings.depthOverride }),
    tutorialStep: settings.tutorialStep,
    sound: await soundRead,
    canEdit: access.permission === "edit",
    placesFound: await placesRead,
    earning: {
      enabled: settings.enabled,
      accessMode: settings.accessMode,
      earnedMinutesPerQuest: settings.earnedMinutesPerQuest,
      dailyCapMinutes: settings.dailyCapMinutes,
      troubleBonusCapMinutes: settings.troubleBonusCapMinutes,
    },
  };
}
