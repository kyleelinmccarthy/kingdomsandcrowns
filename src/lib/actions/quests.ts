"use server";

import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { todayInZone } from "@/lib/utils/dates";
import { requireChildAccess, requireQuestAccess } from "@/lib/auth/access";
import { clearPendingAssignmentsForQuest } from "@/lib/services/quest-assignment-sync";
import { getTimezoneForChild } from "@/lib/services/family-timezone";

export async function getQuests(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      quest: schema.quest,
      hasSchedule: sql<boolean>`${schema.questSchedule.id} is not null`,
    })
    .from(schema.quest)
    .leftJoin(schema.questSchedule, eq(schema.questSchedule.questId, schema.quest.id))
    .where(and(eq(schema.quest.childId, childId), eq(schema.quest.isActive, true)));
  return rows.map((r) => ({ ...r.quest, hasSchedule: r.hasSchedule }));
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
  includeInLearningLog?: boolean;
  requireNotes?: boolean;
  schedule?: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek?: string[];
    intervalWeeks?: number;
    startDate: string;
    endDate?: string;
  };
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
    includeInLearningLog: data.includeInLearningLog ?? true,
    requireNotes: data.requireNotes ?? false,
    sortOrder: maxSort + 1,
    createdAt: now,
    updatedAt: now,
  });

  if (data.schedule) {
    const isWeekly = data.schedule.frequency === "weekly";
    await db.insert(schema.questSchedule).values({
      id: nanoid(),
      questId: id,
      frequency: data.schedule.frequency,
      daysOfWeek: isWeekly && data.schedule.daysOfWeek ? JSON.stringify(data.schedule.daysOfWeek) : null,
      intervalWeeks: isWeekly ? (data.schedule.intervalWeeks ?? 1) : null,
      startDate: data.schedule.startDate,
      endDate: data.schedule.endDate ?? null,
      createdAt: now,
    });
  }

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
    includeInLearningLog?: boolean;
    requireNotes?: boolean;
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
  if (data.includeInLearningLog !== undefined)
    updates.includeInLearningLog = data.includeInLearningLog;
  if (data.requireNotes !== undefined) updates.requireNotes = data.requireNotes;
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
  const { childId } = await requireQuestAccess(questId, { write: true });
  await db
    .update(schema.quest)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.quest.id, questId));

  // Deactivating the quest keeps it out of the Quest Giver and the "Start a
  // Quest" list, but the scheduler has already materialized assignment rows
  // for today and the days ahead — those have to go too, or the removed quest
  // keeps showing up in Today's Quests and the dashboard's Upcoming Quests.
  // Only pending rows from today forward: completed/skipped assignments are
  // the hero's history and stay in the learning log.
  const timeZone = await getTimezoneForChild(childId);
  await clearPendingAssignmentsForQuest(questId, todayInZone(timeZone));
}
