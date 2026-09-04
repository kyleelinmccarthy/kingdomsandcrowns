export const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** The weekdays that count as school days when a hero has no explicit selection. */
export const DEFAULT_SCHOOL_DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

// Date.getUTCDay() is 0-indexed starting on Sunday, unlike DAYS_OF_WEEK above.
const JS_DAY_ORDER: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** True when two "HH:mm" time ranges (half-open, [start, end)) overlap. */
export function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * True when two "HH:mm" ranges clash badly enough to reject.
 *
 * Two classes may deliberately share the *exact* same slot — a single morning
 * block that covers both Math and Handwriting — because a parent whose day is
 * already carved into back-to-back slots otherwise has no way to put a missing
 * subject on the schedule without re-cutting the day. A *partial* overlap is
 * still a conflict: there'd be no honest answer to which class a hero is in at
 * 9:30, and the schedule is what structured mode walks in order.
 */
export function timeRangesConflict(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  if (aStart === bStart && aEnd === bEnd) return false;
  return timeRangesOverlap(aStart, aEnd, bStart, bEnd);
}

export type SlotLike = { subjectId: string; startTime: string; endTime: string };

/**
 * The one block on a day that makes a candidate block impossible, or null when
 * there isn't one. Shared by the schedule editor and the server action so the
 * form never offers a placement the server will then refuse.
 *
 * - `"overlap"`: the candidate covers part, but not all, of another class.
 * - `"duplicate"`: that subject is already in this exact slot.
 *
 * Deliberately absent: a different subject in the identical slot, which is
 * allowed — that's how a subject gets onto a day already carved into
 * back-to-back blocks.
 */
export function findSlotConflict<T extends SlotLike>(
  sameDay: T[],
  candidate: SlotLike
): { kind: "overlap" | "duplicate"; block: T } | null {
  const overlapping = sameDay.find((b) =>
    timeRangesConflict(candidate.startTime, candidate.endTime, b.startTime, b.endTime)
  );
  if (overlapping) return { kind: "overlap", block: overlapping };

  const duplicate = sameDay.find(
    (b) =>
      b.subjectId === candidate.subjectId &&
      b.startTime === candidate.startTime &&
      b.endTime === candidate.endTime
  );
  if (duplicate) return { kind: "duplicate", block: duplicate };

  return null;
}

/** Minutes since midnight for an "HH:mm" time string. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** An "HH:mm" time string for a given number of minutes since midnight, clamped to the same day. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Adds (or subtracts, if negative) minutes to an "HH:mm" time string, clamped to the same day. */
export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/** Formats an "HH:mm" time string as 12-hour clock time, e.g. "13:05" -> "1:05 PM". */
export function formatTimeOfDay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** The weekday code for an ISO "YYYY-MM-DD" date. */
export function weekdayOfDate(isoDate: string): DayOfWeek {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return JS_DAY_ORDER[d.getUTCDay()];
}

/** The current local wall-clock time as an "HH:mm" string. */
export function currentTimeOfDay(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The local calendar date of a Date object as "YYYY-MM-DD", using its local
 * getters rather than toISOString() (which is UTC and can be a day off from
 * the caller's actual wall-clock date).
 */
export function localDateOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The weekday code for today, in the browser's local timezone. */
export function todayDayOfWeek(): DayOfWeek {
  return JS_DAY_ORDER[new Date().getDay()];
}

/** The default weekly repeat days for a fresh schedule: just the start date's weekday, if it's a school day. */
export function defaultRepeatDaysForStartDate(startDate: string, schoolDays: string[]): DayOfWeek[] {
  const wd = weekdayOfDate(startDate);
  return schoolDays.includes(wd) ? [wd] : [];
}

/** Ensures the start date's weekday is included in a weekly repeat's selected days, without dropping any other selection. */
export function syncRepeatDaysWithStartDate(
  days: string[],
  startDate: string,
  schoolDays: string[]
): string[] {
  const wd = weekdayOfDate(startDate);
  if (!schoolDays.includes(wd)) return days;
  return days.includes(wd) ? days : [...days, wd];
}

/**
 * Parses the JSON array stored in `child.school_days`, falling back to Mon-Fri
 * for null/empty/malformed values. Pure so it can be shared by server actions
 * and by streak math without another round-trip.
 */
export function parseSchoolDays(raw: string | null | undefined): DayOfWeek[] {
  const parsed = parseDayCodes(raw);
  return parsed.length > 0 ? parsed : DEFAULT_SCHOOL_DAYS;
}

/**
 * Parses the JSON array stored in `child.streak_optional_days`: school days a
 * hero may skip without breaking their streak. Empty by default — every school
 * day counts unless a parent marks it optional.
 */
export function parseStreakOptionalDays(raw: string | null | undefined): DayOfWeek[] {
  return parseDayCodes(raw);
}

/** Reads a JSON array of weekday codes, dropping anything unrecognized. */
function parseDayCodes(raw: string | null | undefined): DayOfWeek[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is DayOfWeek => (DAYS_OF_WEEK as readonly string[]).includes(d));
  } catch {
    return [];
  }
}
