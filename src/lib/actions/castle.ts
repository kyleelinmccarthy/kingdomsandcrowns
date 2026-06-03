"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { nanoid } from "nanoid";
import { CASTLE_TYPES } from "@/lib/utils/avatar-catalog";

export async function getCastle(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select()
    .from(schema.castle)
    .where(eq(schema.castle.childId, childId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadOwnedChild(childId: string) {
  await requireChildAccess(childId, { write: true });
  const childRows = await db
    .select()
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!childRows[0]) throw new Error("Child not found.");
  return childRows[0];
}

export async function initializeCastle(childId: string) {
  const child = await loadOwnedChild(childId);

  const level = Math.floor(child.currentXp / 100) + 1;
  if (level < 50) throw new Error("Must be level 50 to unlock a castle.");

  // Check if castle already exists
  const existing = await db
    .select()
    .from(schema.castle)
    .where(eq(schema.castle.childId, childId))
    .limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  const castle = {
    id: nanoid(),
    childId,
    type: "campsite",
    name: `${child.displayName}'s Castle`,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.castle).values(castle);
  revalidatePath("/castle");
  return castle;
}

export async function upgradeCastle(childId: string, newType: string) {
  const child = await loadOwnedChild(childId);

  const level = Math.floor(child.currentXp / 100) + 1;

  const castleType = CASTLE_TYPES.find((t) => t.id === newType);
  if (!castleType) throw new Error("Invalid castle type.");
  if (level < castleType.levelRequired) {
    throw new Error(`Must be level ${castleType.levelRequired} to upgrade to ${castleType.label}.`);
  }

  await db
    .update(schema.castle)
    .set({ type: newType, updatedAt: new Date() })
    .where(eq(schema.castle.childId, childId));

  revalidatePath("/castle");
}

export async function renameCastle(childId: string, newName: string) {
  await requireChildAccess(childId, { write: true });

  const trimmed = newName.trim().slice(0, 50);
  if (!trimmed) throw new Error("Castle name cannot be empty.");

  await db
    .update(schema.castle)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(schema.castle.childId, childId));

  revalidatePath("/castle");
}
