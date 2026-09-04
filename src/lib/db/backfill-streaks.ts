/**
 * Repairs hero streaks that an earlier, day-off-blind calculation reset.
 *
 * Streaks used to break on any calendar day with no logged activity, so a
 * weekend, a day off, or a school break zeroed them out. This recomputes both
 * `current_streak` and `longest_streak` from each hero's activity history using
 * the school-day aware rules — exactly what the app now applies on every
 * activity log — so nobody has to wait for their next log to be made whole.
 *
 * `longest_streak` is only ever raised, never lowered: an existing record that
 * the logs can't explain (imported or seeded data) is left alone.
 *
 * Idempotent — running it twice changes nothing the second time.
 *
 * Run with:
 *   npx tsx --env-file=.env.prod src/lib/db/backfill-streaks.ts
 * Add --dry-run to print the changes without writing them.
 */
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { computeStreak, computeLongestStreak, type DateRange } from "../utils/streak";
import { parseSchoolDays, parseStreakOptionalDays } from "../utils/schedule-days";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

const dryRun = process.argv.includes("--dry-run");

async function main() {
  // A single UTC snapshot for the whole run, not a per-family timezone: this
  // script sweeps every family in one pass, so there is no single "today" to
  // resolve per child. computeStreak takes an ISO date string.
  const today = new Date().toISOString().slice(0, 10);

  // Three whole-table reads instead of a few queries per hero — this usually
  // runs against a remote database, where round-trips dominate.
  const [children, breakRows, activityRows] = await Promise.all([
    db
      .select({
        id: schema.child.id,
        familyId: schema.child.familyId,
        displayName: schema.child.displayName,
        schoolDays: schema.child.schoolDays,
        streakOptionalDays: schema.child.streakOptionalDays,
        currentStreak: schema.child.currentStreak,
        longestStreak: schema.child.longestStreak,
        banishedAt: schema.child.banishedAt,
      })
      .from(schema.child),
    db
      .select({
        familyId: schema.schoolBreak.familyId,
        startDate: schema.schoolBreak.startDate,
        endDate: schema.schoolBreak.endDate,
      })
      .from(schema.schoolBreak),
    db
      .select({
        childId: schema.activityLog.childId,
        date: schema.activityLog.date,
      })
      .from(schema.activityLog)
      .groupBy(schema.activityLog.childId, schema.activityLog.date),
  ]);

  const breaksByFamily = new Map<string, DateRange[]>();
  for (const row of breakRows) {
    const list = breaksByFamily.get(row.familyId) ?? [];
    list.push({ startDate: row.startDate, endDate: row.endDate });
    breaksByFamily.set(row.familyId, list);
  }

  const datesByChild = new Map<string, string[]>();
  for (const row of activityRows) {
    const list = datesByChild.get(row.childId) ?? [];
    list.push(row.date);
    datesByChild.set(row.childId, list);
  }

  let repaired = 0;
  let unchanged = 0;

  for (const child of children) {
    const options = {
      schoolDays: parseSchoolDays(child.schoolDays),
      optionalDays: parseStreakOptionalDays(child.streakOptionalDays),
      breaks: breaksByFamily.get(child.familyId) ?? [],
    };
    const dates = datesByChild.get(child.id) ?? [];

    const currentStreak = computeStreak(dates, today, options);
    // Never lower an existing record — only repair one the logs prove is short.
    const longestStreak = Math.max(
      child.longestStreak,
      currentStreak,
      computeLongestStreak(dates, options)
    );

    if (currentStreak === child.currentStreak && longestStreak === child.longestStreak) {
      unchanged++;
      continue;
    }

    const changes = [
      `current ${child.currentStreak} -> ${currentStreak}`,
      `longest ${child.longestStreak} -> ${longestStreak}`,
    ].join(", ");
    const banished = child.banishedAt ? " (banished)" : "";
    console.log(`${child.displayName}${banished}: ${changes}`);

    if (!dryRun) {
      await db
        .update(schema.child)
        .set({ currentStreak, longestStreak, updatedAt: new Date() })
        .where(eq(schema.child.id, child.id));
    }
    repaired++;
  }

  const verb = dryRun ? "would be repaired" : "repaired";
  console.log(
    `\nStreak backfill complete: ${repaired} hero(es) ${verb}, ${unchanged} already correct.`
  );
  if (dryRun) console.log("Dry run — nothing was written.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.close());
