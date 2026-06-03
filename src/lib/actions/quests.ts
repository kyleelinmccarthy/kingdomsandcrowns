"use server";

import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { requireChildAccess, requireQuestAccess } from "@/lib/auth/access";

export async function getQuests(childId: string) {
  await requireChildAccess(childId);
  return db
    .select()
    .from(schema.quest)
    .where(and(eq(schema.quest.childId, childId), eq(schema.quest.isActive, true)));
}

export async function getQuest(questId: string) {
  try {
    await requireQuestAccess(questId);
  } catch {
    return null;
  }
  const rows = await db
    .select()
    .from(schema.quest)
    .where(eq(schema.quest.id, questId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createQuest(data: {
  childId: string;
  subjectId: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  rewardXp?: number;
  rewardDescription?: string;
  rewardAvatarItem?: string; // JSON: { category, itemId }
}) {
  await requireChildAccess(data.childId, { write: true });
  const id = nanoid();
  const title = sanitizeName(data.title);
  if (!title) throw new Error("Quest title is required");

  const existing = await db
    .select({ sortOrder: schema.quest.sortOrder })
    .from(schema.quest)
    .where(eq(schema.quest.childId, data.childId));
  const maxSort = existing.reduce((max, q) => Math.max(max, q.sortOrder), -1);

  const now = new Date();
  await db.insert(schema.quest).values({
    id,
    childId: data.childId,
    subjectId: data.subjectId,
    title,
    description: data.description ? sanitizeText(data.description) : null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    rewardXp: data.rewardXp ?? null,
    rewardDescription: data.rewardDescription ? sanitizeText(data.rewardDescription, 500) : null,
    rewardAvatarItem: data.rewardAvatarItem ?? null,
    isActive: true,
    sortOrder: maxSort + 1,
    createdAt: now,
    updatedAt: now,
  });

  return { id, title };
}

export async function updateQuest(
  questId: string,
  data: {
    title?: string;
    description?: string;
    subjectId?: string;
    estimatedMinutes?: number;
    isActive?: boolean;
    rewardXp?: number | null;
    rewardDescription?: string | null;
    rewardAvatarItem?: string | null;
  }
) {
  await requireQuestAccess(questId, { write: true });
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title) updates.title = sanitizeName(data.title);
  if (data.description !== undefined)
    updates.description = data.description ? sanitizeText(data.description) : null;
  if (data.subjectId) updates.subjectId = data.subjectId;
  if (data.estimatedMinutes !== undefined) updates.estimatedMinutes = data.estimatedMinutes;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.rewardXp !== undefined) updates.rewardXp = data.rewardXp;
  if (data.rewardDescription !== undefined)
    updates.rewardDescription = data.rewardDescription ? sanitizeText(data.rewardDescription, 500) : null;
  if (data.rewardAvatarItem !== undefined) updates.rewardAvatarItem = data.rewardAvatarItem;

  await db
    .update(schema.quest)
    .set(updates)
    .where(eq(schema.quest.id, questId));
}

export async function deleteQuest(questId: string) {
  await requireQuestAccess(questId, { write: true });
  await db
    .update(schema.quest)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.quest.id, questId));
}
