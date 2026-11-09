import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A finished quest's Realm minutes land on the server's today (`realmNow`), never on the
 * assignment's own date: a quest assigned for yesterday but finished today earns into today,
 * because nothing writes to a day once the server's day has moved on (spec 2026-11-09 §2a).
 * The database only records inserts; every select finds nothing (default settings, no grant yet).
 */
const realmNow = vi.fn();
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: (...a: unknown[]) => realmNow(...a) }));

const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => {
  const none = () => {
    const q: Promise<unknown[]> & { where?: unknown; limit?: unknown } = Promise.resolve([]);
    q.where = () => q;
    q.limit = () => q;
    return q;
  };
  // Ledger rows land on `inserted` one by one; the day's opening rows arrive as one batch.
  const db = {
    insert: () => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        for (const r of Array.isArray(v) ? v : [v]) if ("kind" in r) inserted.push(r);
        return Object.assign(Promise.resolve(), { onConflictDoNothing: async () => {} });
      },
    }),
    select: () => ({ from: none }),
    execute: async () => {},
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { db };
});

import { grantEarnedMinutesForCompletion } from "./realm-play";

beforeEach(() => {
  inserted.length = 0;
  realmNow.mockReset().mockResolvedValue({ date: "2026-11-09", timeOfDay: "09:00" });
});

describe("grantEarnedMinutesForCompletion", () => {
  it("writes `earned` on the server's today, for yesterday's assignment finished today", async () => {
    await grantEarnedMinutesForCompletion("c1", "a-yesterday");
    expect(realmNow).toHaveBeenCalledWith("c1");
    // The day opens first (any write to a day does), then the quest's minutes land on it.
    expect(inserted).toEqual([
      expect.objectContaining({ childId: "c1", date: "2026-11-09", kind: "allowance" }),
      expect.objectContaining({ childId: "c1", date: "2026-11-09", kind: "carried" }),
      expect.objectContaining({ childId: "c1", date: "2026-11-09", kind: "earned", minutes: 5, sourceAssignmentId: "a-yesterday" }),
    ]);
  });
});
