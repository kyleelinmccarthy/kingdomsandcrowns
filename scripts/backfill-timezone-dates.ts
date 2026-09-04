/**
 * Corrects calendar dates stored by the UTC-derivation bug.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx tsx scripts/backfill-timezone-dates.ts
 *   npx tsx scripts/backfill-timezone-dates.ts --apply
 *
 * Only two columns are backfilled here: activity_log.date and
 * child.last_active_date. A third column, wage_ledger_entry.date, is also
 * instant-derived (see src/lib/actions/wages.ts) but needs no backfill: the
 * Upkeep feature that writes it has never shipped, so there is no historical
 * wage data predating the fix to correct.
 *
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
    .select({ id: schema.family.id, familyName: schema.family.familyName, timezone: schema.family.timezone })
    .from(schema.family);
  const zoneByFamily = new Map(families.map((f) => [f.id, usableTimeZone(f.timezone)]));
  const nameByFamily = new Map(families.map((f) => [f.id, f.familyName]));

  const children = await db
    .select({ id: schema.child.id, familyId: schema.child.familyId, lastActiveDate: schema.child.lastActiveDate, updatedAt: schema.child.updatedAt })
    .from(schema.child);
  const zoneByChild = new Map(
    children.map((c) => [c.id, zoneByFamily.get(c.familyId) ?? DEFAULT_TIMEZONE])
  );
  const familyByChild = new Map(children.map((c) => [c.id, c.familyId]));

  // Per-family counts, so an operator running this against a multi-family
  // deployment can see which families are affected without re-reading every
  // logged row.
  const changesByFamily = new Map<string, { activity: number; child: number }>();
  function bump(familyId: string, key: "activity" | "child") {
    const entry = changesByFamily.get(familyId) ?? { activity: 0, child: 0 };
    entry[key]++;
    changesByFamily.set(familyId, entry);
  }

  let activityChanges = 0;
  const activities = await db
    .select({ id: schema.activityLog.id, childId: schema.activityLog.childId, date: schema.activityLog.date, createdAt: schema.activityLog.createdAt })
    .from(schema.activityLog);

  for (const row of activities) {
    const tz = zoneByChild.get(row.childId) ?? DEFAULT_TIMEZONE;
    const next = correctedDate({ storedDate: row.date, createdAt: row.createdAt }, tz);
    if (!next) continue;
    activityChanges++;
    const familyId = familyByChild.get(row.childId);
    if (familyId) bump(familyId, "activity");
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
    bump(c.familyId, "child");
    console.log(`child ${c.id}  last_active_date ${c.lastActiveDate} -> ${next}  (${tz})`);
    if (APPLY) {
      await db.update(schema.child).set({ lastActiveDate: next }).where(eq(schema.child.id, c.id));
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY RUN — nothing written"}: ` +
      `${activityChanges} activity_log rows, ${childChanges} children.`
  );

  console.log("\nPer-family summary:");
  if (changesByFamily.size === 0) {
    console.log("  (no rows needed correction)");
  } else {
    for (const [familyId, counts] of changesByFamily) {
      const name = nameByFamily.get(familyId) ?? familyId;
      console.log(
        `  ${name} (${familyId}): ${counts.activity} activity_log row(s), ${counts.child} child(ren)`
      );
    }
  }

  if (!APPLY && activityChanges + childChanges > 0) {
    console.log("\nRe-run with --apply to write these changes.");
  }
  console.log(
    "\nNote: streaks are computed from activity_log.date but are stored, not " +
      "derived on read — child.current_streak/longest_streak stay exactly as " +
      "they are until each hero's next activity log recomputes them. After " +
      "applying, run src/lib/db/backfill-streaks.ts to bring streaks in line " +
      "with the corrected dates immediately rather than waiting on that."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
