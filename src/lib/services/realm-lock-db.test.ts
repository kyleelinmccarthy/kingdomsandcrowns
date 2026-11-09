// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL, REALM_TROUBLE_CLEAR_DDL } from "@/test/realm-db-ddl";

/**
 * The child's advisory lock against a REAL Postgres database, as production sees it: a pool of
 * connections (Hyperdrive), and two isolates that do not share the in-process queue. Each
 * "isolate" here is its own fresh import of the services (`vi.resetModules`), so its queue is
 * its own and only the database lock stands between two calls.
 *
 * Runs in its own schema so it can share a Postgres server with the other real-database tests.
 */
const SCHEMA = "test_realm_lock_db";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
  max: 4,
  options: `-c search_path=${SCHEMA}`,
});
const testDb = drizzle(pool, { schema });

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: async () => ({ access: { userId: "child:c1" }, familyId: "f1" }),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: "2026-11-09", timeOfDay: "10:00" }) }));

type Actions = typeof import("@/lib/actions/realm-play");
type Services = typeof import("@/lib/services/realm-play");

/** One isolate: its own copy of the services, and so its own in-process queue. */
async function isolate(): Promise<{ actions: Actions; services: Services }> {
  vi.resetModules();
  return { actions: await import("@/lib/actions/realm-play"), services: await import("@/lib/services/realm-play") };
}

const DDL = [...REALM_SETTINGS_DDL, ...REALM_LEDGER_DDL, ...REALM_TROUBLE_CLEAR_DDL, ...REALM_ACCESS_DDL];

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await pool.query(`CREATE SCHEMA "${SCHEMA}"`);
  for (const sql of DDL) await pool.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear"]) await pool.query(`DELETE FROM ${t}`);
  // Settings exist already, so the two calls race on the ledger, not on making the settings row.
  await pool.query("INSERT INTO realm_settings (id, child_id, created_at, updated_at) VALUES ('s1', 'c1', NOW(), NOW())");
  await pool.query(
    "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('y1', 'c1', '2026-11-08', 'earned', 7, NOW())",
  );
});

afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await pool.end();
});

async function kinds(kind: string): Promise<number[]> {
  const r = await pool.query("SELECT minutes FROM realm_play_ledger WHERE child_id = 'c1' AND date = '2026-11-09' AND kind = $1", [kind]);
  return r.rows.map((x) => Number(x.minutes));
}

describe("two isolates at once, held apart only by the child's advisory lock", () => {
  it("two first access checks open the day once: one allowance, one carried row", async () => {
    const [a, b] = [await isolate(), await isolate()];
    const results = await Promise.allSettled([a.actions.getRealmAccess("c1"), b.actions.getRealmAccess("c1")]);
    for (const r of results) expect(r.status, String((r as PromiseRejectedResult).reason)).toBe("fulfilled");
    expect(await kinds("allowance")).toEqual([10]);
    expect(await kinds("carried")).toEqual([7]);
    for (const r of results) expect((r as PromiseFulfilledResult<{ minutesRemaining: number }>).value.minutesRemaining).toBe(17);
  });

  it("two completions of one quest at once grant its minutes once", async () => {
    const [a, b] = [await isolate(), await isolate()];
    await Promise.all([
      a.services.grantEarnedMinutesForCompletion("c1", "quest-1"),
      b.services.grantEarnedMinutesForCompletion("c1", "quest-1"),
    ]);
    expect(await kinds("earned")).toEqual([5]);
  });
});
