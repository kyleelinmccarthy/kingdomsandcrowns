/**
 * Corrects calendar dates stored by the UTC-derivation bug.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx tsx scripts/backfill-timezone-dates.ts
 *   npx tsx scripts/backfill-timezone-dates.ts --apply
 *
 * Only two columns qualify: activity_log.date and child.last_active_date.
 * Everything else derives from calendar arithmetic over a schedule, and
 * shifting those would move scheduled work to the wrong day.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import { correctedDate } from "../src/lib/utils/backfill-dates";
import { usableTimeZone, DEFAULT_TIMEZONE } from "../src/lib/services/family-timezone";

const APPLY = process.argv.includes("--apply");

async function main() {
  const families = await db
    .select({ id: schema.family.id, timezone: schema.family.timezone })
    .from(schema.family);
  const zoneByFamily = new Map(families.map((f) => [f.id, usableTimeZone(f.timezone)]));

  const children = await db
    .select({ id: schema.child.id, familyId: schema.child.familyId, lastActiveDate: schema.child.lastActiveDate, updatedAt: schema.child.updatedAt })
    .from(schema.child);
  const zoneByChild = new Map(
    children.map((c) => [c.id, zoneByFamily.get(c.familyId) ?? DEFAULT_TIMEZONE])
  );

  let activityChanges = 0;
  const activities = await db
    .select({ id: schema.activityLog.id, childId: schema.activityLog.childId, date: schema.activityLog.date, createdAt: schema.activityLog.createdAt })
    .from(schema.activityLog);

  for (const row of activities) {
    const tz = zoneByChild.get(row.childId) ?? DEFAULT_TIMEZONE;
    const next = correctedDate({ storedDate: row.date, createdAt: row.createdAt }, tz);
    if (!next) continue;
    activityChanges++;
    console.log(`activity_log ${row.id}  ${row.date} -> ${next}  (${tz})`);
    if (APPLY) {
      await db.update(schema.activityLog).set({ date: next }).where(eq(schema.activityLog.id, row.id));
    }
  }

  let childChanges = 0;
  for (const c of children) {
    if (!c.lastActiveDate) continue;
    const tz = zoneByChild.get(c.id) ?? DEFAULT_TIMEZONE;
    // last_active_date has no created_at of its own; updatedAt is when it was last written.
    const next = correctedDate({ storedDate: c.lastActiveDate, createdAt: c.updatedAt }, tz);
    if (!next) continue;
    childChanges++;
    console.log(`child ${c.id}  last_active_date ${c.lastActiveDate} -> ${next}  (${tz})`);
    if (APPLY) {
      await db.update(schema.child).set({ lastActiveDate: next }).where(eq(schema.child.id, c.id));
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY RUN — nothing written"}: ` +
      `${activityChanges} activity_log rows, ${childChanges} children.`
  );
  if (!APPLY && activityChanges + childChanges > 0) {
    console.log("Re-run with --apply to write these changes.");
  }
  console.log(
    "\nNote: streaks are computed from activity_log.date, so a child's current " +
      "streak may change after applying. That is the bug being corrected."
  );
}

main();
