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
  BACKGROUNDS,
  type AvatarConfig,
} from "@/lib/utils/avatar-catalog";

export async function updateAvatarConfig(childId: string, config: AvatarConfig) {
  if (!isValidAvatarConfig(config)) {
    throw new Error("Invalid avatar configuration.");
  }

  const { familyId } = await requireChildAccess(childId, { write: true });

  // Fetch child to check level and badges for unlock validation
  const childRows = await db
    .select()
    .from(schema.child)
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId)))
    .limit(1);

  const child = childRows[0];
  if (!child) throw new Error("Child not found.");

  const level = Math.floor(child.currentXp / 100) + 1;

  const earnedBadges = await db
    .select({ badgeId: schema.childBadge.badgeId })
    .from(schema.childBadge)
    .where(eq(schema.childBadge.childId, childId));

  const earnedBadgeIds = earnedBadges.map((b) => b.badgeId);

  // Fetch quest-unlocked avatar items
  const questUnlocks = await db
    .select({ itemId: schema.childAvatarUnlock.itemId })
    .from(schema.childAvatarUnlock)
    .where(eq(schema.childAvatarUnlock.childId, childId));
  const questUnlockedItems = new Set(questUnlocks.map((u) => u.itemId));

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

  const items = [skinItem, hairItem, outfitItem, legwearItem, bootsItem, bgItem, accItem, compItem].filter(Boolean);
  for (const item of items) {
    if (!isUnlocked(item!, level, earnedBadgeIds, questUnlockedItems)) {
      throw new Error(`Item "${item!.label}" is locked.`);
    }
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
