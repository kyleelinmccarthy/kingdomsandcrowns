"use server";

import { nanoid } from "nanoid";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { hasMeaningfulNotes, sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";
import { computeStreak } from "@/lib/utils/streak";
import { parseSchoolDays, parseStreakOptionalDays } from "@/lib/utils/schedule-days";
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

  if (durationMinutes === null || durationMinutes < 1) {
    throw new Error("How long did this take? Enter a duration to complete it.");
  }

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

/**
 * Edit a chronicled quest after the fact — its duration, its Scribe's Notes,
 * or both. A hero can annotate their own history here (requireChildAccess
 * admits a child acting on their own profile), which is the point: notes are
 * often easier to write once the quest is actually done.
 *
 * For a quest-backed activity the notes live in two places — the activity's
 * `description` and the assignment's `notes`, which is what the learning log
 * reads (see completeAssignment). An edit has to land on both or the two
 * drift apart.
 */
export async function updateActivity(
  activityId: string,
  data: { durationMinutes?: number; description?: string }
) {
  await requireActivityAccess(activityId, { write: true });

  const updates: { durationMinutes?: number; description?: string | null } = {};

  if (data.durationMinutes !== undefined) {
    const durationMinutes = Math.round(data.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      throw new Error("Duration must be at least 1 minute");
    }
    updates.durationMinutes = durationMinutes;
  }

  const notes =
    data.description === undefined ? undefined : sanitizeText(data.description) || null;
  if (notes !== undefined) updates.description = notes;

  if (Object.keys(updates).length === 0) return;

  const linked =
    notes === undefined
      ? []
      : await db
          .select({
            assignmentId: schema.questAssignment.id,
            requireNotes: schema.quest.requireNotes,
          })
          .from(schema.activityLog)
          .innerJoin(
            schema.questAssignment,
            eq(schema.questAssignment.id, schema.activityLog.questAssignmentId),
          )
          .innerJoin(schema.quest, eq(schema.quest.id, schema.questAssignment.questId))
          .where(eq(schema.activityLog.id, activityId))
          .limit(1);

  // Editing must not be a way to strip notes a quest insists on having.
  if (notes !== undefined && !hasMeaningfulNotes(notes) && linked[0]?.requireNotes) {
    throw new Error("Scribe's Notes are required for this quest — describe what was done");
  }

  const now = new Date();
  await db
    .update(schema.activityLog)
    .set({ ...updates, updatedAt: now })
    .where(eq(schema.activityLog.id, activityId));

  if (linked[0]) {
    await db
      .update(schema.questAssignment)
      .set({ notes, updatedAt: now })
      .where(eq(schema.questAssignment.id, linked[0].assignmentId));
  }
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
  const today = new Date();
  // Look back at most a year (the streak cap) and derive the streak from the
  // distinct active days in memory — one query instead of up to 365.
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 365);

  const [activeDays, totalCount, childRow, breaks] = await Promise.all([
    db
      .select({ date: schema.activityLog.date })
      .from(schema.activityLog)
      .where(
        and(
          eq(schema.activityLog.childId, childId),
          gte(schema.activityLog.date, formatDate(windowStart)),
        ),
      )
      .groupBy(schema.activityLog.date),
    // Count total activities for XP (10 XP per activity)
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId)),
    // Current child data (longest streak + bonus XP from quest rewards)
    db
      .select({
        longestStreak: schema.child.longestStreak,
        bonusXp: schema.child.bonusXp,
        schoolDays: schema.child.schoolDays,
        streakOptionalDays: schema.child.streakOptionalDays,
      })
      .from(schema.child)
      .where(eq(schema.child.id, childId))
      .limit(1),
    // Days off in the same look-back window: skipped rather than streak-breaking.
    db
      .select({
        startDate: schema.schoolBreak.startDate,
        endDate: schema.schoolBreak.endDate,
      })
      .from(schema.schoolBreak)
      .innerJoin(schema.child, eq(schema.child.familyId, schema.schoolBreak.familyId))
      .where(
        and(
          eq(schema.child.id, childId),
          gte(schema.schoolBreak.endDate, formatDate(windowStart)),
        ),
      ),
  ]);

  // Days where nothing is expected — days off, optional days, breaks — must
  // not reset the streak.
  const streak = computeStreak(
    activeDays.map((row) => row.date),
    today,
    {
      schoolDays: parseSchoolDays(childRow[0]?.schoolDays),
      optionalDays: parseStreakOptionalDays(childRow[0]?.streakOptionalDays),
      breaks,
    },
  );

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
