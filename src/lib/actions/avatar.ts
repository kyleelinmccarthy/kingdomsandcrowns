"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import {
  isValidAvatarConfig,
  isUnlocked,
  SKIN_TONES,
  HAIR_STYLES,
  OUTFITS,
  LEGWEAR,
  BOOTS,
  ACCESSORIES,
  COMPANIONS,
  MOUNTS,
  BACKGROUNDS,
  type AvatarConfig,
} from "@/lib/utils/avatar-catalog";
import { levelFromXp } from "@/lib/utils/level";
import { loadSeasons } from "@/lib/services/crowns";
import { crownChoices, wearableCrownIds } from "@/lib/utils/seasons";

/** What decides which avatar items are unlocked for a hero: their level, their badges and their quest unlocks. */
async function unlockFacts(childId: string, familyId: string) {
  const [childRows, badges, unlocks] = await Promise.all([
    db.select().from(schema.child).where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId))).limit(1),
    db.select({ badgeId: schema.childBadge.badgeId }).from(schema.childBadge).where(eq(schema.childBadge.childId, childId)),
    db.select({ itemId: schema.childAvatarUnlock.itemId }).from(schema.childAvatarUnlock).where(eq(schema.childAvatarUnlock.childId, childId)),
  ]);
  const child = childRows[0];
  if (!child) throw new Error("Child not found.");
  return {
    level: levelFromXp(child.currentXp),
    earnedBadgeIds: badges.map((b) => b.badgeId),
    questUnlockedItems: unlocks.map((u) => u.itemId),
  };
}

/**
 * What the Realm's wardrobe may offer (`components/realm3d/wardrobe.tsx`): the same facts a save
 * is checked against, and the crowns of the hero's finished seasons. Read only — no season is
 * opened here, as the Tavern's `getSeasons` does.
 */
export async function getWardrobe(childId: string) {
  const { familyId } = await requireChildAccess(childId);
  const [facts, seasons] = await Promise.all([unlockFacts(childId, familyId), loadSeasons(childId)]);
  return { ...facts, crowns: crownChoices(seasons.filter((s) => s.completedAt !== null)) };
}

export async function updateAvatarConfig(childId: string, config: AvatarConfig) {
  if (!isValidAvatarConfig(config)) {
    throw new Error("Invalid avatar configuration.");
  }

  const { familyId } = await requireChildAccess(childId, { write: true });

  const facts = await unlockFacts(childId, familyId);
  const { level, earnedBadgeIds } = facts;
  const questUnlockedItems = new Set(facts.questUnlockedItems);

  // Validate all selected items are unlocked
  const skinItem = SKIN_TONES.find((s) => s.id === config.skinTone);
  const hairItem = HAIR_STYLES.find((h) => h.id === config.hairStyle);
  const outfitItem = OUTFITS.find((o) => o.id === config.outfit);
  const legwearItem = LEGWEAR.find((l) => l.id === config.legwear);
  const bootsItem = BOOTS.find((b) => b.id === config.boots);
  const bgItem = BACKGROUNDS.find((b) => b.id === config.background);
  const accItem = config.accessory
    ? ACCESSORIES.find((a) => a.id === config.accessory)
    : null;
  const compItem = config.companion
    ? COMPANIONS.find((c) => c.id === config.companion)
    : null;
  const mountItem = config.mount ? MOUNTS.find((m) => m.id === config.mount) : null;

  const items = [skinItem, hairItem, outfitItem, legwearItem, bootsItem, bgItem, accItem, compItem, mountItem].filter(Boolean);
  for (const item of items) {
    if (!isUnlocked(item!, level, earnedBadgeIds, questUnlockedItems)) {
      throw new Error(`Item "${item!.label}" is locked.`);
    }
  }

  // A crown is earned by finishing a season, never by level or badge.
  if (config.crown) {
    const wearable = wearableCrownIds(await loadSeasons(childId));
    if (!wearable.has(config.crown)) throw new Error("That crown is not yours yet.");
  }

  await db
    .update(schema.child)
    .set({
      avatarConfig: JSON.stringify(config),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId)));

  revalidatePath("/tavern");
  revalidatePath("/loot");
  revalidatePath("/settings");
}

export async function getChildAvatarUnlocks(childId: string) {
  await requireChildAccess(childId);
  return db
    .select({
      itemId: schema.childAvatarUnlock.itemId,
      category: schema.childAvatarUnlock.category,
    })
    .from(schema.childAvatarUnlock)
    .where(eq(schema.childAvatarUnlock.childId, childId));
}
