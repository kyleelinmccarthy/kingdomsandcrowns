import { addDaysToDate } from "./schedule-days";

/** An inclusive ISO ("YYYY-MM-DD") span of days off — a holiday or a break. */
export type BreakRange = {
  id?: string;
  name?: string;
  startDate: string;
  endDate: string;
};

/** The month (1-indexed) a school year rolls over on: August. */
const SCHOOL_YEAR_START_MONTH = 8;

/** The longest span a single break may cover, so a typo can't blank out a year. */
export const MAX_BREAK_DAYS = 200;

/** True for a well-formed, real ISO "YYYY-MM-DD" calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  // Round-tripping through Date catches Feb 30 and friends without a table.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

/** Whole days covered by an inclusive range — a single-day holiday is 1. */
export function daysInRange(startDate: string, endDate: string): number {
  let count = 0;
  for (let day = startDate; day <= endDate; day = addDaysToDate(day, 1)) count++;
  return count;
}

/** The first break covering this date, or null when it's an ordinary day. */
export function findCoveringBreak<T extends BreakRange>(
  isoDate: string,
  breaks: readonly T[]
): T | null {
  return breaks.find((b) => isoDate >= b.startDate && isoDate <= b.endDate) ?? null;
}

/** Breaks that share at least one day with the given range. */
export function findOverlappingBreaks<T extends BreakRange>(
  startDate: string,
  endDate: string,
  breaks: readonly T[],
  ignoreId?: string
): T[] {
  return breaks.filter(
    (b) => b.id !== ignoreId && startDate <= b.endDate && endDate >= b.startDate
  );
}

/**
 * The school year an ISO date belongs to, named by the calendar year it starts
 * in. August onward belongs to the year that just began; July and earlier
 * belong to the year before, so a whole academic year stays in one bucket.
 */
export function schoolYearOf(isoDate: string): number {
  const [year, month] = isoDate.split("-").map(Number);
  return month >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
}

/** "2026–27", the label for a school year identified by its starting year. */
export function schoolYearLabel(startYear: number): string {
  return `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Breaks bucketed into school years, newest year first and each year's breaks
 * in calendar order. A break straddling the August rollover (rare, but a
 * summer break spans it by definition) is filed under the year it starts in.
 */
export function groupBreaksBySchoolYear<T extends BreakRange>(
  breaks: readonly T[]
): { startYear: number; label: string; breaks: T[] }[] {
  const byYear = new Map<number, T[]>();
  for (const b of breaks) {
    const year = schoolYearOf(b.startDate);
    const list = byYear.get(year);
    if (list) list.push(b);
    else byYear.set(year, [b]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([startYear, list]) => ({
      startYear,
      label: schoolYearLabel(startYear),
      breaks: [...list].sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)
      ),
    }));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Reads an ISO date as its own calendar parts — never shifted by a timezone. */
function parts(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

/** "Sep 7, 2026" — plain, and immune to the UTC-vs-local off-by-a-day trap. */
export function formatBreakDate(isoDate: string): string {
  const { year, month, day } = parts(isoDate);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/**
 * A one-line span: a single day reads as one date, a span inside one year
 * drops the repeated year, and anything else spells out both ends.
 */
export function formatBreakRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatBreakDate(startDate);
  const s = parts(startDate);
  const e = parts(endDate);
  if (s.year !== e.year) {
    return `${formatBreakDate(startDate)} – ${formatBreakDate(endDate)}`;
  }
  return `${MONTHS[s.month - 1]} ${s.day} – ${MONTHS[e.month - 1]} ${e.day}, ${e.year}`;
}
