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

/**
 * Today's date (YYYY-MM-DD) as it reads in a given IANA time zone, not the
 * server's UTC date. Falls back to the UTC date if the time zone is invalid.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return formatDate(now);
  }
}
