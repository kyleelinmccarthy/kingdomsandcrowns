import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { levelFromXp } from "@/lib/utils/level";
import { isUnlocked, MOUNTS } from "@/lib/utils/avatar-catalog";

/** Ids of the mounts this hero may ride, from level, badges, and quest rewards. */
export async function loadUnlockedMountIds(childId: string): Promise<string[]> {
  const [childRows, badges, unlocks] = await Promise.all([
    db.select({ currentXp: schema.child.currentXp }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ badgeId: schema.childBadge.badgeId }).from(schema.childBadge).where(eq(schema.childBadge.childId, childId)),
    db.select({ itemId: schema.childAvatarUnlock.itemId }).from(schema.childAvatarUnlock).where(eq(schema.childAvatarUnlock.childId, childId)),
  ]);
  if (!childRows[0]) throw new Error("Hero not found.");
  const level = levelFromXp(childRows[0].currentXp);
  const badgeIds = badges.map((b) => b.badgeId);
  const questIds = new Set(unlocks.map((u) => u.itemId));
  return MOUNTS.filter((m) => isUnlocked(m, level, badgeIds, questIds)).map((m) => m.id);
}
