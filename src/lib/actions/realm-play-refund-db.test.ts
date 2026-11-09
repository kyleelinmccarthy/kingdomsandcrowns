// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL, REALM_TROUBLE_CLEAR_DDL } from "@/test/realm-db-ddl";
import { IDLE_MS, IDLE_REFUND_MAX_MINUTES } from "@/lib/realm3d/pause";

/**
 * Idle time given back (spec §4.6) against a REAL Postgres database: the refund is bounded on the
 * server — by what was spent today, by the per-call maximum, and to one per `IDLE_MS` of wall
 * time — and only a real database shows the child's advisory lock holding two refunds at once to
 * one row. Runs in its own schema so it can share a Postgres server with the other real-database tests.
 */
const SCHEMA = "test_realm_refund_db";
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

const today = "2026-11-09";
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: today, timeOfDay: "10:00" }) }));

const { getRealmAccess, recordRealmPlay, refundIdleMinutes } = await import("@/lib/actions/realm-play");
const { REFUND_SLACK_MS } = await import("@/lib/services/realm-play");

const DDL = [...REALM_SETTINGS_DDL, ...REALM_LEDGER_DDL, ...REALM_TROUBLE_CLEAR_DDL, ...REALM_ACCESS_DDL];

beforeAll(async () => {
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear"]) await client.query(`DELETE FROM ${t}`);
  actor = CHILD;
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
});

async function refundRows(): Promise<number[]> {
  const r = await client.query("SELECT minutes FROM realm_play_ledger WHERE child_id = 'c1' AND kind = 'refund' ORDER BY created_at");
  return r.rows.map((row) => Number(row.minutes));
}

/** Writes a ledger row stamped `agoMs` before now, as a write that long ago would have. */
async function rowAgo(kind: "spent" | "refund", minutes: number, agoMs: number) {
  await client.query("INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ($1, 'c1', $2, $3, $4, $5)", [
    `${kind}-${agoMs}`,
    today,
    kind,
    minutes,
    new Date(Date.now() - agoMs),
  ]);
}

async function minutesLeft(): Promise<number> {
  const access = await getRealmAccess("c1");
  return access.allowed ? access.minutesRemaining : 0;
}

describe("refundIdleMinutes — what an idle pause may give back", () => {
  it("gives back written minutes, and access reflects it (spent drops)", async () => {
    await recordRealmPlay("c1", 3);
    expect(await minutesLeft()).toBe(7);
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 2 });
    expect(await refundRows()).toEqual([2]);
    expect(await minutesLeft()).toBe(9);
  });

  it("never gives back more than was spent today, so it cannot mint credit", async () => {
    await recordRealmPlay("c1", 1);
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 1 });
    expect(await refundRows()).toEqual([1]);
  });

  it("writes nothing when nothing was spent, and still opens the day like every write", async () => {
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 0 });
    expect(await refundRows()).toEqual([]);
    const opened = await client.query("SELECT count(*) AS n FROM realm_play_ledger WHERE child_id = 'c1' AND kind = 'allowance'");
    expect(Number(opened.rows[0].n)).toBe(1);
  });

  it("refuses more than one idle pause can owe, or a part or no minute", async () => {
    await recordRealmPlay("c1", 5);
    await expect(refundIdleMinutes("c1", IDLE_REFUND_MAX_MINUTES + 1)).rejects.toThrow();
    await expect(refundIdleMinutes("c1", 0)).rejects.toThrow();
    await expect(refundIdleMinutes("c1", 1.5)).rejects.toThrow();
    expect(await refundRows()).toEqual([]);
  });

  it("gives back once per idle wait: a second refund inside IDLE_MS of the last is refused", async () => {
    await recordRealmPlay("c1", 5);
    expect(await refundIdleMinutes("c1", 1)).toEqual({ refunded: 1 });
    expect(await refundIdleMinutes("c1", 1)).toEqual({ refunded: 0 });
    expect(await refundRows()).toEqual([1]);
  });

  it("allows the next refund once IDLE_MS has passed since the last", async () => {
    await recordRealmPlay("c1", 5);
    await client.query("INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('r0', 'c1', $1, 'refund', 1, $2)", [
      today,
      new Date(Date.now() - IDLE_MS - 1000),
    ]);
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 2 });
    expect(await refundRows()).toEqual([1, 2]);
  });

  it("gives a slow round trip slack: the next refund is allowed IDLE_MS − REFUND_SLACK_MS after the last", async () => {
    expect(REFUND_SLACK_MS).toBe(15_000);
    await recordRealmPlay("c1", 5);
    await rowAgo("refund", 1, IDLE_MS - REFUND_SLACK_MS + 1000);
    expect(await refundIdleMinutes("c1", 1)).toEqual({ refunded: 1 });
  });

  it("still refuses a refund just inside that slackened window", async () => {
    await recordRealmPlay("c1", 5);
    await rowAgo("refund", 1, IDLE_MS - REFUND_SLACK_MS - 2000);
    expect(await refundIdleMinutes("c1", 1)).toEqual({ refunded: 0 });
    expect(await refundRows()).toEqual([1]);
  });

  it("only reverses minutes spent within the last IDLE_MS + REFUND_SLACK_MS: older play is not refundable", async () => {
    await rowAgo("spent", 5, IDLE_MS + REFUND_SLACK_MS + 1000);
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 0 });
    await recordRealmPlay("c1", 1);
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 1 });
  });

  it("counts refunds already written in that window against it, so one spend is never reversed twice", async () => {
    await recordRealmPlay("c1", 3);
    await rowAgo("refund", 2, IDLE_MS - REFUND_SLACK_MS + 1000);
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 1 });
  });

  it("refuses a grown-up, who has no clock to give back", async () => {
    await recordRealmPlay("c1", 3);
    actor = PARENT;
    await expect(refundIdleMinutes("c1", 1)).rejects.toThrow();
    expect(await refundRows()).toEqual([]);
  });

  it("gives nothing back while the Realm is off for this hero", async () => {
    await recordRealmPlay("c1", 3);
    await client.query("UPDATE realm_settings SET enabled = false WHERE child_id = 'c1'");
    expect(await refundIdleMinutes("c1", 2)).toEqual({ refunded: 0 });
    expect(await refundRows()).toEqual([]);
  });

  it("two refunds at once (two tabs) write one row between them", async () => {
    await recordRealmPlay("c1", 5);
    const [a, b] = await Promise.all([refundIdleMinutes("c1", 2), refundIdleMinutes("c1", 2)]);
    expect(a.refunded + b.refunded).toBe(2);
    expect(await refundRows()).toEqual([2]);
  });
});
