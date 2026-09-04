import { addDays } from "./dates";
import { addDaysToDate, weekdayOfDate } from "./schedule-days";

/** An inclusive ISO ("YYYY-MM-DD") date range that isn't a school day, e.g. a break. */
export type DateRange = { startDate: string; endDate: string };

export type StreakOptions = {
  /**
   * Weekday codes ("mon".."sun") that count as school days. Days outside this
   * list are skipped: they neither extend nor break the streak. Omit (or pass
   * an empty list) to treat every calendar day as a school day.
   */
  schoolDays?: readonly string[] | null;
  /**
   * Weekday codes that are school days but optional: a parent has said nothing
   * needs logging there, so they're skipped just like a day off. Days that
   * aren't school days in the first place are already skipped.
   */
  optionalDays?: readonly string[] | null;
  /** School breaks/holidays, skipped the same way non-school weekdays are. */
  breaks?: readonly DateRange[] | null;
};

/**
 * Compute the current activity streak from the set of dates (YYYY-MM-DD) that
 * have at least one logged activity.
 *
 * Counting walks backwards from `today`: each consecutive day with activity
 * extends the streak. Today is allowed to have no activity yet (the streak is
 * measured from yesterday in that case) — the first gap on any earlier *school*
 * day ends the streak. Days where nothing is expected — non-school days, days a
 * parent marked optional, and any date inside a school break — are skipped
 * entirely: an empty one never resets the streak, and activity logged on one
 * still counts toward it. The look-back is capped at 365 calendar days.
 *
 * This mirrors the original day-by-day query loop, but as a pure function over
 * an already-fetched set of dates, so the streak can be derived from a single
 * database query instead of up to 365 sequential round-trips.
 *
 * `today` is an ISO ("YYYY-MM-DD") date string, not a `Date` — the walk stays
 * entirely in date-string space via `addDays`. An earlier version stepped a
 * `Date` cursor with local `getDate`/`setDate` but formatted it back to a
 * string with UTC `toISOString`, a mixed frame that silently skipped the US
 * DST fall-back day (e.g. 2026-11-01) once a year for every DST-observing
 * family.
 */
export function computeStreak(
  activeDates: Iterable<string>,
  today: string = new Date().toISOString().slice(0, 10),
  options: StreakOptions = {}
): number {
  const active = new Set(activeDates);
  const schoolDaySet = options.schoolDays?.length ? new Set(options.schoolDays) : null;
  const optionalDaySet = new Set(options.optionalDays ?? []);
  const breaks = options.breaks ?? [];
  let streak = 0;
  let cursor = today;

  for (let i = 0; i < 365; i++) {
    if (active.has(cursor)) {
      streak++;
    } else if (i !== 0 && !isDayOff(cursor, schoolDaySet, optionalDaySet, breaks)) {
      // A school day with nothing logged ends the streak. (i === 0 is today,
      // which may simply not have an activity logged yet.)
      break;
    }
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * True when nothing is expected on this date — not a school day, marked
 * optional, or inside a break.
 */
function isDayOff(
  isoDate: string,
  schoolDaySet: Set<string> | null,
  optionalDaySet: Set<string>,
  breaks: readonly DateRange[]
): boolean {
  const weekday = weekdayOfDate(isoDate);
  if (schoolDaySet && !schoolDaySet.has(weekday)) return true;
  if (optionalDaySet.has(weekday)) return true;
  return breaks.some((b) => isoDate >= b.startDate && isoDate <= b.endDate);
}

/**
 * The longest streak anywhere in the given history, under the same rules as
 * `computeStreak`: a run survives a gap only when every day in that gap is a
 * non-school day. Used to repair records that an earlier, day-off-blind
 * calculation cut short.
 */
export function computeLongestStreak(
  activeDates: Iterable<string>,
  options: StreakOptions = {}
): number {
  const schoolDaySet = options.schoolDays?.length ? new Set(options.schoolDays) : null;
  const optionalDaySet = new Set(options.optionalDays ?? []);
  const breaks = options.breaks ?? [];
  const sorted = [...new Set(activeDates)].sort();

  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const date of sorted) {
    run = previous !== null && gapIsAllDaysOff(previous, date, schoolDaySet, optionalDaySet, breaks) ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  return longest;
}

/** True when every day strictly between two active dates is a day off. */
function gapIsAllDaysOff(
  from: string,
  to: string,
  schoolDaySet: Set<string> | null,
  optionalDaySet: Set<string>,
  breaks: readonly DateRange[]
): boolean {
  for (let day = addDaysToDate(from, 1); day < to; day = addDaysToDate(day, 1)) {
    if (!isDayOff(day, schoolDaySet, optionalDaySet, breaks)) return false;
  }
  return true;
}
