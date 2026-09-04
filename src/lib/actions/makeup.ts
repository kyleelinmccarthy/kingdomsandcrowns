"use server";

import { nanoid } from "nanoid";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";
import { DAYS_OF_WEEK, addDaysToDate, type DayOfWeek } from "@/lib/utils/schedule-days";
import {
  getAssignmentsForDateRange,
  generateAssignmentsFromSchedules,
} from "@/lib/actions/quest-assignments";
import { getSchoolBreaks } from "@/lib/actions/school-breaks";
import {
  MAKEUP_MODES,
  isMakeupDay,
  makeupReason,
  makeupWindowStart,
  parseMakeupDays,
  parseMakeupMode,
  selectMakeupAssignments,
  type MakeupMode,
  type MakeupReason,
  type MakeupSettings,
} from "@/lib/utils/makeup";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function requireParent(childId: string) {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) {
    throw new Error("Ask a grown-up — only they can change catch-up days.");
  }
  return access;
}

/**
 * A hero's catch-up rules: the standing mode, the weekdays it applies to, and
 * every one-off make-up day still worth knowing about.
 *
 * Marked days are read from the start of the lookback window rather than from
 * today, so a day that has already passed is still visible to the parent who
 * set it — a list that silently drops yesterday looks like the setting never
 * saved.
 */
export async function getMakeupSettings(childId: string): Promise<MakeupSettings> {
  await requireChildAccess(childId);
  const today = formatDate(new Date());

  const [rows, marked] = await Promise.all([
    db
      .select({ mode: schema.child.makeupMode, days: schema.child.makeupDays })
      .from(schema.child)
      .where(eq(schema.child.id, childId))
      .limit(1),
    db
      .select({ date: schema.makeupDay.date })
      .from(schema.makeupDay)
      .where(
        and(
          eq(schema.makeupDay.childId, childId),
          gte(schema.makeupDay.date, makeupWindowStart(today))
        )
      ),
  ]);

  return {
    mode: parseMakeupMode(rows[0]?.mode),
    weekdays: parseMakeupDays(rows[0]?.days),
    markedDates: marked.map((m) => m.date),
  };
}

/** Every make-up day a parent has marked for this hero, soonest first — the settings list. */
export async function getMakeupDays(childId: string) {
  await requireChildAccess(childId);
  return db
    .select()
    .from(schema.makeupDay)
    .where(eq(schema.makeupDay.childId, childId))
    .orderBy(asc(schema.makeupDay.date));
}

export async function setMakeupMode(childId: string, mode: MakeupMode) {
  await requireParent(childId);
  if (!MAKEUP_MODES.includes(mode)) throw new Error("Unknown catch-up setting.");
  await db
    .update(schema.child)
    .set({ makeupMode: mode, updatedAt: new Date() })
    .where(eq(schema.child.id, childId));
}

export async function setMakeupWeekdays(childId: string, days: DayOfWeek[]) {
  await requireParent(childId);
  const clean = DAYS_OF_WEEK.filter((d) => days.includes(d));
  await db
    .update(schema.child)
    .set({ makeupDays: JSON.stringify(clean), updatedAt: new Date() })
    .where(eq(schema.child.id, childId));
}

/**
 * Marks one date as a make-up day for this hero. Idempotent — marking a day
 * that's already marked just updates its note rather than failing, so a parent
 * double-tapping the button doesn't get an error about a day they already set.
 */
export async function addMakeupDay(childId: string, date: string, note?: string) {
  await requireParent(childId);
  if (!ISO_DATE.test(date)) throw new Error("Choose a valid date.");
  const cleanNote = note ? sanitizeText(note) : "";
  const now = new Date();

  const existing = await db
    .select({ id: schema.makeupDay.id })
    .from(schema.makeupDay)
    .where(and(eq(schema.makeupDay.childId, childId), eq(schema.makeupDay.date, date)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.makeupDay)
      .set({ note: cleanNote || null })
      .where(eq(schema.makeupDay.id, existing[0].id));
    return { id: existing[0].id };
  }

  const id = nanoid();
  await db.insert(schema.makeupDay).values({
    id,
    childId,
    date,
    note: cleanNote || null,
    createdAt: now,
  });
  return { id };
}

export async function removeMakeupDay(makeupDayId: string) {
  const rows = await db
    .select({ childId: schema.makeupDay.childId })
    .from(schema.makeupDay)
    .where(eq(schema.makeupDay.id, makeupDayId))
    .limit(1);
  if (!rows[0]) throw new Error("That make-up day is already gone.");
  await requireParent(rows[0].childId);
  await db.delete(schema.makeupDay).where(eq(schema.makeupDay.id, makeupDayId));
}

export type MakeupView = {
  /** Whether unfinished work belongs on this date's board at all. */
  isMakeupDay: boolean;
  /** Why it does, so the panel can say so. Null when it doesn't. */
  reason: MakeupReason | null;
  settings: MakeupSettings;
  assignments: Awaited<ReturnType<typeof getAssignmentsForDateRange>>;
};

/**
 * Everything the catch-up panel needs for one hero on one date.
 *
 * The window is generated before it's read: a quest scheduled for a day nobody
 * opened the app on was never materialized into an assignment, and work that
 * has no row can't be missed, done, or excused. Generation is idempotent and
 * bounded to the lookback window, and it never reaches back past the day the
 * hero was created — a family that joins today should not be handed a week of
 * backlog invented from a schedule's start date.
 *
 * `assignments` is always computed, even when today is not a make-up day: a
 * parent's view of what's outstanding shouldn't depend on the hero's own
 * catch-up setting. Callers rendering the hero's board gate on `isMakeupDay`.
 */
export async function getMakeupView(childId: string, date: string): Promise<MakeupView> {
  const { access, familyId } = await requireChildAccess(childId);
  const settings = await getMakeupSettings(childId);

  const rows = await db
    .select({ createdAt: schema.child.createdAt })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);

  const windowStart = latestOf(
    makeupWindowStart(date),
    rows[0]?.createdAt ? formatDate(rows[0].createdAt) : null
  );
  const windowEnd = addDaysToDate(date, -1);

  if (windowStart > windowEnd) {
    return { isMakeupDay: isMakeupDay(date, settings), reason: makeupReason(date, settings), settings, assignments: [] };
  }

  // Only an actor with write access can materialize rows; a view-only guardian
  // still sees whatever is already there.
  if (access.permission === "edit") {
    await generateAssignmentsFromSchedules(childId, windowStart, windowEnd);
  }

  const [range, breaks] = await Promise.all([
    getAssignmentsForDateRange(childId, windowStart, windowEnd),
    getSchoolBreaks(familyId),
  ]);
  return {
    isMakeupDay: isMakeupDay(date, settings),
    reason: makeupReason(date, settings),
    settings,
    assignments: selectMakeupAssignments(range, date, windowStart, breaks),
  };
}

/** How many quests a hero still owes from earlier days — the parent dashboard's badge. */
export async function countMakeupAssignments(childId: string, date: string): Promise<number> {
  const { assignments } = await getMakeupView(childId, date);
  return assignments.length;
}

function latestOf(a: string, b: string | null): string {
  if (!b) return a;
  return b > a ? b : a;
}
