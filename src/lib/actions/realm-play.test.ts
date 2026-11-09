import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as schema from "@/lib/db/schema";
import type { LedgerRow } from "@/lib/utils/realm-access";
import { DEFAULT_REALM_SETTINGS, type RealmSettings } from "@/lib/utils/realm-settings";

/**
 * The server owns the Realm's day: access, the play clock's charge and a grown-up's grant all
 * read and write on `realmNow` (the family's timezone), never on a date the device sends. The
 * clock, the gate and the ledger are the seams.
 */
const realmNow = vi.fn();
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: (...a: unknown[]) => realmNow(...a) }));

const requireChildAccess = vi.fn();
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (...a: unknown[]) => requireChildAccess(...a),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));

const store = {
  settings: { ...DEFAULT_REALM_SETTINGS } as RealmSettings,
  ledger: {} as Record<string, LedgerRow[]>,
};
const loadLedger = vi.fn(async (_childId: string, date: string) => store.ledger[date] ?? []);
const chargeRealmPlay = vi.fn(async () => {});
const appendLedger = vi.fn(async () => {});
// Opening the day and previewing it are tested against a real database (`realm-day-db.test.ts`);
// here only who reaches which, and on what day.
const openDay = vi.fn(async () => {});
const loadLedgerAsOpened = vi.fn(async (_childId: string, date: string) => store.ledger[date] ?? []);
vi.mock("@/lib/services/realm-play", () => ({
  loadRealmSettings: async () => store.settings,
  loadLedger: (...a: [string, string]) => loadLedger(...a),
  loadLedgerAsOpened: (...a: [string, string]) => loadLedgerAsOpened(...a),
  openDay: (...a: unknown[]) => (openDay as (...x: unknown[]) => unknown)(...a),
  chargeRealmPlay: (...a: unknown[]) => (chargeRealmPlay as (...x: unknown[]) => unknown)(...a),
  appendLedger: (...a: unknown[]) => (appendLedger as (...x: unknown[]) => unknown)(...a),
}));

// The schedule reads: rows by table, whatever the filter (the weekday is checked through `weekdayOfDate`).
const tableRows = new Map<unknown, unknown[]>();
function rowsOf(table: unknown) {
  const rows = tableRows.get(table) ?? [];
  const q: Promise<unknown[]> & { where?: unknown; limit?: unknown } = Promise.resolve(rows);
  q.where = () => q;
  q.limit = () => q;
  return q;
}
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: (t: unknown) => rowsOf(t) }) } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { weekdayOfDate } = vi.hoisted(() => ({ weekdayOfDate: vi.fn() }));
vi.mock("@/lib/utils/schedule-days", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/utils/schedule-days")>();
  weekdayOfDate.mockImplementation(real.weekdayOfDate);
  return { ...real, weekdayOfDate: (d: string) => weekdayOfDate(d) };
});

import { getRealmAccess, grantRealmMinutes, recordRealmPlay } from "./realm-play";

const child = { access: { userId: "child:c1" }, familyId: "f1" };
const parent = { access: { userId: "u-parent" }, familyId: "f1" };
// The family's Monday morning; the device below insists it is New Year's Day 2099.
const SERVER = { date: "2026-11-09", timeOfDay: "10:15" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-01-01T20:00:00Z"));
  realmNow.mockReset().mockResolvedValue(SERVER);
  requireChildAccess.mockReset();
  loadLedger.mockClear();
  chargeRealmPlay.mockClear();
  appendLedger.mockClear();
  openDay.mockClear();
  loadLedgerAsOpened.mockClear();
  weekdayOfDate.mockClear();
  store.settings = { ...DEFAULT_REALM_SETTINGS, accessMode: "both" };
  store.ledger = {};
  tableRows.clear();
});

afterEach(() => vi.useRealTimers());

describe("getRealmAccess — on the server's day", () => {
  it("reads the ledger, the weekday and the time on the family's clock, not the device's", async () => {
    requireChildAccess.mockResolvedValue(child);
    store.ledger = { "2026-11-09": [{ kind: "earned", minutes: 7 }], "2099-01-01": [{ kind: "earned", minutes: 40 }] };
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 7, source: "earned" });
    expect(realmNow).toHaveBeenCalledWith("c1");
    expect(loadLedger).toHaveBeenCalledWith("c1", "2026-11-09");
    expect(loadLedger).not.toHaveBeenCalledWith("c1", "2099-01-01");
    expect(weekdayOfDate.mock.calls.every(([d]) => d === "2026-11-09")).toBe(true);
    expect(weekdayOfDate).toHaveBeenCalled();
  });

  it("the child's own check opens the server's day before reading it", async () => {
    requireChildAccess.mockResolvedValue(child);
    await getRealmAccess("c1");
    expect(openDay).toHaveBeenCalledWith("c1", "2026-11-09", store.settings);
    expect(openDay.mock.invocationCallOrder[0]).toBeLessThan(loadLedger.mock.invocationCallOrder[0]);
    expect(loadLedgerAsOpened).not.toHaveBeenCalled();
  });

  it("a grown-up's check never opens the day: it reads the day as it will open", async () => {
    requireChildAccess.mockResolvedValue(parent);
    store.ledger = { "2026-11-09": [{ kind: "allowance", minutes: 10 }] };
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 10, source: "earned" });
    expect(openDay).not.toHaveBeenCalled();
    expect(loadLedgerAsOpened).toHaveBeenCalledWith("c1", "2026-11-09", store.settings);
  });

  it("opens a recess by the server's time of day", async () => {
    requireChildAccess.mockResolvedValue(child);
    tableRows.set(schema.recessBlock, [{ startTime: "10:00", endTime: "10:30" }]);
    expect(await getRealmAccess("c1")).toEqual({ allowed: true, minutesRemaining: 15, source: "recess" });
  });
});

describe("recordRealmPlay — charges today", () => {
  it("charges the server's day", async () => {
    requireChildAccess.mockResolvedValue(child);
    await recordRealmPlay("c1", 3);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(chargeRealmPlay).toHaveBeenCalledWith("c1", "2026-11-09", 3);
  });
});

describe("grantRealmMinutes — a grown-up's grant lands on today", () => {
  it("writes the grant on the server's day", async () => {
    requireChildAccess.mockResolvedValue(parent);
    await grantRealmMinutes("c1", 15);
    expect(appendLedger).toHaveBeenCalledWith("c1", "2026-11-09", "granted", 15);
  });

  it("refuses the hero and writes nothing", async () => {
    requireChildAccess.mockResolvedValue(child);
    await expect(grantRealmMinutes("c1", 15)).rejects.toThrow(/grown-up/i);
    expect(appendLedger).not.toHaveBeenCalled();
  });
});
