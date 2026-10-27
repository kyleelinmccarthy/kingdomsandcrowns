/**
 * One-off: copies every row from the old Turso (libSQL) database into the new Postgres 18
 * database, table by table, in dependency order (parents before the children that
 * reference them). Run once, before DNS cutover, against a Postgres database that has already
 * had `npm run db:migrate` applied to it (so the tables exist).
 *
 * Converts SQLite's integer-encoded booleans and timestamps into real Postgres `boolean`/
 * `timestamp` values based on each destination column's type — the two dialects' schemas are
 * otherwise identical (same table and column names), so no other per-table mapping is needed.
 *
 * Not idempotent: run against an empty destination schema. Re-running after a partial run will
 * fail on primary-key conflicts rather than silently duplicating rows, which is the safer default
 * for a one-shot cutover script.
 *
 * Run with:
 *   TURSO_DATABASE_URL='<prod-url>' TURSO_AUTH_TOKEN='<prod-token>' DATABASE_URL='<postgres-direct-url>' \
 *     npx tsx src/lib/db/migrate-data-from-turso.ts
 * Add --dry-run to report row counts per table without writing anything.
 */
import { createClient } from "@libsql/client";
import { getTableColumns, getTableName } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Parents before the children that reference them.
const TABLE_ORDER = [
  "user", "session", "account", "verification",
  "family", "subscription", "familyMember", "child", "familyMemberChild", "familyInvite",
  "childConsent", "childLoginLink", "childPinAttempt",
  "subject", "scheduleBlock", "activityLog", "missedSubject", "weeklySummary", "teacherFeedback",
  "badge", "childBadge", "notificationPreference", "pushSubscription",
  "quest", "questResource", "questSchedule", "questAssignment", "questReminder",
  "schoolBreak", "makeupDay", "excusedDay", "castle", "season",
  "realmSettings", "recessBlock", "learningProfile", "realmVisitorSound",
  "realmPlayLedger", "realmTroubleClear", "realmPlaceFound", "realmRecessRecord",
  "spell", "drillItem", "skillMastery", "deedRun", "kingdomProgress",
  "feedback", "childAvatarUnlock", "parentAlert", "parentAlertDismissal",
  "upkeepTask", "upkeepTaskSchedule", "upkeepTaskAssignment", "wageLedgerEntry",
] as const satisfies readonly (keyof typeof schema)[];

const dryRun = process.argv.includes("--dry-run");

const sourceClient = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const destDb = drizzle(pool, { schema });

/** Raw SQLite values -> the JS values the destination Postgres column expects. */
function convertRow(table: (typeof schema)[keyof typeof schema], row: Record<string, unknown>) {
  const columns = getTableColumns(table as never);
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const raw = row[(column as { name: string }).name];
    const columnType = (column as { columnType: string }).columnType;
    if (raw === null || raw === undefined) {
      out[key] = null;
    } else if (columnType === "PgBoolean") {
      out[key] = Boolean(raw);
    } else if (columnType === "PgTimestamp") {
      out[key] = new Date(Number(raw) * 1000);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

async function copyTable(tableName: (typeof TABLE_ORDER)[number]) {
  const table = schema[tableName];
  const dbTableName = getTableName(table as never);
  const { rows } = await sourceClient.execute(`SELECT * FROM "${dbTableName}"`);
  console.log(`${tableName}: ${rows.length} row(s)`);
  if (dryRun || rows.length === 0) return;

  const values = rows.map((r) => convertRow(table, r as unknown as Record<string, unknown>));
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    await destDb.insert(table as never).values(values.slice(i, i + BATCH) as never);
  }
}

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.DATABASE_URL) {
    throw new Error("Set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, and DATABASE_URL before running this script.");
  }
  for (const tableName of TABLE_ORDER) {
    await copyTable(tableName);
  }
  console.log(dryRun ? "\nDry run — nothing was written." : "\nData migration complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
