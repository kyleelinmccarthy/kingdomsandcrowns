import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LedgerRow } from "@/lib/utils/realm-access";
import type { ClearRow } from "@/lib/realm/spells/bounty";
import { DEFAULT_REALM_SETTINGS, type RealmSettings } from "@/lib/utils/realm-settings";

/**
 * The bounty's server half. The access gate and the database are the seams: the actor is
 * mocked as a child or a grown-up, and the service writes are captured so a refusal can be
 * shown to have written NOTHING.
 */
const requireChildAccess = vi.fn();
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (...a: unknown[]) => requireChildAccess(...a),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const store = {
  settings: { ...DEFAULT_REALM_SETTINGS } as RealmSettings,
  ledger: [] as LedgerRow[],
  clears: [] as ClearRow[],
  recent: 0,
};
const recordTroubleClearRows = vi.fn(async (_c: string, _d: string, rows: ClearRow[]) => {
  let banked = 0;
  for (const r of rows) {
    store.clears.push(r);
    banked += r.minutes;
  }
  if (banked > 0) store.ledger.push({ kind: "bonus", minutes: banked });
  return banked;
});
vi.mock("@/lib/services/realm-play", () => ({
  appendLedger: vi.fn(),
  loadRealmSettings: async () => store.settings,
  loadLedger: async () => store.ledger,
  loadTroubleClears: async () => store.clears,
  countTroubleClearsSince: async () => store.recent,
  recordTroubleClearRows: (...a: [string, string, ClearRow[]]) => recordTroubleClearRows(...a),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getTroubleBounty, recordTroubleClears } from "./realm-play";

const child = { access: { userId: "child:c1" }, familyId: "f1" };
const parent = { access: { userId: "u-parent" }, familyId: "f1" };
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  requireChildAccess.mockReset();
  recordTroubleClearRows.mockClear();
  store.settings = { ...DEFAULT_REALM_SETTINGS, accessMode: "earned" };
  store.ledger = [];
  store.clears = [];
  store.recent = 0;
});

describe("recordTroubleClears — who may bank", () => {
  it("refuses a visiting grown-up and writes nothing", async () => {
    requireChildAccess.mockResolvedValue(parent);
    await expect(recordTroubleClears("c1", today(), ["rim-0"])).rejects.toThrow(/only the hero/i);
    expect(recordTroubleClearRows).not.toHaveBeenCalled();
  });

  it("asks the gate for write access to the hero", async () => {
    requireChildAccess.mockResolvedValue(child);
    await recordTroubleClears("c1", today(), ["rim-0"]);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
  });
});

describe("recordTroubleClears — what the client may claim", () => {
  beforeEach(() => requireChildAccess.mockResolvedValue(child));

  it("refuses a day that is not today", async () => {
    await expect(recordTroubleClears("c1", "2020-01-01", ["rim-0"])).rejects.toThrow(/date/i);
    await expect(recordTroubleClears("c1", "tomorrow", ["rim-0"])).rejects.toThrow(/date/i);
    expect(recordTroubleClearRows).not.toHaveBeenCalled();
  });

  it("refuses ids the game never writes, empty batches and oversized ones", async () => {
    await expect(recordTroubleClears("c1", today(), ["boss-1"])).rejects.toThrow(/trouble/i);
    await expect(recordTroubleClears("c1", today(), [])).rejects.toThrow(/between/i);
    await expect(recordTroubleClears("c1", today(), Array(13).fill("rim-0"))).rejects.toThrow(/between/i);
    expect(recordTroubleClearRows).not.toHaveBeenCalled();
  });

  it("pays a minute a clear, once per home, up to the day's cap", async () => {
    const first = await recordTroubleClears("c1", today(), ["rim-0", "rim-1", "rim-0"]);
    expect(first.awarded).toBe(2);
    expect(first.status).toMatchObject({ paidMinutes: 2, remainingMinutes: 3, clearsToday: 3 });
    const more = await recordTroubleClears("c1", today(), ["rim-2", "place-cove", "place-summit-3", "place-mire-4"]);
    expect(more.awarded).toBe(3);
    expect(more.status.remainingMinutes).toBe(0);
    const capped = await recordTroubleClears("c1", today(), ["place-ringstones"]);
    expect(capped.awarded).toBe(0);
    expect(capped.status.clearsToday).toBe(8);
  });

  it("drops clears past the per-minute limit instead of recording them", async () => {
    store.recent = 19;
    const r = await recordTroubleClears("c1", today(), ["rim-0", "rim-1", "rim-2"]);
    expect(recordTroubleClearRows.mock.calls[0][2]).toHaveLength(1);
    expect(r.awarded).toBe(1);
    store.recent = 20;
    await recordTroubleClears("c1", today(), ["place-cove"]);
    expect(recordTroubleClearRows).toHaveBeenCalledTimes(1);
  });

  it("pays nothing in open mode, where minutes are never read", async () => {
    store.settings = { ...store.settings, accessMode: "open" };
    const r = await recordTroubleClears("c1", today(), ["rim-0"]);
    expect(r.awarded).toBe(0);
    expect(r.status.enabled).toBe(false);
  });
});

describe("getTroubleBounty", () => {
  it("reads today's status, for the hero or a grown-up", async () => {
    requireChildAccess.mockResolvedValue(parent);
    store.clears = [{ homeId: "rim-0", minutes: 1 }];
    store.ledger = [{ kind: "bonus", minutes: 1 }];
    const s = await getTroubleBounty("c1", today());
    expect(s).toMatchObject({ enabled: true, paidMinutes: 1, remainingMinutes: 4, clearsToday: 1, paidHomes: ["rim-0"] });
  });
});
