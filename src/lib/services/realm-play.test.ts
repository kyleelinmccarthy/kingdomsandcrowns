import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as schema from "@/lib/db/schema";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";

/**
 * A finished quest's Realm minutes land on the server's today (`realmNow`), never on the
 * assignment's own date: a quest assigned for yesterday but finished today earns into today,
 * because nothing writes to a day once the server's day has moved on (spec 2026-11-09 §2a).
 * The database records inserts, conflict rules, locks and transactions; selects answer from
 * `h.rowsFor(table)` (nothing by default: default settings, no grant yet, an unopened day).
 */
const realmNow = vi.fn();
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: (...a: unknown[]) => realmNow(...a) }));

const h = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertTables: [] as unknown[],
  conflicts: [] as { kind: unknown; config: unknown }[],
  rowsFor: (() => []) as (table: unknown) => unknown[],
  locks: 0,
  transactions: 0,
  /** When set, the first transaction waits on it (a write stuck in flight). */
  stall: null as Promise<void> | null,
}));

vi.mock("@/lib/db", () => {
  const rows = (table: unknown) => {
    const q: Promise<unknown[]> & { where?: unknown; limit?: unknown; orderBy?: unknown } = Promise.resolve(h.rowsFor(table));
    q.where = () => q;
    q.limit = () => q;
    q.orderBy = () => q;
    return q;
  };
  const db = {
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        h.insertTables.push(table);
        const batch = Array.isArray(v) ? v : [v];
        for (const r of batch) if ("kind" in r) h.inserted.push(r);
        // Every insert lands: `.returning()` hands back one row.
        const landed = () => Object.assign(Promise.resolve(), { returning: async () => [{}] });
        return Object.assign(landed(), {
          onConflictDoNothing: (config?: unknown) => {
            for (const r of batch) if ("kind" in r) h.conflicts.push({ kind: r.kind, config });
            return landed();
          },
        });
      },
    }),
    select: () => ({ from: rows }),
    execute: async () => {
      h.locks++;
    },
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      h.transactions++;
      if (h.transactions === 1 && h.stall) await h.stall;
      return run(db);
    },
  };
  return { db };
});

const { appendToOpenedDay, grantEarnedMinutesForCompletion, loadRealmSettings, openDay, paySideQuest, QUEUE_WAIT_MS } = await import("./realm-play");

beforeEach(() => {
  h.inserted.length = 0;
  h.insertTables.length = 0;
  h.conflicts.length = 0;
  h.rowsFor = () => [];
  h.locks = 0;
  h.transactions = 0;
  h.stall = null;
  realmNow.mockReset().mockResolvedValue({ date: "2026-11-09", timeOfDay: "09:00" });
});

afterEach(() => {
  vi.useRealTimers();
});

const OPEN_DAY = [
  { kind: "allowance", minutes: 10 },
  { kind: "carried", minutes: 0 },
];

describe("grantEarnedMinutesForCompletion", () => {
  it("writes `earned` on the server's today, for yesterday's assignment finished today", async () => {
    await grantEarnedMinutesForCompletion("c1", "a-yesterday");
    expect(realmNow).toHaveBeenCalledWith("c1");
    // The day opens first (any write to a day does), then the quest's minutes land on it.
    expect(h.inserted).toEqual([
      expect.objectContaining({ childId: "c1", date: "2026-11-09", kind: "allowance" }),
      expect.objectContaining({ childId: "c1", date: "2026-11-09", kind: "carried" }),
      expect.objectContaining({ childId: "c1", date: "2026-11-09", kind: "earned", minutes: 5, sourceAssignmentId: "a-yesterday" }),
    ]);
  });
});

describe("round trips to a remote database", () => {
  it("an already-open day is read once, with no transaction and no lock", async () => {
    h.rowsFor = (t) => (t === schema.realmPlayLedger ? OPEN_DAY : []);
    expect(await openDay("c1", "2026-11-09", { ...DEFAULT_REALM_SETTINGS })).toEqual(OPEN_DAY);
    expect(h.transactions).toBe(0);
    expect(h.locks).toBe(0);
    expect(h.inserted).toEqual([]);
  });

  it("opening the day inside a caller's lock does not take the lock a second time", async () => {
    await appendToOpenedDay("c1", "2026-11-09", "spent", 1, { settings: { ...DEFAULT_REALM_SETTINGS } });
    expect(h.transactions).toBe(1);
    expect(h.locks).toBe(1);
  });

  it("settings that exist are one read, with no insert", async () => {
    h.rowsFor = (t) => (t === schema.realmSettings ? [{ ...DEFAULT_REALM_SETTINGS, dailyAllowanceMinutes: 20 }] : []);
    expect((await loadRealmSettings("c1")).dailyAllowanceMinutes).toBe(20);
    expect(h.insertTables).not.toContain(schema.realmSettings);
  });

  it("missing settings are made, then read back", async () => {
    expect(await loadRealmSettings("c1")).toEqual(DEFAULT_REALM_SETTINGS);
    expect(h.insertTables).toContain(schema.realmSettings);
  });
});

describe("the in-process queue", () => {
  it("a write stuck ahead of it holds the next one for at most QUEUE_WAIT_MS, then the next goes on", async () => {
    vi.useFakeTimers();
    h.stall = new Promise<void>(() => {}); // never settles
    void grantEarnedMinutesForCompletion("c-stuck", "a-stuck");
    let second = false;
    void grantEarnedMinutesForCompletion("c-stuck", "a-next").then(() => (second = true));
    await vi.advanceTimersByTimeAsync(QUEUE_WAIT_MS - 1);
    expect(second).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(second).toBe(true);
    expect(h.inserted).toContainEqual(expect.objectContaining({ kind: "earned", sourceAssignmentId: "a-next" }));
  });
});

describe("conflict rules on a ledger row", () => {
  it("only a run's `practice` row skips a conflict, and only on the practice index", async () => {
    h.rowsFor = (t) => (t === schema.realmPlayLedger ? OPEN_DAY : []);
    await appendToOpenedDay("c1", "2026-11-09", "spent", 1, { settings: { ...DEFAULT_REALM_SETTINGS } });
    expect(h.conflicts.filter((c) => c.kind === "spent")).toEqual([]);
    await paySideQuest("c1", "run-1", 3);
    const practice = h.conflicts.filter((c) => c.kind === "practice");
    expect(practice).toEqual([{ kind: "practice", config: expect.objectContaining({ target: schema.realmPlayLedger.sourceRunId, where: expect.anything() }) }]);
  });
});
