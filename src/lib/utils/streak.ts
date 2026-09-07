import { formatDate } from "./dates";
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
  /**
   * Dates a grown-up excused after the fact — a sick day, an appointment, a
   * holiday nobody had entered yet. Skipped exactly like a break: an empty one
   * never resets the streak, and activity logged on one still counts toward it.
   */
  excusedDates?: readonly string[] | null;
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
 */
export function computeStreak(
  activeDates: Iterable<string>,
  today: Date = new Date(),
  options: StreakOptions = {}
): number {
  const active = new Set(activeDates);
  let streak = 0;
  const cursor = new Date(today);

  for (let i = 0; i < 365; i++) {
    const dateStr = formatDate(cursor);
    if (active.has(dateStr)) {
      streak++;
    } else if (i !== 0 && !isDayOff(dateStr, options)) {
      // A school day with nothing logged ends the streak. (i === 0 is today,
      // which may simply not have an activity logged yet.)
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/**
 * True when nothing is expected on this date — not a school day, marked
 * optional, inside a break, or excused after the fact.
 *
 * Exported because the missed-days panel must ask exactly the question the
 * streak asks. Two copies of this rule is how the two would drift apart.
 */
export function isDayOff(isoDate: string, options: StreakOptions): boolean {
  const weekday = weekdayOfDate(isoDate);
  if (options.schoolDays?.length && !options.schoolDays.includes(weekday)) return true;
  if (options.optionalDays?.includes(weekday)) return true;
  if (options.excusedDates?.includes(isoDate)) return true;
  return (options.breaks ?? []).some((b) => isoDate >= b.startDate && isoDate <= b.endDate);
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
  const sorted = [...new Set(activeDates)].sort();

  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const date of sorted) {
    run = previous !== null && gapIsAllDaysOff(previous, date, options) ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  return longest;
}

/** True when every day strictly between two active dates is a day off. */
function gapIsAllDaysOff(from: string, to: string, options: StreakOptions): boolean {
  for (let day = addDaysToDate(from, 1); day < to; day = addDaysToDate(day, 1)) {
    if (!isDayOff(day, options)) return false;
  }
  return true;
}
