"use server";

import { nanoid } from "nanoid";
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";
import { addDaysToDate } from "@/lib/utils/schedule-days";
import { parseSchoolDays, parseStreakOptionalDays } from "@/lib/utils/schedule-days";
import { recomputeFamilyStreaks } from "@/lib/services/streaks";
import {
  MISSED_DAYS_WINDOW,
  selectMissedDays,
  type MissedDay,
} from "@/lib/utils/missed-days";
import {
  EXCUSE_REASONS,
  collisionKey,
  partitionMovable,
  type ExcuseReason,
} from "@/lib/utils/excused-days";

/** What a move actually managed to do, so the panel can say so. */
type MoveResult = { moved: number; blocked: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Statuses whose work is still owed, and so is what excusing or moving acts on. */
const UNFINISHED = ["pending", "stuck"] as const;

async function requireParent(childId: string) {
  const { access, familyId } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) {
    throw new Error("Ask a grown-up — only they can excuse a day.");
  }
  return { access, familyId };
}

function assertIsoDate(date: string) {
  if (!ISO_DATE.test(date)) throw new Error("Choose a valid date.");
}

/**
 * The heroes this actor may write to, for "apply to all".
 *
 * A member scoped to specific heroes gets only those: ticking "apply to all"
 * must never reach a hero the actor cannot otherwise touch. Banished heroes are
 * excluded — they are hidden everywhere else too.
 */
export async function getWritableChildIds(childId: string): Promise<string[]> {
  const { access, familyId } = await requireParent(childId);

  const rows = await db
    .select({ id: schema.child.id })
    .from(schema.child)
    .where(and(eq(schema.child.familyId, familyId), isNull(schema.child.banishedAt)));

  const all = rows.map((r) => r.id);
  if (access.scope !== "specific") return all;
  const scoped = new Set(access.scopedChildIds ?? []);
  return all.filter((id) => scoped.has(id));
}

/**
 * Everything the Missed Days panel needs for one hero.
 *
 * Readable by any in-scope adult and by the hero themselves — the page decides
 * what to render. `canEdit` is what the panel gates its controls on: an editing
 * adult, never a hero, never a read-only guardian.
 */
export async function getMissedDaysView(
  childId: string,
  today: string
): Promise<{
  missed: MissedDay[];
  excused: { date: string; reason: ExcuseReason; note: string | null }[];
  canEdit: boolean;
}> {
  const { access, familyId } = await requireChildAccess(childId);
  assertIsoDate(today);

  const windowStart = addDaysToDate(today, -MISSED_DAYS_WINDOW);

  const [childRow, activeDays, assignments, breaks, excused, firstActivity] = await Promise.all([
    db
      .select({
        schoolDays: schema.child.schoolDays,
        streakOptionalDays: schema.child.streakOptionalDays,
        createdAt: schema.child.createdAt,
      })
      .from(schema.child)
      .where(eq(schema.child.id, childId))
      .limit(1),
    db
      .select({ date: schema.activityLog.date })
      .from(schema.activityLog)
      .where(
        and(
          eq(schema.activityLog.childId, childId),
          gte(schema.activityLog.date, windowStart)
        )
      )
      .groupBy(schema.activityLog.date),
    db
      .select({
        date: schema.questAssignment.date,
        status: schema.questAssignment.status,
      })
      .from(schema.questAssignment)
      .where(
        and(
          eq(schema.questAssignment.childId, childId),
          gte(schema.questAssignment.date, windowStart)
        )
      ),
    db
      .select({
        startDate: schema.schoolBreak.startDate,
        endDate: schema.schoolBreak.endDate,
      })
      .from(schema.schoolBreak)
      .where(
        and(
          eq(schema.schoolBreak.familyId, familyId),
          gte(schema.schoolBreak.endDate, windowStart)
        )
      ),
    db
      .select({
        date: schema.excusedDay.date,
        reason: schema.excusedDay.reason,
        note: schema.excusedDay.note,
      })
      .from(schema.excusedDay)
      .where(
        and(eq(schema.excusedDay.childId, childId), gte(schema.excusedDay.date, windowStart))
      )
      .orderBy(asc(schema.excusedDay.date)),
    // The hero's very first logged activity, whenever that was — the floor for
    // "missed". Unbounded on purpose: it is one indexed row, and clamping it to
    // the window would make a long-established hero look brand new.
    db
      .select({ date: schema.activityLog.date })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId))
      .orderBy(asc(schema.activityLog.date))
      .limit(1),
  ]);

  // A hero cannot have missed a day that fell before they started. Their first
  // activity is the honest floor; a hero who has never logged anything falls
  // back to the day they were created.
  const notBefore =
    firstActivity[0]?.date ??
    (childRow[0]?.createdAt ? formatDate(childRow[0].createdAt) : null);

  const missed = selectMissedDays({
    today,
    notBefore,
    activeDates: activeDays.map((r) => r.date),
    assignments,
    schoolDays: parseSchoolDays(childRow[0]?.schoolDays),
    optionalDays: parseStreakOptionalDays(childRow[0]?.streakOptionalDays),
    breaks,
    excusedDates: excused.map((e) => e.date),
  });

  return {
    missed,
    excused,
    canEdit: access.permission === "edit" && !isChildActor(access),
  };
}

/**
 * Excuse one date for one hero — or, with `applyToAll`, for every hero this
 * actor may write to.
 *
 * Idempotent: excusing an already-excused day updates its reason and note
 * rather than failing, so a parent correcting "sick" to "appointment" does not
 * have to un-excuse first.
 *
 * The day's unfinished work becomes `excused` too. Completed work is left
 * exactly as it is — a hero who did three things on a day they were then out
 * for keeps the credit, and the activity log still explains the streak.
 */
