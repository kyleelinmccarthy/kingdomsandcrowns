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
  earningLines,
  isNearToday,
  isTroubleHomeId,
  startPurse,
  takeClear,
  type BountySettings,
  type BountyStatus,
} from "./bounty";
import { realmWorld } from "@/lib/realm3d/worldgen";

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
    for (const ok of ["place-highcairn", "place-longwater", "place-farfurrow", "place-appleway", "place-cove-7", "place-tarn-10", "place-mire-4", "place-outcrop-21"]) expect(isTroubleHomeId(ok)).toBe(true);
    for (const bad of ["rim-3", "rim-", "place-", "place-Ring", "place-a b", "x", "", 7, null, "place-" + "a".repeat(41)]) expect(isTroubleHomeId(bad)).toBe(false);
  });

  it("accepts every home the real world can hold", () => {
    // Every landmark of the generated world is a place a trouble may call home (`planHomes`).
    const ids = realmWorld().landmarks.map((l) => `place-${l.id}`);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) expect(isTroubleHomeId(id), id).toBe(true);
  });

  it("refuses a made-up place: only the authored five and the generator's own kinds are homes", () => {
    // Any `place-*` string used to pass, so a hand-made request had unlimited homes to be paid for.
    for (const bad of ["place-a", "place-b", "place-zzz", "place-cove", "place-summit", "place-summit-", "place-summit-1234", "place-castle", "place-ringstones-2", "place-volcano-3"]) {
      expect(isTroubleHomeId(bad)).toBe(false);
    }
  });
});

