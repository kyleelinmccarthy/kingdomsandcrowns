"use server";

import { nanoid } from "nanoid";
import { eq, and, gte, lte, desc, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createActivity } from "@/lib/actions/activities";
import { getScheduledDates } from "@/lib/utils/schedule";
import { requireChildAccess, requireAssignmentAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";

export async function getAssignmentsForDate(childId: string, date: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
      subject: schema.subject,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .innerJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.date, date)
      )
    );
}

export async function getAssignmentsForDateRange(
  childId: string,
  startDate: string,
  endDate: string
) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
      subject: schema.subject,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .innerJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        gte(schema.questAssignment.date, startDate),
        lte(schema.questAssignment.date, endDate)
      )
    );
}

export async function createAssignment(data: {
  questId: string;
  childId: string;
  date: string;
}) {
  await requireAdultActor(); // assigning quests is a grown-up action
  await requireChildAccess(data.childId, { write: true });
  const id = nanoid();
  const now = new Date();
  await db.insert(schema.questAssignment).values({
    id,
    questId: data.questId,
    childId: data.childId,
    date: data.date,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

/**
 * Generates assignment rows from all active quest schedules for a child
 * within the given date range. Idempotent — skips dates that already
 * have an assignment for the same quest.
 */
export async function generateAssignmentsFromSchedules(
  childId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  await requireAdultActor(); // generating assignments is a grown-up action
  await requireChildAccess(childId, { write: true });
  // Get all active quests with schedules for this child
  const questsWithSchedules = await db
    .select({
      quest: schema.quest,
      schedule: schema.questSchedule,
    })
    .from(schema.quest)
    .innerJoin(schema.questSchedule, eq(schema.quest.id, schema.questSchedule.questId))
    .where(
      and(
        eq(schema.quest.childId, childId),
        eq(schema.quest.isActive, true)
      )
    );

  if (questsWithSchedules.length === 0) return 0;

  // Get existing assignments in the range to avoid duplicates
  const existingAssignments = await db
    .select({
      questId: schema.questAssignment.questId,
      date: schema.questAssignment.date,
    })
    .from(schema.questAssignment)
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        gte(schema.questAssignment.date, startDate),
        lte(schema.questAssignment.date, endDate)
      )
    );

  const existingSet = new Set(
    existingAssignments.map((a) => `${a.questId}:${a.date}`)
  );

  let created = 0;
  const now = new Date();

  for (const { quest, schedule } of questsWithSchedules) {
    const daysOfWeek = schedule.daysOfWeek
      ? (JSON.parse(schedule.daysOfWeek) as string[])
      : null;

    const dates = getScheduledDates(
      schedule.frequency,
      daysOfWeek,
      schedule.startDate,
      schedule.endDate,
      startDate,
      endDate
    );

    for (const date of dates) {
      const key = `${quest.id}:${date}`;
      if (existingSet.has(key)) continue;

      await db.insert(schema.questAssignment).values({
        id: nanoid(),
        questId: quest.id,
        childId,
        date,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
      existingSet.add(key);
      created++;
    }
  }

  return created;
}

export async function completeAssignment(
  assignmentId: string,
  activityData: {
    title?: string;
    description?: string;
    durationMinutes?: number;
    startedAt?: Date;
    endedAt?: Date;
    source?: "manual" | "timer";
  } = {}
) {
  await requireAssignmentAccess(assignmentId, { write: true });
  // Get the assignment to find quest/child details
  const rows = await db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Assignment not found");

  // Guard against double-completion — return existing activity if already done
  if (row.assignment.status === "completed" && row.assignment.activityLogId) {
    return { activityId: row.assignment.activityLogId };
  }

  // Create the activity log entry (this also updates XP/streak)
  const { id: activityId } = await createActivity({
    childId: row.assignment.childId,
    subjectId: row.quest.subjectId,
    title: activityData.title ?? row.quest.title,
    description: activityData.description,
    durationMinutes: activityData.durationMinutes,
    date: row.assignment.date,
    startedAt: activityData.startedAt,
    endedAt: activityData.endedAt,
    source: activityData.source,
  });

  // Link the activity to the assignment
  const now = new Date();
  await db
    .update(schema.questAssignment)
    .set({
      status: "completed",
      activityLogId: activityId,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.questAssignment.id, assignmentId));

  // Also set the questAssignmentId on the activity log
  await db
    .update(schema.activityLog)
    .set({ questAssignmentId: assignmentId, updatedAt: now })
    .where(eq(schema.activityLog.id, activityId));

  // Grant quest rewards
  if (row.quest.rewardXp) {
    await db
      .update(schema.child)
      .set({
        bonusXp: sql`${schema.child.bonusXp} + ${row.quest.rewardXp}`,
        currentXp: sql`${schema.child.currentXp} + ${row.quest.rewardXp}`,
        updatedAt: now,
      })
      .where(eq(schema.child.id, row.assignment.childId));
  }

  if (row.quest.rewardAvatarItem) {
    const reward = JSON.parse(row.quest.rewardAvatarItem) as { category: string; itemId: string };
    await db
      .insert(schema.childAvatarUnlock)
      .values({
        id: nanoid(),
        childId: row.assignment.childId,
        category: reward.category,
        itemId: reward.itemId,
        source: "quest_reward",
        sourceQuestId: row.quest.id,
        unlockedAt: now,
      })
      .onConflictDoNothing();
  }

  return { activityId };
}

export async function skipAssignment(assignmentId: string, notes?: string) {
  await requireAssignmentAccess(assignmentId, { write: true });
  const now = new Date();
  await db
    .update(schema.questAssignment)
    .set({
      status: "skipped",
      notes: notes ?? null,
      updatedAt: now,
    })
    .where(eq(schema.questAssignment.id, assignmentId));
}

export async function deleteAssignment(assignmentId: string) {
  await requireAssignmentAccess(assignmentId, { write: true });
  await db
    .delete(schema.questAssignment)
    .where(eq(schema.questAssignment.id, assignmentId));
}

/** Fetch completed assignments that had quest rewards attached */
export async function getEarnedQuestRewards(childId: string, limit = 10) {
  await requireChildAccess(childId);
  const hasReward = sql`(${schema.quest.rewardXp} IS NOT NULL OR ${schema.quest.rewardDescription} IS NOT NULL OR ${schema.quest.rewardAvatarItem} IS NOT NULL)`;

  return db
    .select({
      assignmentId: schema.questAssignment.id,
      completedAt: schema.questAssignment.completedAt,
      questTitle: schema.quest.title,
      rewardXp: schema.quest.rewardXp,
      rewardDescription: schema.quest.rewardDescription,
      rewardAvatarItem: schema.quest.rewardAvatarItem,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.status, "completed"),
        hasReward,
      )
    )
    .orderBy(desc(schema.questAssignment.completedAt))
    .limit(limit);
}