export async function excuseDay(
  childId: string,
  date: string,
  reason: ExcuseReason,
  note?: string,
  opts?: { applyToAll?: boolean }
): Promise<void> {
  const { familyId } = await requireParent(childId);
  assertIsoDate(date);
  if (!EXCUSE_REASONS.includes(reason)) throw new Error("Choose a reason.");

  const targets = opts?.applyToAll ? await getWritableChildIds(childId) : [childId];
  const cleanNote = note ? sanitizeText(note) : "";
  const now = new Date();

  for (const target of targets) {
    const existing = await db
      .select({ id: schema.excusedDay.id })
      .from(schema.excusedDay)
      .where(and(eq(schema.excusedDay.childId, target), eq(schema.excusedDay.date, date)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(schema.excusedDay)
        .set({ reason, note: cleanNote || null, updatedAt: now })
        .where(eq(schema.excusedDay.id, existing[0].id));
    } else {
      await db.insert(schema.excusedDay).values({
        id: nanoid(),
        childId: target,
        date,
        reason,
        note: cleanNote || null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(schema.questAssignment)
      .set({ status: "excused", updatedAt: now })
      .where(
        and(
          eq(schema.questAssignment.childId, target),
          eq(schema.questAssignment.date, date),
          inArray(schema.questAssignment.status, [...UNFINISHED])
        )
      );
  }

  // Repair the stored streak now. Waiting for the hero's next activity would
  // mean the number stays wrong for exactly as long as they are out.
  await recomputeFamilyStreaks(familyId);
}

/**
 * Undo an excused day. The day's excused work goes back to `pending`, keeping
 * whatever `statusReason` it carried — nothing a hero wrote is lost, but the
 * day starts clean rather than re-raising a stale "I'm stuck" alert.
 */
export async function unexcuseDay(childId: string, date: string): Promise<void> {
  const { familyId } = await requireParent(childId);
  assertIsoDate(date);
  const now = new Date();

  await db
    .delete(schema.excusedDay)
    .where(and(eq(schema.excusedDay.childId, childId), eq(schema.excusedDay.date, date)));

  await db
    .update(schema.questAssignment)
    .set({ status: "pending", updatedAt: now })
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.date, date),
        eq(schema.questAssignment.status, "excused")
      )
    );

  await recomputeFamilyStreaks(familyId);
}

/**
 * Move specific unfinished assignments to another day.
 *
 * `originalDate` is only ever written once, via COALESCE: a quest moved from
 * Monday to Wednesday and then to Friday still says it came from Monday, which
 * is the day a parent is actually trying to account for.
 *
 * No streak recompute — moving planned work changes no activity history, and
 * the day it left is still empty until it is excused or worked.
 */
export async function moveAssignmentsToDate(
  assignmentIds: string[],
  targetDate: string
): Promise<MoveResult> {
  if (assignmentIds.length === 0) return { moved: 0, blocked: 0 };
  assertIsoDate(targetDate);
  if (targetDate < formatDate(new Date())) {
    throw new Error("Pick today or a later day to move this work to.");
  }

  // Authorize every hero these assignments belong to, not just the first.
  const rows = await db
    .select({
      id: schema.questAssignment.id,
      childId: schema.questAssignment.childId,
      questId: schema.questAssignment.questId,
    })
    .from(schema.questAssignment)
    .where(
      and(
        inArray(schema.questAssignment.id, assignmentIds),
        inArray(schema.questAssignment.status, [...UNFINISHED])
      )
    );
  if (rows.length === 0) return { moved: 0, blocked: 0 };

  const childIds = [...new Set(rows.map((r) => r.childId))];
  for (const childId of childIds) {
    await requireParent(childId);
  }

  // What the target day already holds for these heroes. A quest may only be
  // assigned to a hero once per day (UNIQUE child_id, quest_id, date), so
  // anything already there is work that does not need carrying over.
  const onTarget = await db
    .select({
      childId: schema.questAssignment.childId,
      questId: schema.questAssignment.questId,
    })
    .from(schema.questAssignment)
    .where(
      and(
        inArray(schema.questAssignment.childId, childIds),
        eq(schema.questAssignment.date, targetDate)
      )
    );

  const { movable, blocked } = partitionMovable(rows, onTarget.map(collisionKey));
  if (movable.length === 0) return { moved: 0, blocked: blocked.length };

  await db
    .update(schema.questAssignment)
    .set({
      date: targetDate,
      originalDate: sql`COALESCE(${schema.questAssignment.originalDate}, ${schema.questAssignment.date})`,
      updatedAt: new Date(),
    })
    .where(
      inArray(
        schema.questAssignment.id,
        movable.map((r) => r.id)
      )
    );

  return { moved: movable.length, blocked: blocked.length };
}

/** Move a whole day's unfinished work to another date. */
export async function moveDayToDate(
  childId: string,
  fromDate: string,
  targetDate: string
): Promise<MoveResult> {
  await requireParent(childId);
  assertIsoDate(fromDate);

  const rows = await db
    .select({ id: schema.questAssignment.id })
    .from(schema.questAssignment)
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.date, fromDate),
        inArray(schema.questAssignment.status, [...UNFINISHED])
      )
    );

  return moveAssignmentsToDate(
    rows.map((r) => r.id),
    targetDate
  );
}
