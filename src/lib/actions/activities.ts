"use server";

import { nanoid } from "nanoid";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";
import { requireChildAccess, requireActivityAccess } from "@/lib/auth/access";

export async function getActivities(childId: string, date?: string) {
  await requireChildAccess(childId);
  const targetDate = date ?? formatDate(new Date());
  return db
    .select()
    .from(schema.activityLog)
    .where(
      and(
        eq(schema.activityLog.childId, childId),
        eq(schema.activityLog.date, targetDate),
      )
    )
    .orderBy(desc(schema.activityLog.createdAt));
}

export async function getRecentActivities(childId: string, limit = 20) {
  await requireChildAccess(childId);
  return db
    .select()
    .from(schema.activityLog)
    .where(eq(schema.activityLog.childId, childId))
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(limit);
}

export async function getActivityStats(childId: string, startDate: string, endDate: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      subjectId: schema.activityLog.subjectId,
      totalMinutes: sql<number>`sum(${schema.activityLog.durationMinutes})`,
      count: sql<number>`count(*)`,
    })
    .from(schema.activityLog)
    .where(
      and(
        eq(schema.activityLog.childId, childId),
        gte(schema.activityLog.date, startDate),
        lte(schema.activityLog.date, endDate),
      )
    )
    .groupBy(schema.activityLog.subjectId);
  return rows;
}

export async function getWeeklyDayCounts(childId: string, startDate: string, endDate: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      date: schema.activityLog.date,
      count: sql<number>`count(*)`,
    })
    .from(schema.activityLog)
    .where(
      and(
        eq(schema.activityLog.childId, childId),
        gte(schema.activityLog.date, startDate),
        lte(schema.activityLog.date, endDate),
      )
    )
    .groupBy(schema.activityLog.date);
  return rows;
}

export async function createActivity(data: {
  childId: string;
  subjectId: string;
  title: string;
  description?: string;
  durationMinutes?: number;
  date?: string;
  startedAt?: Date;
  endedAt?: Date;
  source?: "manual" | "timer";
}) {
  await requireChildAccess(data.childId, { write: true });
  const id = nanoid();
  const title = sanitizeName(data.title);
  if (!title) throw new Error("Title is required");
  const now = new Date();

  // If timer timestamps provided, compute duration from them
  const durationMinutes =
    data.startedAt && data.endedAt
      ? Math.max(1, Math.round((data.endedAt.getTime() - data.startedAt.getTime()) / 60000))
      : data.durationMinutes ?? null;

  await db.insert(schema.activityLog).values({
    id,
    childId: data.childId,
    subjectId: data.subjectId,
    date: data.date ?? formatDate(now),
    title,
    description: data.description ? sanitizeText(data.description) : null,
    durationMinutes,
    startedAt: data.startedAt ?? null,
    endedAt: data.endedAt ?? null,
    source: data.source ?? "manual",
    syncStatus: "synced",
    createdAt: now,
    updatedAt: now,
  });

  // Update streak and XP
  await updateStreakAndXp(data.childId);

  return { id, title };
}

export async function deleteActivity(activityId: string) {
  await requireActivityAccess(activityId, { write: true });
  const rows = await db
    .select({ childId: schema.activityLog.childId })
    .from(schema.activityLog)
    .where(eq(schema.activityLog.id, activityId))
    .limit(1);

  await db.delete(schema.activityLog).where(eq(schema.activityLog.id, activityId));

  if (rows[0]) {
    await updateStreakAndXp(rows[0].childId);
  }
}

async function updateStreakAndXp(childId: string) {
  // Calculate current streak
  const today = new Date();
  let streak = 0;
  let checkDate = new Date(today);

  for (let i = 0; i < 365; i++) {
    const dateStr = formatDate(checkDate);
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.activityLog)
      .where(and(eq(schema.activityLog.childId, childId), eq(schema.activityLog.date, dateStr)));

    if (count[0].count > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // Allow today to not have activities yet
      if (i === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      break;
    }
  }

  // Count total activities for XP (10 XP per activity)
  const totalCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.activityLog)
    .where(eq(schema.activityLog.childId, childId));

  // Get current child data (longest streak + bonus XP from quest rewards)
  const childRow = await db
    .select({
      longestStreak: schema.child.longestStreak,
      bonusXp: schema.child.bonusXp,
    })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);

  const longestStreak = Math.max(streak, childRow[0]?.longestStreak ?? 0);
  const bonusXp = childRow[0]?.bonusXp ?? 0;
  const xp = totalCount[0].count * 10 + bonusXp;

  await db
    .update(schema.child)
    .set({
      currentStreak: streak,
      longestStreak,
      currentXp: xp,
      lastActiveDate: formatDate(today),
      updatedAt: new Date(),
    })
    .where(eq(schema.child.id, childId));
}
