import { addDays } from "./dates";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Computes which ISO date strings (YYYY-MM-DD) within [rangeStart, rangeEnd]
 * match a recurrence pattern, respecting the schedule's own start/end bounds.
 *
 * - "once": the single start date, if it falls in range.
 * - "daily": every date in range.
 * - "weekly": dates whose weekday is in daysOfWeek, within weeks that land on
 *   the interval (intervalWeeks weeks after the schedule's own start date;
 *   1 = every week, 2 = every other week, etc).
 * - "monthly": dates matching the start date's day-of-month, clamped to the
 *   last day of shorter months (e.g. day 31 falls back to Feb 28/29).
 *
 * When schoolDays is provided, any date whose weekday isn't in it is
 * excluded — except for "once", which always honors the explicitly chosen
 * date regardless of the school-day list.
 */
export function getScheduledDates(
  frequency: "once" | "daily" | "weekly" | "monthly",
  daysOfWeek: string[] | null,
  intervalWeeks: number | null,
  startDate: string,
  endDate: string | null,
  rangeStart: string,
  rangeEnd: string,
  schoolDays: string[] | null = null
): string[] {
  const effectiveStart = startDate > rangeStart ? startDate : rangeStart;
  const effectiveEnd = endDate && endDate < rangeEnd ? endDate : rangeEnd;

  if (effectiveStart > effectiveEnd) return [];

  const daySet = frequency === "weekly" && daysOfWeek?.length ? new Set(daysOfWeek) : null;
  if (frequency === "weekly" && !daySet) return [];

  const schoolDaySet = schoolDays?.length ? new Set(schoolDays) : null;
  const interval = Math.max(1, intervalWeeks ?? 1);
  const monthDay = frequency === "monthly" ? dayOfMonth(startDate) : null;

  const results: string[] = [];
  let current = effectiveStart;

  while (current <= effectiveEnd) {
    if (frequency === "once") {
      if (current === startDate) results.push(current);
    } else if (!schoolDaySet || schoolDaySet.has(weekdayName(current))) {
      if (frequency === "daily") {
        results.push(current);
      } else if (frequency === "weekly" && matchesDay(current, daySet!) && weeksSince(startDate, current) % interval === 0) {
        results.push(current);
      } else if (frequency === "monthly" && matchesMonthDay(current, monthDay!)) {
        results.push(current);
      }
    }
    current = addDays(current, 1);
  }

  return results;
}

function weekdayName(isoDate: string): (typeof DAY_NAMES)[number] {
  const d = new Date(isoDate + "T00:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

function matchesDay(isoDate: string, daySet: Set<string>): boolean {
  return daySet.has(weekdayName(isoDate));
}

function dayOfMonth(isoDate: string): number {
  return new Date(isoDate + "T00:00:00Z").getUTCDate();
}

function matchesMonthDay(isoDate: string, monthDay: number): boolean {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDate();
  if (day === monthDay) return true;
  // Months shorter than monthDay (e.g. Feb for a day-31 schedule) fall back to the last day.
  const lastDayOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return monthDay > lastDayOfMonth && day === lastDayOfMonth;
}

/** Whole weeks between startDate and isoDate (isoDate must be >= startDate). */
function weeksSince(startDate: string, isoDate: string): number {
  const start = new Date(startDate + "T00:00:00Z").getTime();
  const current = new Date(isoDate + "T00:00:00Z").getTime();
  return Math.floor((current - start) / (7 * 24 * 60 * 60 * 1000));
}
