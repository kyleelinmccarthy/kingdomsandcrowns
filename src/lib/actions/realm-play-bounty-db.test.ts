// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";
import { REALM_ACCESS_DDL, REALM_LEDGER_DDL, REALM_SETTINGS_DDL, REALM_TROUBLE_CLEAR_DDL } from "@/test/realm-db-ddl";

/**
 * The bounty against a REAL libsql database, which is what production runs (Turso is libsql).
 * The other bounty test mocks the services; this one exists because the defect was between the
 * services — a read of the allowance, then an award, then the writes — and only a real database
 * shows two calls interleaving across those awaits. It is also what proves the write transaction
 * in `awardTroubleClears` serializes two concurrent calls.
 */
const client = testDatabase("bounty-db");
const testDb = client.db;

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: async () => ({ access: { userId: "child:c1" }, familyId: "f1" }),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

// The server's day (`realmNow`) is the day every clear is banked on; this schema has no family table to read it from.
const today = new Date().toISOString().slice(0, 10);
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: today, timeOfDay: "10:00" }) }));

const { recordTroubleClears } = await import("./realm-play");

async function clearsRecorded(): Promise<number> {
  const r = await client.query("SELECT count(*) AS n FROM realm_trouble_clear WHERE child_id = 'c1'");
  return Number(r.rows[0].n);
}

// The tables the bounty touches, and those the gate reads to tell quiet from play, as the
// migrations make them (`src/test/realm-db-ddl.ts`).
const DDL = [...REALM_SETTINGS_DDL, ...REALM_LEDGER_DDL, ...REALM_TROUBLE_CLEAR_DDL, ...REALM_ACCESS_DDL];

beforeAll(async () => {
  for (const sql of DDL) await client.query(sql);
});

beforeEach(async () => {
  for (const t of ["realm_settings", "realm_play_ledger", "realm_trouble_clear"]) await client.query(`DELETE FROM ${t}`);
  // Plenty of schoolwork, so the parent's cap of 5 is the only ceiling.
  await client.query(
    "INSERT INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('e1', 'c1', ?1, 'earned', 20, unixepoch())",
    [today],
  );
});

afterAll(async () => {
  client.close();
});

async function bonusBanked(): Promise<number> {
  const r = await client.query(
    "SELECT coalesce(sum(minutes), 0) AS n FROM realm_play_ledger WHERE child_id = 'c1' AND date = ?1 AND kind = 'bonus'",
    [today],
  );
  return Number(r.rows[0].n);
}

async function clearsPaid(): Promise<number> {
  const r = await client.query(
    "SELECT coalesce(sum(minutes), 0) AS n FROM realm_trouble_clear WHERE child_id = 'c1' AND date = ?1",
    [today],
  );
  return Number(r.rows[0].n);
}

describe("recordTroubleClears — two calls at once (two tabs, or a replayed request)", () => {
  it("pays the day's allowance once between them, never once each", async () => {
    const a = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-highcairn"];
    const b = ["place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-8"];
    const results = await Promise.allSettled([recordTroubleClears("c1", a), recordTroubleClears("c1", b)]);
    for (const r of results) expect(r.status, String((r as PromiseRejectedResult).reason)).toBe("fulfilled");
    const awarded = results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.awarded : 0), 0);

    expect(await bonusBanked()).toBe(5);
    expect(await clearsPaid()).toBe(5);
    expect(awarded).toBe(5);
  });
});

describe("recordTroubleClears — what a batch earns", () => {
  it("pays a minute a clear, once per home, up to the day's cap", async () => {
    const first = await recordTroubleClears("c1", ["rim-0", "rim-1", "rim-0"]);
    expect(first.awarded).toBe(2);
    expect(first.status).toMatchObject({ paidMinutes: 2, remainingMinutes: 3, clearsToday: 3 });
    const more = await recordTroubleClears("c1", ["rim-2", "place-cove-7", "place-summit-3", "place-mire-4"]);
    expect(more.awarded).toBe(3);
    expect(more.status.remainingMinutes).toBe(0);
    const capped = await recordTroubleClears("c1", ["place-ringstones"]);
    expect(capped.awarded).toBe(0);
    expect(capped.status.clearsToday).toBe(8);
    expect(await bonusBanked()).toBe(5);
  });

  it("drops clears past the per-minute limit instead of recording them", async () => {
    const homes = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-highcairn", "place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-8"];
    await recordTroubleClears("c1", homes); // 10
    await recordTroubleClears("c1", homes.slice(0, 9)); // 19
    const r = await recordTroubleClears("c1", ["rim-0", "rim-1", "rim-2"]);
    expect(r.status.clearsToday).toBe(20);
    await recordTroubleClears("c1", ["place-cove-7"]);
    expect(await clearsRecorded()).toBe(20);
  });

  it("pays nothing in open mode, where minutes are never read", async () => {
    await client.query(
      "INSERT INTO realm_settings (id, child_id, access_mode, created_at, updated_at) VALUES ('s1', 'c1', 'open', unixepoch(), unixepoch())",
    );
    const r = await recordTroubleClears("c1", ["rim-0"]);
    expect(r.awarded).toBe(0);
    expect(r.status.enabled).toBe(false);
    expect(await bonusBanked()).toBe(0);
  });
});
