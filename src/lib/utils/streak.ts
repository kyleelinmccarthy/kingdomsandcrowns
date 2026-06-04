import { formatDate } from "./dates";

/**
 * Compute the current activity streak from the set of dates (YYYY-MM-DD) that
 * have at least one logged activity.
 *
 * Counting walks backwards from `today`: each consecutive day with activity
 * extends the streak. Today is allowed to have no activity yet (the streak is
 * measured from yesterday in that case) — the first gap on any earlier day
 * ends the streak. The look-back is capped at 365 days.
 *
 * This mirrors the original day-by-day query loop, but as a pure function over
 * an already-fetched set of dates, so the streak can be derived from a single
 * database query instead of up to 365 sequential round-trips.
 */
export function computeStreak(activeDates: Iterable<string>, today: Date = new Date()): number {
  const active = new Set(activeDates);
  let streak = 0;
  const cursor = new Date(today);

  for (let i = 0; i < 365; i++) {
    const dateStr = formatDate(cursor);
    if (active.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Today may not have an activity logged yet — don't break the streak.
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
