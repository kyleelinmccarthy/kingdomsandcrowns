import { addDaysToDate } from "./schedule-days";

export type HolidayPreset = { name: string; startDate: string; endDate: string };

const MONDAY = 1;
const THURSDAY = 4;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** The date of the nth (1-based) occurrence of a weekday (0=Sun..6=Sat) in a month. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return isoDate(year, month, 1 + offset + (n - 1) * 7);
}

/** The date of the last occurrence of a weekday (0=Sun..6=Sat) in a month. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lastDayWeekday = new Date(Date.UTC(year, month, lastDay)).getUTCDay();
  const offset = (lastDayWeekday - weekday + 7) % 7;
  return isoDate(year, month, lastDay - offset);
}

/**
 * A default set of common US school holidays/breaks for the school year
 * containing `referenceDate` (a school year runs July through June, so a
 * reference date in July already counts as the start of the year ahead).
 *
 * These are reasonable defaults meant to be reviewed and adjusted before
 * saving -- actual school calendars (especially spring break) vary by
 * district, so exact dates here are approximations.
 */
export function getDefaultUSSchoolHolidays(referenceDate: Date = new Date()): HolidayPreset[] {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const startYear = month >= 6 ? year : year - 1; // Jul (6, 0-indexed) or later starts the school year
  const endYear = startYear + 1;

  const thanksgivingThursday = nthWeekdayOfMonth(startYear, 10, THURSDAY, 4); // November
  const springBreakStart = nthWeekdayOfMonth(endYear, 2, MONDAY, 3); // March

  const laborDay = nthWeekdayOfMonth(startYear, 8, MONDAY, 1); // September
  const mlkDay = nthWeekdayOfMonth(endYear, 0, MONDAY, 3); // January
  const presidentsDay = nthWeekdayOfMonth(endYear, 1, MONDAY, 3); // February
  const memorialDay = lastWeekdayOfMonth(endYear, 4, MONDAY); // May

  return [
    { name: "Labor Day", startDate: laborDay, endDate: laborDay },
    {
      name: "Thanksgiving Break",
      startDate: addDaysToDate(thanksgivingThursday, -1),
      endDate: addDaysToDate(thanksgivingThursday, 1),
    },
    { name: "Winter Break", startDate: isoDate(startYear, 11, 23), endDate: isoDate(endYear, 0, 2) },
    { name: "MLK Day", startDate: mlkDay, endDate: mlkDay },
    { name: "Presidents Day", startDate: presidentsDay, endDate: presidentsDay },
    { name: "Spring Break", startDate: springBreakStart, endDate: addDaysToDate(springBreakStart, 4) },
    { name: "Memorial Day", startDate: memorialDay, endDate: memorialDay },
    { name: "Summer Break", startDate: isoDate(endYear, 5, 1), endDate: isoDate(endYear, 7, 15) },
  ];
}
