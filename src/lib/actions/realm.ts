"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadKingdomOverview } from "@/lib/services/deeds";
import { loadSpellbookPages, type SpellPage } from "@/lib/services/spells";
import { loadUnlockedMountIds } from "@/lib/services/mounts";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import { profileFromRow, type LearningProfile } from "@/lib/utils/learning-profile";
import { isValidAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/utils/avatar-catalog";

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
  await requireChildAccess(childId);
  const [childRows, castleRows, profileRows, settings, kingdomResult, spellbook, mounts] = await Promise.all([
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
  };
}
