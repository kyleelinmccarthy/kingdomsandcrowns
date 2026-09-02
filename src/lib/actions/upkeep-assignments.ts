"use server";

import { nanoid } from "nanoid";
import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { loadUpkeepContext } from "@/lib/services/upkeep-context";
import { pruneStaleUpkeepAssignmentsInRange } from "@/lib/services/upkeep-assignment-sync";
import { assignmentKey, planUpkeepAssignments } from "@/lib/utils/upkeep-planning";
import { addDays } from "@/lib/utils/dates";

/** How far back the "still owing" list looks. Beyond this, a missed chore is history. */
const OUTSTANDING_LOOKBACK_DAYS = 30;

/**
 * Idempotent housekeeping that materializes recurring tasks into assignment
 * rows for a window. Runs on page load, so a hero viewing their own data must
 * be able to trigger it — requireChildAccess covers both in-scope adults and a
 * child acting for themself.
 *
 * Returns 0 without writing anything when the module is off, rather than
 * throwing: page loads call it unconditionally.
 */
export async function generateUpkeepAssignments(
  childId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  await requireChildAccess(childId, { write: true });

  const context = await loadUpkeepContext(childId);
  if (!context?.enabled) return 0;

  // Generation only ever adds rows, so a retired task or a narrowed repeat
  // would otherwise leave the days it had already planned sitting in the list.
  await pruneStaleUpkeepAssignmentsInRange(childId, startDate, endDate);

  const tasksWithSchedules = await db
    .select({
      taskId: schema.upkeepTask.id,
      frequency: schema.upkeepTaskSchedule.frequency,
      daysOfWeek: schema.upkeepTaskSchedule.daysOfWeek,
      intervalWeeks: schema.upkeepTaskSchedule.intervalWeeks,
      startDate: schema.upkeepTaskSchedule.startDate,
      endDate: schema.upkeepTaskSchedule.endDate,
    })
    .from(schema.upkeepTask)
    .innerJoin(
      schema.upkeepTaskSchedule,
      eq(schema.upkeepTask.id, schema.upkeepTaskSchedule.taskId)
    )
    .where(
      and(
        eq(schema.upkeepTask.childId, childId),
        eq(schema.upkeepTask.isActive, true)
      )
    );

  if (tasksWithSchedules.length === 0) return 0;

  const existing = await db
    .select({
      taskId: schema.upkeepTaskAssignment.taskId,
      date: schema.upkeepTaskAssignment.date,
    })
    .from(schema.upkeepTaskAssignment)
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        gte(schema.upkeepTaskAssignment.date, startDate),
        lte(schema.upkeepTaskAssignment.date, endDate)
      )
    );

  const existingKeys = new Set(existing.map((a) => assignmentKey(a.taskId, a.date)));

  const planned = planUpkeepAssignments(
    tasksWithSchedules.map((t) => ({
      taskId: t.taskId,
      schedule: {
        frequency: t.frequency,
        daysOfWeek: t.daysOfWeek,
        intervalWeeks: t.intervalWeeks,
        startDate: t.startDate,
        endDate: t.endDate,
      },
    })),
    existingKeys,
    startDate,
    endDate
  );

  if (planned.length === 0) return 0;

  const now = new Date();
  let created = 0;

  for (const row of planned) {
    // onConflictDoNothing guards a concurrent call (a prefetched route) racing
    // this same check-then-insert; the unique index is what actually prevents
    // the duplicate.
    const inserted = await db
      .insert(schema.upkeepTaskAssignment)
      .values({
        id: nanoid(),
        taskId: row.taskId,
        childId,
        date: row.date,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.upkeepTaskAssignment.id });
    if (inserted.length > 0) created++;
  }

  return created;
}

/** One day's tasks, newest-defined last, joined to their template. */
export async function getUpkeepAssignmentsForDate(childId: string, date: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        eq(schema.upkeepTaskAssignment.date, date)
      )
    )
    .orderBy(asc(schema.upkeepTask.sortOrder));
}

/**
 * Required tasks whose day has passed while still pending — what
 * `deriveUpkeepStatus` will render as missed. Filtered here rather than in the
 * caller so the query stays cheap, and windowed so the list cannot grow without
 * bound.
 */
export async function getOutstandingUpkeepAssignments(childId: string, today: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        eq(schema.upkeepTaskAssignment.status, "pending"),
        eq(schema.upkeepTask.isRequired, true),
        lt(schema.upkeepTaskAssignment.date, today),
        gte(
          schema.upkeepTaskAssignment.date,
          addDays(today, -OUTSTANDING_LOOKBACK_DAYS)
        )
      )
    )
    .orderBy(desc(schema.upkeepTaskAssignment.date));
}

/** The parent's approval queue for one hero. */
export async function getUpkeepAwaitingApproval(childId: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.upkeepTaskAssignment,
      task: schema.upkeepTask,
    })
    .from(schema.upkeepTaskAssignment)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTaskAssignment.childId, childId),
        eq(schema.upkeepTaskAssignment.status, "awaiting_approval")
      )
    )
    .orderBy(desc(schema.upkeepTaskAssignment.date));
}
