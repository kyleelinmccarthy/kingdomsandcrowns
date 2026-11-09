// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

/**
 * The bounty against a REAL Postgres database, which is what production runs on Railway.
 * The other bounty test mocks the services; this one exists because the defect was between the
 * services — a read of the allowance, then an award, then the writes — and only a real database
 * shows two calls interleaving across those awaits. It is also what proves the
 * `pg_advisory_xact_lock` in `awardTroubleClears` actually serializes two concurrent calls, which
 * Postgres's default isolation does not do on its own.
 *
 * Runs in its own schema so it can share a Postgres server with the other real-database tests
 * without their tables colliding.
 */
const SCHEMA = "test_bounty_db";
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
});
const testDb = drizzle(client, { schema });

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: async () => ({ access: { userId: "child:c1" }, familyId: "f1" }),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const { recordTroubleClears } = await import("./realm-play");

async function clearsRecorded(): Promise<number> {
  const r = await client.query("SELECT count(*) AS n FROM realm_trouble_clear WHERE child_id = 'c1'");
  return Number(r.rows[0].n);
}

// The three tables the bounty touches, as the migrations make them (foreign keys left out: no
// child or family rows are needed to prove the ledger's arithmetic).
const DDL = [
  `CREATE TABLE realm_settings (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL UNIQUE,
    enabled boolean DEFAULT true NOT NULL, access_mode text DEFAULT 'earned' NOT NULL,
    earned_minutes_per_quest integer DEFAULT 5 NOT NULL, off_hours_enabled boolean DEFAULT false NOT NULL,
    daily_cap_minutes integer DEFAULT 30 NOT NULL, tone_mode text DEFAULT 'gentle' NOT NULL,
    help_seen_at timestamptz, starter_spell_at timestamptz, depth_override text DEFAULT 'auto' NOT NULL,
    tutorial_step integer DEFAULT 0 NOT NULL, trouble_bonus_cap_minutes integer DEFAULT 5 NOT NULL,
    side_quest_length integer DEFAULT 8 NOT NULL, second_chances boolean DEFAULT true NOT NULL,
    daily_allowance_minutes integer DEFAULT 10 NOT NULL, minutes_per_star integer DEFAULT 1 NOT NULL,
    side_quest_daily_cap_minutes integer DEFAULT 15 NOT NULL, bank_cap_minutes integer DEFAULT 30 NOT NULL,
    sound text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`,
  `CREATE TABLE realm_play_ledger (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, kind text NOT NULL,
    minutes integer NOT NULL, source_assignment_id text, source_run_id text, created_at timestamptz NOT NULL)`,
  `CREATE INDEX realm_play_ledger_child_date_idx ON realm_play_ledger (child_id, date)`,
  `CREATE UNIQUE INDEX realm_play_ledger_allowance_day_idx ON realm_play_ledger (child_id, date) WHERE "realm_play_ledger"."kind" = 'allowance'`,
  `CREATE UNIQUE INDEX realm_play_ledger_carried_day_idx ON realm_play_ledger (child_id, date) WHERE "realm_play_ledger"."kind" = 'carried'`,
  `CREATE UNIQUE INDEX realm_play_ledger_practice_run_idx ON realm_play_ledger (source_run_id) WHERE "realm_play_ledger"."kind" = 'practice'`,
  `CREATE TABLE realm_trouble_clear (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, home_id text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL, created_at timestamptz NOT NULL)`,
  `CREATE UNIQUE INDEX realm_trouble_clear_paid_unique_idx ON realm_trouble_clear (child_id, date, home_id) WHERE "realm_trouble_clear"."minutes" > 0`,
];

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear"]) await client.query(`DELETE FROM ${t}`);
  // Plenty of schoolwork, so the parent's cap of 5 is the only ceiling.
  await client.query(
    "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('e1', 'c1', $1, 'earned', 20, NOW())",
    [today],
  );
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
});

async function bonusBanked(): Promise<number> {
  const r = await client.query(
    "SELECT coalesce(sum(minutes), 0) AS n FROM realm_play_ledger WHERE child_id = 'c1' AND date = $1 AND kind = 'bonus'",
    [today],
  );
  return Number(r.rows[0].n);
}

async function clearsPaid(): Promise<number> {
  const r = await client.query(
    "SELECT coalesce(sum(minutes), 0) AS n FROM realm_trouble_clear WHERE child_id = 'c1' AND date = $1",
    [today],
  );
  return Number(r.rows[0].n);
}

describe("recordTroubleClears — two calls at once (two tabs, or a replayed request)", () => {
  it("pays the day's allowance once between them, never once each", async () => {
    const a = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-highcairn"];
    const b = ["place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-8"];
    const results = await Promise.allSettled([recordTroubleClears("c1", today, a), recordTroubleClears("c1", today, b)]);
    for (const r of results) expect(r.status, String((r as PromiseRejectedResult).reason)).toBe("fulfilled");
    const awarded = results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.awarded : 0), 0);

    expect(await bonusBanked()).toBe(5);
    expect(await clearsPaid()).toBe(5);
    expect(awarded).toBe(5);
  });
});

describe("recordTroubleClears — what a batch earns", () => {
  it("pays a minute a clear, once per home, up to the day's cap", async () => {
    const first = await recordTroubleClears("c1", today, ["rim-0", "rim-1", "rim-0"]);
    expect(first.awarded).toBe(2);
    expect(first.status).toMatchObject({ paidMinutes: 2, remainingMinutes: 3, clearsToday: 3 });
    const more = await recordTroubleClears("c1", today, ["rim-2", "place-cove-7", "place-summit-3", "place-mire-4"]);
    expect(more.awarded).toBe(3);
    expect(more.status.remainingMinutes).toBe(0);
    const capped = await recordTroubleClears("c1", today, ["place-ringstones"]);
    expect(capped.awarded).toBe(0);
    expect(capped.status.clearsToday).toBe(8);
    expect(await bonusBanked()).toBe(5);
  });

  it("drops clears past the per-minute limit instead of recording them", async () => {
    const homes = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-highcairn", "place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-8"];
    await recordTroubleClears("c1", today, homes); // 10
    await recordTroubleClears("c1", today, homes.slice(0, 9)); // 19
    const r = await recordTroubleClears("c1", today, ["rim-0", "rim-1", "rim-2"]);
    expect(r.status.clearsToday).toBe(20);
    await recordTroubleClears("c1", today, ["place-cove-7"]);
    expect(await clearsRecorded()).toBe(20);
  });

  it("pays nothing in open mode, where minutes are never read", async () => {
    await client.query(
      "INSERT INTO realm_settings (id, child_id, access_mode, created_at, updated_at) VALUES ('s1', 'c1', 'open', NOW(), NOW())",
    );
    const r = await recordTroubleClears("c1", today, ["rim-0"]);
    expect(r.awarded).toBe(0);
    expect(r.status.enabled).toBe(false);
    expect(await bonusBanked()).toBe(0);
  });
});
