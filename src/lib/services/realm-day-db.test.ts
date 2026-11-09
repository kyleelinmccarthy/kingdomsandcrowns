// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL, REALM_TROUBLE_CLEAR_DDL } from "@/test/realm-db-ddl";

/**
 * Opening a Realm day against a REAL Postgres database: the child's own first access check of
 * the server's day writes the free allowance and yesterday's bank exactly once (spec 2026-11-09
 * §4.2, §4.4). Only a real database shows the once-a-day guarantees holding — the partial unique
 * indexes and the child's advisory lock — and the carry chain reading back what an earlier day
 * actually left.
 *
 * Runs in its own schema so it can share a Postgres server with the other real-database tests.
 */
const SCHEMA = "test_realm_day_db";
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
});
const testDb = drizzle(client, { schema });

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const CHILD = { access: { userId: "child:c1" }, familyId: "f1" };
const PARENT = { access: { userId: "u-parent" }, familyId: "f1" };
let actor = CHILD;
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: async () => actor,
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

// The server's day; each test moves it as the family's calendar would.
let today = "2026-11-09";
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: today, timeOfDay: "10:00" }) }));

const { getRealmAccess, getRealmPlaySummary, getTroubleBounty, grantRealmMinutes, recordRealmPlay, recordTroubleClears } = await import("@/lib/actions/realm-play");
const { grantEarnedMinutesForCompletion } = await import("@/lib/services/realm-play");

const DDL = [...REALM_SETTINGS_DDL, ...REALM_LEDGER_DDL, ...REALM_TROUBLE_CLEAR_DDL, ...REALM_ACCESS_DDL];

beforeAll(async () => {
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear", "recess_block"]) await client.query(`DELETE FROM ${t}`);
  actor = CHILD;
  today = "2026-11-09";
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
});

let seq = 0;
async function row(date: string, kind: string, minutes: number) {
  await client.query(
    "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ($1, 'c1', $2, $3, $4, NOW())",
    [`r${++seq}`, date, kind, minutes],
  );
}

async function settings(cols: Record<string, string | number>) {
  await client.query(
    "INSERT INTO realm_settings (id, child_id, created_at, updated_at) VALUES ('s1', 'c1', NOW(), NOW()) ON CONFLICT DO NOTHING",
  );
  for (const [col, v] of Object.entries(cols)) await client.query(`UPDATE realm_settings SET ${col} = $1 WHERE child_id = 'c1'`, [v]);
}

/** The opening rows written for `date`, by kind: `[minutes, …]` (more than one means written twice). */
async function opening(date: string): Promise<{ allowance: number[]; carried: number[] }> {
  const r = await client.query(
    "SELECT kind, minutes FROM realm_play_ledger WHERE child_id = 'c1' AND date = $1 AND kind IN ('allowance', 'carried') ORDER BY kind",
    [date],
  );
  const of = (k: string) => r.rows.filter((x) => x.kind === k).map((x) => Number(x.minutes));
  return { allowance: of("allowance"), carried: of("carried") };
}

async function ledgerCount(): Promise<number> {
  const r = await client.query("SELECT count(*) AS n FROM realm_play_ledger WHERE child_id = 'c1'");
  return Number(r.rows[0].n);
}

describe("opening the day — the child's own first access check", () => {
  it("writes one allowance and one carried row, and a second check writes nothing more", async () => {
    // Yesterday left 6 of its earned minutes unspent.
    await row("2026-11-08", "earned", 10);
    await row("2026-11-08", "spent", 4);
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 16, source: "earned" });
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 16, source: "earned" });
    expect(await opening(today)).toEqual({ allowance: [10], carried: [6] });
  });

  it("two first checks at once (two tabs) still write exactly one of each", async () => {
    await row("2026-11-08", "earned", 5);
    const results = await Promise.allSettled([getRealmAccess("c1"), getRealmAccess("c1")]);
    for (const r of results) expect(r.status, String((r as PromiseRejectedResult).reason)).toBe("fulfilled");
    expect(await opening(today)).toEqual({ allowance: [10], carried: [5] });
  });

  it("a child with no history starts on the allowance and writes a 0 carried row", async () => {
    await getRealmAccess("c1");
    expect(await opening(today)).toEqual({ allowance: [10], carried: [0] });
  });

  it("a day that carried nothing still writes its 0 carried row, so the next day carries 0, not the older bank", async () => {
    await row("2026-11-07", "earned", 20); // a bank of 20…
    await settings({ bank_cap_minutes: 0 }); // …that a grown-up turned carrying off for
    today = "2026-11-08";
    await getRealmAccess("c1");
    expect(await opening("2026-11-08")).toEqual({ allowance: [10], carried: [0] });

    await settings({ bank_cap_minutes: 30 });
    today = "2026-11-09";
    await getRealmAccess("c1");
    expect(await opening("2026-11-09")).toEqual({ allowance: [10], carried: [0] });
  });

  it("a bank rolls forward across a gap of days with no rows (a weekend away keeps it)", async () => {
    await row("2026-11-06", "earned", 8);
    await getRealmAccess("c1");
    expect(await opening(today)).toEqual({ allowance: [10], carried: [8] });
  });

  it("a charge before the day opens: the minute charged across midnight still comes off the opened day", async () => {
    await row("2026-11-08", "earned", 5);
    await row(today, "spent", 3); // the clock wrote today's first minute before the next access check
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 12, source: "earned" }); // 10 + 5 − 3
    expect(await opening(today)).toEqual({ allowance: [10], carried: [5] });
    // And yesterday is never carried a second time.
    await getRealmAccess("c1");
    expect(await opening(today)).toEqual({ allowance: [10], carried: [5] });
  });

  it("settings change applies next day: today's opened rows are never rewritten", async () => {
    await getRealmAccess("c1");
    await settings({ daily_allowance_minutes: 25 });
    await getRealmAccess("c1");
    expect(await opening(today)).toEqual({ allowance: [10], carried: [0] });
    today = "2026-11-10";
    await getRealmAccess("c1");
    expect((await opening("2026-11-10")).allowance).toEqual([25]);
  });

  it("writes nothing in scheduled or open mode, or with the Realm off", async () => {
    const offs: Record<string, string>[] = [{ access_mode: "scheduled" }, { access_mode: "open" }, { enabled: "false" }];
    for (const cols of offs) {
      await client.query("DELETE FROM realm_settings");
      await settings(cols);
      await getRealmAccess("c1");
      expect(await ledgerCount()).toBe(0);
    }
  });
});

