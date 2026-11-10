// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL, REALM_TROUBLE_CLEAR_DDL } from "@/test/realm-db-ddl";

/**
 * The child's write transaction against a REAL libsql database, as production sees it: two
 * server instances that do not share the in-process queue. Each "instance" here is its own fresh
 * import of the services (`vi.resetModules`), so its queue is its own and only the database's
 * write lock stands between two calls.
 */
const pool = testDatabase("realm-lock-db");
const testDb = pool.db;

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
  for (const sql of DDL) await pool.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear"]) await pool.query(`DELETE FROM ${t}`);
  // Settings exist already, so the two calls race on the ledger, not on making the settings row.
  await pool.query("INSERT INTO realm_settings (id, child_id, created_at, updated_at) VALUES ('s1', 'c1', unixepoch(), unixepoch())");
  await pool.query(
    "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('y1', 'c1', '2026-11-08', 'earned', 7, unixepoch())",
  );
});

afterAll(async () => {
  pool.close();
});

async function kinds(kind: string): Promise<number[]> {
  const r = await pool.query("SELECT minutes FROM realm_play_ledger WHERE child_id = 'c1' AND date = '2026-11-09' AND kind = ?1", [kind]);
  return r.rows.map((x) => Number(x.minutes));
}

describe("two server instances at once, held apart only by the database's write lock", () => {
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
