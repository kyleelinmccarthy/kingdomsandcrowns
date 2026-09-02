import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  findStaleAssignmentIds,
  type PendingAssignmentRow,
} from "@/lib/utils/assignment-pruning";

/**
 * Keeps materialized upkeep assignments in step with the tasks and schedules
 * that produced them. The upkeep counterpart of quest-assignment-sync.ts.
 *
 * Everything here deletes only `pending` rows. A completed row is history the
 * wage ledger points at, and an excused row is a decision a parent made — both
 * must survive a task being retired or its repeat narrowed.
 *
 * Plain module, not a "use server" action file: these are internal helpers and
 * their callers have already authorized the task or child.
 *
 * Structurally parallel to the quest sync service. That duplication is
 * deliberate — the decision logic is shared through findStaleAssignmentIds,
 * and making the Drizzle table access generic would cost far more in
 * unreadable types than the repetition saves.
 */

/** Pending rows joined to their task's schedule as it currently reads. */
async function loadPendingRows(where: SQL | undefined): Promise<PendingAssignmentRow[]> {
  const rows = await db
    .select({
      id: schema.upkeepTaskAssignment.id,
      taskId: schema.upkeepTaskAssignment.taskId,
      date: schema.upkeepTaskAssignment.date,
      taskIsActive: schema.upkeepTask.isActive,
      scheduleId: schema.upkeepTaskSchedule.id,
      frequency: schema.upkeepTaskSchedule.frequency,
      daysOfWeek: schema.upkeepTaskSchedule.daysOfWeek,
      intervalWeeks: schema.upkeepTaskSchedule.intervalWeeks,
      scheduleStartDate: schema.upkeepTaskSchedule.startDate,
      scheduleEndDate: schema.upkeepTaskSchedule.endDate,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .leftJoin(
      schema.upkeepTaskSchedule,
      eq(schema.upkeepTaskSchedule.taskId, schema.upkeepTask.id)
    )
    .where(where);

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.taskId,
    date: r.date,
    sourceIsActive: r.taskIsActive,
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

async function deleteAssignments(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db
    .delete(schema.upkeepTaskAssignment)
    .where(inArray(schema.upkeepTaskAssignment.id, ids));
  return ids.length;
}

/** Drops every not-yet-actioned assignment for a task from `fromDate` onward. */
export async function clearPendingUpkeepAssignmentsForTask(
  taskId: string,
  fromDate: string
): Promise<number> {
  const rows = await db
    .delete(schema.upkeepTaskAssignment)
    .where(
      and(
        eq(schema.upkeepTaskAssignment.taskId, taskId),
        eq(schema.upkeepTaskAssignment.status, "pending"),
        gte(schema.upkeepTaskAssignment.date, fromDate)
      )
    )
    .returning({ id: schema.upkeepTaskAssignment.id });
  return rows.length;
}

/**
 * Re-checks one task's future pending assignments against its schedule as it
 * now reads, so narrowing a repeat clears the days no longer planned.
 */
export async function syncPendingUpkeepAssignmentsToSchedule(
  taskId: string,
  fromDate: string
): Promise<number> {
  const pending = await loadPendingRows(
    and(
      eq(schema.upkeepTaskAssignment.taskId, taskId),
      eq(schema.upkeepTaskAssignment.status, "pending"),
      gte(schema.upkeepTaskAssignment.date, fromDate)
    )
  );
  if (pending.length === 0) return 0;

  const rangeEnd = pending.reduce((max, r) => (r.date > max ? r.date : max), fromDate);
  // schoolDays is null for chores: they are planned on every day their pattern
  // names, so pruning must use the same rule generation did.
  const stale = findStaleAssignmentIds(pending, {
    rangeStart: fromDate,
    rangeEnd,
    schoolDays: null,
  });
  return deleteAssignments(stale);
}

/** Self-healing sweep run alongside generation over the window being generated. */
export async function pruneStaleUpkeepAssignmentsInRange(
  childId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const pending = await loadPendingRows(
    and(
      eq(schema.upkeepTaskAssignment.childId, childId),
      eq(schema.upkeepTaskAssignment.status, "pending"),
      gte(schema.upkeepTaskAssignment.date, startDate),
      lte(schema.upkeepTaskAssignment.date, endDate)
    )
  );
  if (pending.length === 0) return 0;

  const stale = findStaleAssignmentIds(pending, {
    rangeStart: startDate,
    rangeEnd: endDate,
    schoolDays: null,
  });
  return deleteAssignments(stale);
}
