import { addDays } from "./dates";
import { weekdayOfDate } from "./schedule-days";
import { isDayOff, type StreakOptions } from "./streak";

const WEEKDAY_NAMES: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How a moved quest names the day it came from: "Monday, Aug 31".
 *
 * Takes no "today" on purpose — a moved card can sit weeks away from the day
 * it was set for, where "Yesterday"-style relative wording would mislead.
 */
export function formatMovedFrom(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return isoDate;
  return `${WEEKDAY_NAMES[weekdayOfDate(isoDate)]}, ${monthName} ${Number(day)}`;
}

/**
 * How far back a grown-up's missed-day list reaches.
 *
 * Deliberately longer than the hero-facing catch-up window
 * (`MAKEUP_LOOKBACK_DAYS`, 7 days): a parent needs to see far enough back to
 * find the day that cost a streak, while a hero should never be handed a month
 * of backlog.
 */
export const MISSED_DAYS_WINDOW = 30;

/** Statuses that mean the work on that day is still owed. */
const UNFINISHED = new Set(["pending", "stuck"]);

export type MissedDay = {
  date: string;
  /** Assignments still owed on that day. */
  unfinishedCount: number;
  /** True when nothing at all was logged that day. */
  empty: boolean;
  /** True for the one day that terminates the current streak. */
  brokeStreak: boolean;
};

export type MissedDaysInput = StreakOptions & {
  today: string;
  windowDays?: number;
  /**
   * The earliest date this hero can be said to have missed anything — their
   * first logged activity, or the day they were created if they have none.
   *
   * Without it, every school day between the start of the window and the day a
   * family joined is reported as missed, which is how a brand-new family gets
   * handed a month of backlog they were never asked for.
   */
  notBefore?: string | null;
  activeDates: Iterable<string>;
  assignments: readonly { date: string; status: string }[];
};

/**
 * The days a grown-up may still want to do something about: required school
 * days, inside the window, that either logged nothing or left work owed.
 *
 * Day-off-ness is asked of `isDayOff` — the streak's own rule — so excusing a
 * day removes it from this list by the same act that repairs the streak.
 *
 * `brokeStreak` marks the newest empty day, which is by construction the date
 * where `computeStreak` stops counting.
 */
export function selectMissedDays(input: MissedDaysInput): MissedDay[] {
  const { today, windowDays = MISSED_DAYS_WINDOW, assignments, notBefore } = input;
  const active = new Set(input.activeDates);

  const unfinishedByDate = new Map<string, number>();
  for (const a of assignments) {
    if (!UNFINISHED.has(a.status)) continue;
    unfinishedByDate.set(a.date, (unfinishedByDate.get(a.date) ?? 0) + 1);
  }

  const days: MissedDay[] = [];
  let breakerFound = false;

  for (let i = 1; i <= windowDays; i++) {
    const date = addDays(today, -i);
    if (notBefore && date < notBefore) break;
    if (isDayOff(date, input)) continue;

    const empty = !active.has(date);
    const unfinishedCount = unfinishedByDate.get(date) ?? 0;
    if (!empty && unfinishedCount === 0) continue;

    const brokeStreak = empty && !breakerFound;
    if (brokeStreak) breakerFound = true;

    days.push({ date, unfinishedCount, empty, brokeStreak });
  }

  return days;
}
