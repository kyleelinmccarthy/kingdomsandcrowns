export function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return formatDate(d);
}

export function getWeekEndDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Sunday
  d.setDate(diff);
  return formatDate(d);
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function toISODate(date: Date): string {
  return formatDate(date);
}

/** Shifts an ISO date string (YYYY-MM-DD) by whole days. UTC-based so it never drifts across a DST boundary. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The calendar date at a given instant, in a given IANA timezone.
 *
 * This is the ONLY function that turns an instant into a calendar date. Every
 * "what day is it?" in the app goes through it, because the answer depends
 * entirely on where the family lives: 02:00 UTC is still yesterday evening in
 * Denver, and already tomorrow in Auckland.
 *
 * `en-CA` is used because it formats as YYYY-MM-DD natively, and Intl handles
 * DST transitions correctly — which a stored UTC offset would not.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The Monday of the week containing `isoDate`.
 *
 * Calendar arithmetic, not an instant: the fixed frame keeps the answer the
 * same regardless of the host's timezone. Sunday belongs to the week that just
 * ended, matching how the rest of the app reads a week.
 */
export function weekStartOf(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const weekday = d.getUTCDay(); // 0 = Sunday
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(isoDate, delta);
}

/** The Sunday of the week containing `isoDate`. See `weekStartOf` for why Sunday ends the week. */
export function weekEndOf(isoDate: string): string {
  return addDays(weekStartOf(isoDate), 6);
}
