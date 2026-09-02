"use server";

import { nanoid } from "nanoid";
import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, requireUpkeepAssignmentAccess } from "@/lib/auth/access";
import { assertUpkeepEnabled, loadUpkeepContext } from "@/lib/services/upkeep-context";
import { pruneStaleUpkeepAssignmentsInRange } from "@/lib/services/upkeep-assignment-sync";
import { assignmentKey, planUpkeepAssignments } from "@/lib/utils/upkeep-planning";
import { addDays } from "@/lib/utils/dates";
import { getActor, requireAdultActor } from "@/lib/auth/actor";
import { applyUpkeepTransition } from "@/lib/services/upkeep-transitions";
import { sanitizeText } from "@/lib/utils/sanitize";

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

/** Identifies the acting user, including a PIN hero who has no `user` row. */
async function actingUserId(): Promise<string> {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  return actor.kind === "child" ? `child:${actor.childId}` : actor.userId;
}

/** Owning child id for an assignment — needed before the upkeep-enabled gate. */
async function assignmentChildId(assignmentId: string): Promise<string> {
  const rows = await db
    .select({ childId: schema.upkeepTaskAssignment.childId })
    .from(schema.upkeepTaskAssignment)
    .where(eq(schema.upkeepTaskAssignment.id, assignmentId))
    .limit(1);
  if (!rows[0]) throw new Error("Upkeep assignment not found.");
  return rows[0].childId;
}

/**
 * A hero (or a parent) marks a task done. Where the family requires approval,
 * a hero's claim lands in `awaiting_approval` and no wages post; a parent
 * marking it done completes it outright, since they are the approver.
 */
export async function markUpkeepDone(assignmentId: string, notes?: string) {
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });

  const context = await assertUpkeepEnabled(await assignmentChildId(assignmentId));
  const actor = await getActor();
  const isChild = actor?.kind === "child";

  await applyUpkeepTransition({
    assignmentId,
    next: context.requiresApproval && isChild ? "awaiting_approval" : "completed",
    actorUserId: await actingUserId(),
    notes: notes ? sanitizeText(notes, 2000) : undefined,
    statusReason: null,
  });
}

/** A grown-up confirms a hero's claim; wages and XP post here. */
export async function approveUpkeep(assignmentId: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await assertUpkeepEnabled(await assignmentChildId(assignmentId));
  await applyUpkeepTransition({
    assignmentId,
    next: "completed",
    actorUserId: await actingUserId(),
  });
}

/**
 * Sends the task back with a reason. If it was only `awaiting_approval`,
 * nothing posts. If it had already been completed and paid, this reverses
 * the wages and revokes the XP, same as `uncompleteUpkeep`.
 */
export async function rejectUpkeep(assignmentId: string, reason: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await assertUpkeepEnabled(await assignmentChildId(assignmentId));
  await applyUpkeepTransition({
    assignmentId,
    next: "pending",
    actorUserId: await actingUserId(),
    statusReason: sanitizeText(reason, 500),
  });
}

/** Parent-only: retires a task for the day without claiming it was done. */
export async function excuseUpkeep(assignmentId: string, reason: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await assertUpkeepEnabled(await assignmentChildId(assignmentId));
  await applyUpkeepTransition({
    assignmentId,
    next: "excused",
    actorUserId: await actingUserId(),
    statusReason: sanitizeText(reason, 500),
  });
}

/** Parent-only: undoes a completion, reversing any wages and XP it granted. */
export async function uncompleteUpkeep(assignmentId: string) {
  await requireAdultActor();
  await requireUpkeepAssignmentAccess(assignmentId, { write: true });
  await assertUpkeepEnabled(await assignmentChildId(assignmentId));
  await applyUpkeepTransition({
    assignmentId,
    next: "pending",
    actorUserId: await actingUserId(),
  });
}
