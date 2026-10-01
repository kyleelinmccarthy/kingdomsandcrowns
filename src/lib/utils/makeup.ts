import { addDaysToDate, weekdayOfDate, type DayOfWeek, DAYS_OF_WEEK } from "./schedule-days";

/**
 * Catch-up: what happens to a quest a hero didn't get to on the day it was set.
 *
 * The rule the rest of the app leans on is simple — work is *owed* until it is
 * either done or a grown-up says it isn't needed. "Not needed" is exactly what
 * a skip already means, so skipping is the excuse: a parent (or a hero their
 * parent has handed skipping to) skips a missed quest and it stops following
 * them. Nothing is deleted either way; the assignment keeps its own day on the
 * record, so the learning log still reads correctly.
 */

export type MakeupMode = "always" | "makeup_days" | "off";

export const MAKEUP_MODES: MakeupMode[] = ["always", "makeup_days", "off"];

/**
 * How far back catch-up work is drawn from. A bounded window on purpose: a
 * hero who fell behind in September should not still be handed September in
 * November — that's a conversation for the grown-ups, not a wall of quests on
 * a child's board. Anything older stays on its own day's record and can still
 * be reopened from the quest log.
 */
export const MAKEUP_LOOKBACK_DAYS = 7;

/** The earliest date catch-up work is drawn from, given today. */
export function makeupWindowStart(today: string): string {
  return addDaysToDate(today, -MAKEUP_LOOKBACK_DAYS);
}

/**
 * Statuses that mean the work is still owed.
 *
 * "stuck" belongs here with "pending": a hero who couldn't finish something
 * had to move past it so the day could go on, but the work itself was never
 * done and nobody decided it shouldn't be. Coming back to it tomorrow — with
 * the grown-up who was alerted — is the whole point.
 */
const UNFINISHED_STATUSES = new Set(["pending", "stuck"]);

export function isUnfinishedStatus(status: string | undefined): boolean {
  return status !== undefined && UNFINISHED_STATUSES.has(status);
}

export function parseMakeupMode(raw: string | null | undefined): MakeupMode {
  return MAKEUP_MODES.includes(raw as MakeupMode) ? (raw as MakeupMode) : "always";
}

/** Parses the JSON weekday array in `child.makeup_days`, dropping anything unrecognized. */
export function parseMakeupDays(raw: string | null | undefined): DayOfWeek[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is DayOfWeek => (DAYS_OF_WEEK as readonly string[]).includes(d));
  } catch {
    return [];
  }
}

export type MakeupSettings = {
  mode: MakeupMode;
  /** Weekday codes that are standing catch-up days. Only read when mode is "makeup_days". */
  weekdays: DayOfWeek[];
  /** One-off dates a parent marked as a make-up day for this hero. */
  markedDates: string[];
};

/**
 * Whether unfinished work from earlier days belongs on `date`'s board.
 *
 * A date a parent explicitly marked wins over everything, "off" included — an
 * instruction given for one particular day is more specific than the standing
 * rule, and a parent who marks a make-up day has plainly asked for the pile.
 */
export function isMakeupDay(date: string, settings: MakeupSettings): boolean {
  if (settings.markedDates.includes(date)) return true;
  if (settings.mode === "always") return true;
  if (settings.mode === "makeup_days") return settings.weekdays.includes(weekdayOfDate(date));
  return false;
}

/** Why catch-up work is showing today — used to say so on the panel. */
export type MakeupReason = "marked_day" | "makeup_weekday" | "always";

export function makeupReason(date: string, settings: MakeupSettings): MakeupReason | null {
  if (settings.markedDates.includes(date)) return "marked_day";
  if (settings.mode === "always") return "always";
  if (settings.mode === "makeup_days" && settings.weekdays.includes(weekdayOfDate(date))) {
    return "makeup_weekday";
  }
  return null;
}

export type MakeupCandidate = {
  assignment: { id: string; status: string; date: string };
  quest: { sortOrder: number };
};

export type DateRange = { startDate: string; endDate: string };

/** True when an ISO date falls inside one of the family's school breaks (inclusive). */
export function isWithinBreak(date: string, breaks: DateRange[]): boolean {
  return breaks.some((b) => date >= b.startDate && date <= b.endDate);
}

/**
 * The unfinished work from earlier days, most recent first.
 *
 * Yesterday's leads because it's the likeliest to still be fresh — and because
 * a hero opening a catch-up list wants the thing they remember, not the oldest
 * thing on it. Within a day, the quests keep their own order.
 *
 * `today` itself is excluded: today's board already shows today's quests, and
 * listing them twice makes an ordinary day look like a backlog. So are days
 * inside a school break — nobody was meant to be working, so nothing there
 * was missed.
 */
export function selectMakeupAssignments<T extends MakeupCandidate>(
  rows: T[],
  today: string,
  windowStart: string = makeupWindowStart(today),
  /** School breaks: a quest nobody was meant to be doing was never missed. */
  breaks: DateRange[] = []
): T[] {
  return rows
    .filter(
      (r) =>
        r.assignment.date < today &&
        r.assignment.date >= windowStart &&
        isUnfinishedStatus(r.assignment.status) &&
        !isWithinBreak(r.assignment.date, breaks)
    )
    .sort(
      (a, b) =>
        b.assignment.date.localeCompare(a.assignment.date) ||
        a.quest.sortOrder - b.quest.sortOrder
    );
}

const WEEKDAY_NAMES: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * How a missed day is named on a catch-up card: "Yesterday" when it was, and
 * the plain weekday name within the last six days (a hero reads "Monday"
 * faster than "2026-09-01").
 *
 * Only six, not the full seven-day window: a date a whole week back shares
 * today's weekday, and "Thursday" sitting on a Thursday board reads as today.
 */
export function formatMissedDate(date: string, today: string): string {
  if (date === addDaysToDate(today, -1)) return "Yesterday";
  if (date >= addDaysToDate(today, -6) && date < today) return WEEKDAY_NAMES[weekdayOfDate(date)];
  return date;
}
