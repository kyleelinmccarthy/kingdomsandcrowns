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
};
// What a batch earns is `awardTroubleClears`'s, tested against a real database in
// `realm-play-bounty-db.test.ts`; here it only has to be reached, or not.
const awardTroubleClears = vi.fn(async () => ({ awarded: 0, status: {} }));
vi.mock("@/lib/services/realm-play", () => ({
  appendLedger: vi.fn(),
  loadRealmSettings: async () => store.settings,
  loadLedger: async () => store.ledger,
  loadTroubleClears: async () => store.clears,
  awardTroubleClears: (...a: unknown[]) => (awardTroubleClears as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getTroubleBounty, recordTroubleClears } from "./realm-play";

const child = { access: { userId: "child:c1" }, familyId: "f1" };
const parent = { access: { userId: "u-parent" }, familyId: "f1" };
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  requireChildAccess.mockReset();
  awardTroubleClears.mockClear();
  store.settings = { ...DEFAULT_REALM_SETTINGS, accessMode: "earned" };
  store.ledger = [];
  store.clears = [];
});

describe("recordTroubleClears — who may bank", () => {
  it("refuses a visiting grown-up and writes nothing", async () => {
    requireChildAccess.mockResolvedValue(parent);
    await expect(recordTroubleClears("c1", today(), ["rim-0"])).rejects.toThrow(/only the hero/i);
    expect(awardTroubleClears).not.toHaveBeenCalled();
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
    expect(awardTroubleClears).not.toHaveBeenCalled();
  });

  it("refuses ids the game never writes, empty batches and oversized ones", async () => {
    await expect(recordTroubleClears("c1", today(), ["boss-1"])).rejects.toThrow(/trouble/i);
    await expect(recordTroubleClears("c1", today(), [])).rejects.toThrow(/between/i);
    await expect(recordTroubleClears("c1", today(), Array(13).fill("rim-0"))).rejects.toThrow(/between/i);
    expect(awardTroubleClears).not.toHaveBeenCalled();
  });

  it("hands a well-formed batch to the award, which decides what it is worth", async () => {
    await recordTroubleClears("c1", today(), ["rim-0", "place-cove-7"]);
    expect(awardTroubleClears).toHaveBeenCalledWith("c1", today(), ["rim-0", "place-cove-7"]);
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
