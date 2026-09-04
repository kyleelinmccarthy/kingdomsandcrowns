"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { profileFromRow, type LearningProfile } from "@/lib/utils/learning-profile";
import { isValidAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/utils/avatar-catalog";

export type RealmBundle = {
  heroName: string;
  avatarConfig: AvatarConfig | null;
  castleType: string;
  builtBuildingIds: string[];
  profile: LearningProfile;
  settings: { enabled: boolean; toneMode: "gentle" | "monsters" };
};

/** Everything the Realm page needs, in one round of parallel reads. A hero may read their own. */
export async function getRealmBundle(childId: string): Promise<RealmBundle> {
  await requireChildAccess(childId);
  const [childRows, castleRows, progressRows, profileRows, settings] = await Promise.all([
    db.select({ displayName: schema.child.displayName, avatarConfig: schema.child.avatarConfig }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ type: schema.castle.type }).from(schema.castle).where(eq(schema.castle.childId, childId)).limit(1),
    db.select({ buildingId: schema.kingdomProgress.buildingId }).from(schema.kingdomProgress).where(and(eq(schema.kingdomProgress.childId, childId), isNotNull(schema.kingdomProgress.completedAt))),
    db.select().from(schema.learningProfile).where(eq(schema.learningProfile.childId, childId)).limit(1),
    loadRealmSettings(childId),
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
    builtBuildingIds: progressRows.map((p) => p.buildingId),
    profile: profileFromRow(profileRows[0] ?? null),
    settings: { enabled: settings.enabled, toneMode: settings.toneMode },
  };
}
