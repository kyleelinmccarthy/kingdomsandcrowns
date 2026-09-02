import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { parseSchoolDays } from "@/lib/utils/schedule-days";
import {
  findStaleAssignmentIds,
  type PendingAssignmentRow,
} from "@/lib/utils/assignment-pruning";

/**
 * Keeps materialized quest assignments in step with the quests and schedules
 * that produced them.
 *
 * `generateAssignmentsFromSchedules` only ever *adds* rows, so before this
 * existed a removed quest — or a removed repeat — left its already-generated
 * `pending` rows sitting in Today's Quests and the dashboard's Upcoming
 * Quests forever. Everything here deletes only `pending` rows: completed and
 * skipped assignments are history the learning log reads back, and retiring a
 * quest must not erase what the hero already did.
 *
 * Plain module, not a "use server" action file — these are internal helpers,
 * and their callers have already authorized the quest/child.
 */

/** Pending rows the schedule generator would have created, joined to their quest's current schedule. */
async function loadPendingRows(where: SQL | undefined): Promise<PendingAssignmentRow[]> {
  const rows = await db
    .select({
      id: schema.questAssignment.id,
      questId: schema.questAssignment.questId,
      date: schema.questAssignment.date,
      questIsActive: schema.quest.isActive,
      scheduleId: schema.questSchedule.id,
      frequency: schema.questSchedule.frequency,
      daysOfWeek: schema.questSchedule.daysOfWeek,
      intervalWeeks: schema.questSchedule.intervalWeeks,
      scheduleStartDate: schema.questSchedule.startDate,
      scheduleEndDate: schema.questSchedule.endDate,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .leftJoin(schema.questSchedule, eq(schema.questSchedule.questId, schema.quest.id))
    .where(where);

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.questId,
    date: r.date,
    sourceIsActive: r.questIsActive,
    schedule: r.scheduleId
      ? {
          frequency: r.frequency!,
          daysOfWeek: r.daysOfWeek,
          intervalWeeks: r.intervalWeeks,
          startDate: r.scheduleStartDate!,
          endDate: r.scheduleEndDate,
        }
      : null,
  }));
}

/** The owning hero's school days — the same list assignment generation honors, so both agree on which dates a schedule covers. */
async function schoolDaysForQuest(questId: string): Promise<string[]> {
  const rows = await db
    .select({ schoolDays: schema.child.schoolDays })
    .from(schema.quest)
    .innerJoin(schema.child, eq(schema.quest.childId, schema.child.id))
    .where(eq(schema.quest.id, questId))
    .limit(1);
  return parseSchoolDays(rows[0]?.schoolDays);
}

async function deleteAssignments(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db.delete(schema.questAssignment).where(inArray(schema.questAssignment.id, ids));
  return ids.length;
}

/**
 * Drops every not-yet-actioned assignment for a quest from `fromDate` onward.
 * Used when the quest itself is removed, or when its repeat is switched off —
 * both mean "stop planning this", and neither should touch past history.
 */
export async function clearPendingAssignmentsForQuest(
  questId: string,
  fromDate: string
): Promise<number> {
  const rows = await db
    .delete(schema.questAssignment)
    .where(
      and(
        eq(schema.questAssignment.questId, questId),
        eq(schema.questAssignment.status, "pending"),
        gte(schema.questAssignment.date, fromDate)
      )
    )
    .returning({ id: schema.questAssignment.id });
  return rows.length;
}

/**
 * Re-checks a single quest's future pending assignments against its schedule
 * as it now reads, deleting the ones the schedule no longer calls for — so
 * narrowing a repeat (Mon/Wed → Tue) or capping it with an end date clears
 * the days that are no longer planned.
 */
export async function syncPendingAssignmentsToSchedule(
  questId: string,
  fromDate: string
): Promise<number> {
  const pending = await loadPendingRows(
    and(
      eq(schema.questAssignment.questId, questId),
      eq(schema.questAssignment.status, "pending"),
      gte(schema.questAssignment.date, fromDate)
    )
  );
  if (pending.length === 0) return 0;

  const rangeEnd = pending.reduce((max, r) => (r.date > max ? r.date : max), fromDate);
  const schoolDays = await schoolDaysForQuest(questId);
  const stale = findStaleAssignmentIds(pending, { rangeStart: fromDate, rangeEnd, schoolDays });
  return deleteAssignments(stale);
}

/**
 * Self-healing sweep run alongside assignment generation: over the window
 * being generated, deletes pending rows whose quest was removed or whose
 * schedule no longer covers that date. Catches rows stranded by a removal
 * that happened before this cleanup existed, and by any path that edits a
 * quest without going through the actions above.
 */
export async function pruneStaleAssignmentsInRange(
  childId: string,
  startDate: string,
  endDate: string,
  schoolDays: string[]
): Promise<number> {
  const pending = await loadPendingRows(
    and(
      eq(schema.questAssignment.childId, childId),
      eq(schema.questAssignment.status, "pending"),
      gte(schema.questAssignment.date, startDate),
      lte(schema.questAssignment.date, endDate)
    )
  );
  if (pending.length === 0) return 0;

  const stale = findStaleAssignmentIds(pending, {
    rangeStart: startDate,
    rangeEnd: endDate,
    schoolDays,
  });
  return deleteAssignments(stale);
}
