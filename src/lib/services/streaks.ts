import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/dates";
import { computeStreak, computeLongestStreak, type DateRange } from "@/lib/utils/streak";
import { parseSchoolDays, parseStreakOptionalDays } from "@/lib/utils/schedule-days";

/**
 * Re-deriving stored streaks after something other than an activity log
 * changed the rules.
 *
 * A streak is stored on the hero row, but it is only ever *computed* from the
 * activity history plus the days where nothing is expected: non-school
 * weekdays, optional days, and school breaks. Logging an activity recomputes
 * it. Marking today a holiday changes the same answer without touching a
 * single log, so the stored number would otherwise stay wrong until the hero's
 * next activity — which, on a holiday, is exactly the thing that isn't going
 * to happen.
 *
 * Plain module, not a "use server" action file: the caller has already
 * authorized the family whose calendar changed.
 */

/** How far back a streak can reach, matching the cap inside `computeStreak`. */
const LOOKBACK_DAYS = 365;

/**
 * Recomputes `current_streak` and `longest_streak` for every hero in a family
 * against the family's current school calendar.
 *
 * `longest_streak` is only ever raised, never lowered — an existing record the
 * logs can't explain (seeded or imported data) is left alone, the same rule the
 * backfill script follows.
 *
 * Returns the number of heroes whose stored streak actually moved.
 */
export async function recomputeFamilyStreaks(
  familyId: string,
  today: Date = new Date()
): Promise<number> {
  const children = await db
    .select({
      id: schema.child.id,
      schoolDays: schema.child.schoolDays,
      streakOptionalDays: schema.child.streakOptionalDays,
      currentStreak: schema.child.currentStreak,
      longestStreak: schema.child.longestStreak,
    })
    .from(schema.child)
    .where(eq(schema.child.familyId, familyId));

  if (children.length === 0) return 0;

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - LOOKBACK_DAYS);
  const windowStartDate = formatDate(windowStart);
  const childIds = children.map((c) => c.id);

  // Two reads for the whole family rather than two per hero: this runs from a
  // server action a parent is waiting on.
  const [breaks, activeDays] = await Promise.all([
    db
      .select({
        startDate: schema.schoolBreak.startDate,
        endDate: schema.schoolBreak.endDate,
      })
      .from(schema.schoolBreak)
      .where(
        and(
          eq(schema.schoolBreak.familyId, familyId),
          gte(schema.schoolBreak.endDate, windowStartDate)
        )
      ),
    db
      .select({
        childId: schema.activityLog.childId,
        date: schema.activityLog.date,
      })
      .from(schema.activityLog)
      .where(
        and(
          inArray(schema.activityLog.childId, childIds),
          gte(schema.activityLog.date, windowStartDate)
        )
      )
      .groupBy(schema.activityLog.childId, schema.activityLog.date),
  ]);

  const datesByChild = new Map<string, string[]>();
  for (const row of activeDays) {
    const list = datesByChild.get(row.childId);
    if (list) list.push(row.date);
    else datesByChild.set(row.childId, [row.date]);
  }

  const breakRanges: DateRange[] = breaks;
  let changed = 0;

  for (const child of children) {
    const options = {
      schoolDays: parseSchoolDays(child.schoolDays),
      optionalDays: parseStreakOptionalDays(child.streakOptionalDays),
      breaks: breakRanges,
    };
    const dates = datesByChild.get(child.id) ?? [];

    const currentStreak = computeStreak(dates, today, options);
    const longestStreak = Math.max(
      child.longestStreak,
      currentStreak,
      computeLongestStreak(dates, options)
    );

    if (currentStreak === child.currentStreak && longestStreak === child.longestStreak) {
      continue;
    }

    await db
      .update(schema.child)
      .set({ currentStreak, longestStreak, updatedAt: new Date() })
      .where(eq(schema.child.id, child.id));
    changed++;
  }

  return changed;
}