describe("a grown-up's view writes nothing", () => {
  it("a grown-up's access check writes nothing, but reads the day as it will open", async () => {
    actor = PARENT;
    await row("2026-11-08", "earned", 4);
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 14, source: "earned" });
    expect(await opening(today)).toEqual({ allowance: [], carried: [] });
  });

  it("the settings panel previews today's allowance and carry before the child has opened the day", async () => {
    actor = PARENT;
    await row("2026-11-08", "earned", 4);
    expect(await getRealmPlaySummary("c1")).toEqual({ date: today, balance: 14, spent: 0, bonus: 0 });
    expect(await opening(today)).toEqual({ allowance: [], carried: [] });
  });
});

describe("every write to a day opens it first", () => {
  it("D−2's bank survives a D−1 with a finished quest but no Realm visit", async () => {
    today = "2026-11-07";
    await getRealmAccess("c1"); // D−2 opens: 10 free, nothing carried
    await row("2026-11-07", "earned", 20); // a bank of 20
    today = "2026-11-08";
    await grantEarnedMinutesForCompletion("c1", "a1"); // D−1: a quest, no visit
    expect(await opening("2026-11-08")).toEqual({ allowance: [10], carried: [20] });
    today = "2026-11-09";
    await getRealmAccess("c1");
    expect(await opening(today)).toEqual({ allowance: [10], carried: [25] }); // 20 carried + 5 earned
  });

  it("a charge, a grown-up's grant and a clear each open the day before they write", async () => {
    await row("2026-11-08", "earned", 4);
    const writers: [string, () => Promise<unknown>][] = [
      ["charge", () => recordRealmPlay("c1", 1)],
      ["grant", async () => { actor = PARENT; await grantRealmMinutes("c1", 5); }],
      ["clear", () => recordTroubleClears("c1", ["rim-0"])],
    ];
    for (const [what, write] of writers) {
      await client.query("DELETE FROM realm_play_ledger WHERE date = $1", [today]);
      actor = CHILD;
      await write();
      expect(await opening(today), what).toEqual({ allowance: [10], carried: [4] });
    }
  });
});

describe("the quiet world", () => {
  it("a child at 0 is let in quiet, and a clear sent from there earns 0 (still recorded)", async () => {
    await getRealmAccess("c1");
    await row(today, "spent", 10);
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 0, source: "quiet" });
    expect((await getTroubleBounty("c1")).remainingMinutes).toBe(0);
    const r = await recordTroubleClears("c1", ["rim-0"]);
    expect(r.awarded).toBe(0);
    expect(r.status.remainingMinutes).toBe(0);
    const clears = await client.query("SELECT minutes FROM realm_trouble_clear WHERE child_id = 'c1'");
    expect(clears.rows.map((x) => Number(x.minutes))).toEqual([0]);
    const bonus = await client.query("SELECT count(*) AS n FROM realm_play_ledger WHERE kind = 'bonus'");
    expect(Number(bonus.rows[0].n)).toBe(0);
  });

  it("a recess at a 0 balance is real play: its clears are paid", async () => {
    await settings({ access_mode: "both", daily_allowance_minutes: 0 });
    // 2026-11-09 is a Monday; the server's time is 10:00.
    await client.query("INSERT INTO recess_block VALUES ('rb1', 'c1', 'mon', '09:45', '10:30')");
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 30, source: "recess" });
    expect((await recordTroubleClears("c1", ["rim-0"])).awarded).toBe(1);
  });

  it("off hours at a 0 balance is real play: its clears are paid", async () => {
    await settings({ off_hours_enabled: "true", daily_allowance_minutes: 0 });
    // No classes today, so it is outside school hours.
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 30, source: "off_hours" });
    expect((await recordTroubleClears("c1", ["rim-0"])).awarded).toBe(1);
  });
});