describe("the day a clear is banked on", () => {
  it("must be today somewhere on Earth (UTC-12 to UTC+14)", () => {
    const noon = new Date("2026-09-23T12:00:00Z");
    // 00:00 on the 23rd at UTC-12, 02:00 on the 24th at UTC+14.
    expect(isNearToday("2026-09-23", noon)).toBe(true);
    expect(isNearToday("2026-09-24", noon)).toBe(true);
    expect(isNearToday("2026-09-22", noon)).toBe(false);
    expect(isNearToday("2026-09-25", noon)).toBe(false);
    expect(isNearToday("2026-09-21", noon)).toBe(false);
    expect(isNearToday("2026-13-45", noon)).toBe(false);
  });

  it("never accepts a date no one on Earth has reached", () => {
    // 09:00 CDT on the 23rd: it is the 23rd from UTC-12 to UTC+9 and already the 24th past UTC+10,
    // so the 24th is someone's today; the 25th is nobody's, and used to pass.
    const morning = new Date("2026-09-23T14:00:00Z");
    expect(isNearToday("2026-09-23", morning)).toBe(true);
    expect(isNearToday("2026-09-25", morning)).toBe(false);
    // 22:00 CDT on the 23rd (03:00Z on the 24th): the 23rd is still today west of UTC-3, the
    // 24th is today elsewhere, and the 25th is today nowhere yet.
    const evening = new Date("2026-09-24T03:00:00Z");
    expect(isNearToday("2026-09-23", evening)).toBe(true);
    expect(isNearToday("2026-09-24", evening)).toBe(true);
    expect(isNearToday("2026-09-25", evening)).toBe(false);
  });

  it("closes a day once it has ended everywhere", () => {
    // 12:01Z on the 24th: the 23rd has ended even at UTC-12.
    expect(isNearToday("2026-09-23", new Date("2026-09-24T12:01:00Z"))).toBe(false);
    // 09:59Z on the 23rd: the 24th has not started anywhere (UTC+14 is at 23:59 on the 23rd).
    expect(isNearToday("2026-09-24", new Date("2026-09-23T09:59:00Z"))).toBe(false);
    expect(isNearToday("2026-09-24", new Date("2026-09-23T10:00:00Z"))).toBe(true);
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

describe("earningLines — the one place the Realm says how minutes are earned (spec §3.11)", () => {
  const settings = { enabled: true, earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 5 };
  const status = (over: Partial<BountyStatus> = {}): BountyStatus => ({
    enabled: true,
    capMinutes: 5,
    subCapMinutes: 5,
    paidMinutes: 0,
    remainingMinutes: 5,
    clearsToday: 0,
    paidHomes: [],
    ...over,
  });
  const say = (...args: Parameters<typeof earningLines>) => earningLines(...args).join(" ");

  it("earned and both, bounty on, allowance left: a quest's minutes and clearing's, up to the sub-cap", () => {
    for (const mode of ["earned", "both"] as const) {
      expect(earningLines(settings, status(), mode)).toEqual([
        "Finish a quest and you earn 5 more minutes here.",
        "Clearing troubles earns a minute each, up to 5 a day.",
      ]);
      expect(say(settings, status(), mode)).toBe("Finish a quest and you earn 5 more minutes here. Clearing troubles earns a minute each, up to 5 a day.");
    }
  });

  it("names the day's sub-cap, not the parent's number", () => {
    expect(say({ ...settings, troubleBonusCapMinutes: 30 }, status({ capMinutes: 30, subCapMinutes: 15, remainingMinutes: 15 }), "earned")).toBe(
      "Finish a quest and you earn 5 more minutes here. Clearing troubles earns a minute each, up to 15 a day.",
    );
  });

  it("earned and both, the sub-cap spent: says today's minutes from clearing are had", () => {
    for (const mode of ["earned", "both"] as const) {
      expect(say(settings, status({ paidMinutes: 5, remainingMinutes: 0 }), mode)).toBe(
        "Finish a quest and you earn 5 more minutes here. You've had all today's minutes from clearing troubles.",
      );
    }
  });

  it("earned and both, bounty off (a cap of 0): slice 6's line, unchanged, and no word of clearing", () => {
    for (const mode of ["earned", "both"] as const) {
      const off = { ...settings, troubleBonusCapMinutes: 0 };
      expect(say(off, status({ enabled: false, capMinutes: 0, subCapMinutes: 0, remainingMinutes: 0 }), mode)).toBe(
        "Finish a quest and you earn 5 more minutes here, up to 30 a day.",
      );
      expect(say(off, null, mode)).toBe("Finish a quest and you earn 5 more minutes here, up to 30 a day.");
    }
  });

  it("scheduled: recess, and never a promise of minutes — the bounty cannot pay there", () => {
    expect(earningLines(settings, status({ enabled: false }), "scheduled")).toEqual(["Your Realm time comes from recess, not from quests."]);
    expect(earningLines(settings, null, "scheduled")).toEqual(["Your Realm time comes from recess, not from quests."]);
  });

  it("open: open up to the daily cap, and never a promise of minutes", () => {
    expect(earningLines(settings, status({ enabled: false }), "open")).toEqual(["Your Realm is open, up to 30 minutes a day."]);
  });

  it("promises no minutes in open or scheduled mode, whatever the bounty's cap", () => {
    for (const mode of ["open", "scheduled"] as const) {
      for (const cap of [0, 5, 30]) {
        const text = say({ ...settings, troubleBonusCapMinutes: cap }, status(), mode);
        expect(text).not.toMatch(/earn/i);
        expect(text).not.toMatch(/clearing/i);
      }
    }
  });

  it("before the server has answered, names no number for clearing rather than guess one", () => {
    expect(say(settings, null, "earned")).toBe("Finish a quest and you earn 5 more minutes here. Clearing troubles earns a minute each.");
  });

  it("believes the server when it says the bounty is off", () => {
    expect(say(settings, status({ enabled: false, subCapMinutes: 0, remainingMinutes: 0 }), "earned")).toBe(
      "Finish a quest and you earn 5 more minutes here, up to 30 a day.",
    );
  });

  it("counts right at one, and says who gives minutes when a quest earns none", () => {
    expect(say({ ...settings, earnedMinutesPerQuest: 1, dailyCapMinutes: 5 }, status({ subCapMinutes: 1 }), "earned")).toBe(
      "Finish a quest and you earn 1 more minute here. Clearing troubles earns a minute each, up to 1 a day.",
    );
    expect(say({ ...settings, earnedMinutesPerQuest: 0, troubleBonusCapMinutes: 0 }, null, "earned")).toBe("A grown-up gives you your minutes here, up to 30 a day.");
  });

  it("says nothing when the Realm is switched off", () => {
    for (const mode of ["earned", "both", "open", "scheduled"] as const) expect(earningLines({ ...settings, enabled: false }, null, mode)).toEqual([]);
  });
});
