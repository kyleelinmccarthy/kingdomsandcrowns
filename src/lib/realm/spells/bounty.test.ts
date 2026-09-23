import { describe, expect, it } from "vitest";
import type { LedgerRow } from "@/lib/utils/realm-access";
import { ledgerBalance } from "@/lib/utils/realm-access";
import {
  applyStatus,
  awardClears,
  bountyAllowance,
  bountyEnabled,
  bountyStatusFor,
  bountySubCap,
  isNearToday,
  isTroubleHomeId,
  startPurse,
  takeClear,
  type BountySettings,
} from "./bounty";

const base: BountySettings = { enabled: true, accessMode: "earned", earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 5 };
const earned = (n: number): LedgerRow[] => Array.from({ length: n }, () => ({ kind: "earned" as const, minutes: 5 }));

describe("the bounty's switch", () => {
  it("is on in earned and both, off in scheduled and open, off at a cap of 0 and when the Realm is off", () => {
    expect(bountyEnabled(base)).toBe(true);
    expect(bountyEnabled({ ...base, accessMode: "both" })).toBe(true);
    expect(bountyEnabled({ ...base, accessMode: "scheduled" })).toBe(false);
    expect(bountyEnabled({ ...base, accessMode: "open" })).toBe(false);
    expect(bountyEnabled({ ...base, troubleBonusCapMinutes: 0 })).toBe(false);
    expect(bountyEnabled({ ...base, enabled: false })).toBe(false);
  });
});

describe("the sub-cap: clearing can never outrun the day's schoolwork", () => {
  // The spec's table (§3.11), at caps of 0, 5, 15 and 30.
  it.each([
    [0, 0, 0],
    [5, 0, 5],
    [5, 3, 5],
    [15, 0, 5],
    [15, 1, 5],
    [15, 3, 15],
    [30, 0, 5],
    [30, 1, 5],
    [30, 3, 15],
    [30, 6, 30],
  ])("cap %i with %i quests done → sub-cap %i", (cap, quests, want) => {
    expect(bountySubCap(earned(quests), { ...base, troubleBonusCapMinutes: cap })).toBe(want);
  });

  it("never exceeds the minutes the day's quests earned by more than one grant, at any cap", () => {
    for (let cap = 0; cap <= 30; cap++) {
      for (let quests = 0; quests <= 8; quests++) {
        const sub = bountySubCap(earned(quests), { ...base, troubleBonusCapMinutes: cap });
        expect(sub).toBeLessThanOrEqual(Math.max(quests * 5, 5));
        expect(sub).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("keeps a floor of one minute when a quest earns nothing", () => {
    expect(bountySubCap([], { ...base, earnedMinutesPerQuest: 0 })).toBe(1);
  });

  it("is bound by the daily cap's headroom", () => {
    const rows: LedgerRow[] = [...earned(1), { kind: "spent", minutes: 28 }];
    expect(bountyAllowance(rows, base)).toBe(2);
    expect(bountyAllowance([...rows, { kind: "spent", minutes: 2 }], base)).toBe(0);
  });
});

describe("awarding a batch", () => {
  it("pays one minute a clear up to the allowance, then nothing, and keeps every clear", () => {
    const ids = ["rim-0", "rim-1", "rim-2", "place-ringstones", "place-summit-3", "place-appleway", "place-cove-7"];
    const { rows, awarded } = awardClears(ids, [], base, []);
    expect(awarded).toBe(5);
    expect(rows.map((r) => r.minutes)).toEqual([1, 1, 1, 1, 1, 0, 0]);
  });

  it("pays a home only once a day, so a respawning trouble cannot be farmed", () => {
    const first = awardClears(["rim-0"], [], base, []);
    expect(first.awarded).toBe(1);
    const ledger: LedgerRow[] = [{ kind: "bonus", minutes: 1 }];
    const again = awardClears(["rim-0", "rim-0", "rim-0"], ledger, base, first.rows);
    expect(again.awarded).toBe(0);
    expect(again.rows).toHaveLength(3);
    // …and inside one batch too.
    expect(awardClears(["rim-1", "rim-1"], [], base, []).awarded).toBe(1);
  });

  it("pays nothing when the bounty is off", () => {
    expect(awardClears(["rim-0"], [], { ...base, accessMode: "open" }, []).awarded).toBe(0);
    expect(awardClears(["rim-0"], [], { ...base, troubleBonusCapMinutes: 0 }, []).awarded).toBe(0);
  });

  it("bonus minutes are credit the clock can spend", () => {
    expect(ledgerBalance([{ kind: "bonus", minutes: 3 }, { kind: "spent", minutes: 1 }])).toBe(2);
  });
});

describe("the status", () => {
  it("counts clears, paid minutes and paid homes", () => {
    const s = bountyStatusFor([{ kind: "bonus", minutes: 2 }], base, [
      { homeId: "rim-0", minutes: 1 },
      { homeId: "rim-0", minutes: 0 },
      { homeId: "place-cove", minutes: 1 },
    ]);
    expect(s).toMatchObject({ enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 2, remainingMinutes: 3, clearsToday: 3 });
    expect(s.paidHomes).toEqual(["rim-0", "place-cove"]);
  });
});

describe("home ids", () => {
  it("accepts what planHomes writes and nothing else", () => {
    for (const ok of ["rim-0", "rim-2", "place-ringstones", "place-summit-3", "place-deepwood-12"]) expect(isTroubleHomeId(ok)).toBe(true);
    for (const bad of ["rim-3", "rim-", "place-", "place-Ring", "place-a b", "x", "", 7, null, "place-" + "a".repeat(41)]) expect(isTroubleHomeId(bad)).toBe(false);
  });
});

describe("the day a clear is banked on", () => {
  it("must be within a day of the server's own", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    expect(isNearToday("2026-09-23", now)).toBe(true);
    expect(isNearToday("2026-09-22", now)).toBe(true);
    expect(isNearToday("2026-09-24", now)).toBe(true);
    expect(isNearToday("2026-09-25", now)).toBe(false);
    expect(isNearToday("2026-09-21", now)).toBe(false);
    expect(isNearToday("2026-13-45", now)).toBe(false);
  });
});

describe("the client's purse", () => {
  it("promises nothing until the server has answered", () => {
    const p = startPurse();
    expect(takeClear(p, "rim-0")).toMatchObject({ paid: false, capped: false, clearsToday: 1 });
  });

  it("predicts a paid clear, an already-paid home, and the cap", () => {
    const p = startPurse();
    applyStatus(p, bountyStatusFor([{ kind: "bonus", minutes: 4 }], base, [{ homeId: "rim-0", minutes: 1 }]), []);
    expect(takeClear(p, "rim-0")).toMatchObject({ paid: false, already: true, clearsToday: 2 });
    expect(takeClear(p, "rim-1")).toMatchObject({ paid: true, clearsToday: 3 });
    expect(takeClear(p, "rim-2")).toMatchObject({ paid: false, capped: true, clearsToday: 4 });
  });

  it("lays unsent clears back on top of the server's answer", () => {
    const p = startPurse();
    applyStatus(p, bountyStatusFor([], base, []), ["rim-0", "rim-0", "rim-1"]);
    expect(p.clearsToday).toBe(3);
    expect(p.remaining).toBe(3);
    expect([...p.paidHomes]).toEqual(["rim-0", "rim-1"]);
  });
});
