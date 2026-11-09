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
  isTroubleHomeId,
  questMinutesToday,
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

describe("questMinutesToday — the schoolwork the sub-cap measures", () => {
  it("counts quest pay and side-quest practice pay, not the bonus itself", () => {
    expect(questMinutesToday([{ kind: "earned", minutes: 5 }, { kind: "practice", minutes: 3 }, { kind: "bonus", minutes: 1 }])).toBe(8);
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
    const { rows, awarded } = awardClears(ids, [], base, [], false);
    expect(awarded).toBe(5);
    expect(rows.map((r) => r.minutes)).toEqual([1, 1, 1, 1, 1, 0, 0]);
  });

  it("pays a home only once a day, so a respawning trouble cannot be farmed", () => {
    const first = awardClears(["rim-0"], [], base, [], false);
    expect(first.awarded).toBe(1);
    const ledger: LedgerRow[] = [{ kind: "bonus", minutes: 1 }];
    const again = awardClears(["rim-0", "rim-0", "rim-0"], ledger, base, first.rows, false);
    expect(again.awarded).toBe(0);
    expect(again.rows).toHaveLength(3);
    // …and inside one batch too.
    expect(awardClears(["rim-1", "rim-1"], [], base, [], false).awarded).toBe(1);
  });

  it("pays nothing when the bounty is off", () => {
    expect(awardClears(["rim-0"], [], { ...base, accessMode: "open" }, [], false).awarded).toBe(0);
    expect(awardClears(["rim-0"], [], { ...base, troubleBonusCapMinutes: 0 }, [], false).awarded).toBe(0);
  });

  it("pays nothing in the quiet world, but still keeps every clear", () => {
    const { rows, awarded } = awardClears(["rim-0", "rim-1"], earned(2), base, [], true);
    expect(awarded).toBe(0);
    expect(rows).toEqual([{ homeId: "rim-0", minutes: 0 }, { homeId: "rim-1", minutes: 0 }]);
  });

  it("pays at a 0 balance when the child is legitimately in (a recess, off hours): only quiet stops it", () => {
    const spentOut: LedgerRow[] = [{ kind: "allowance", minutes: 10 }, { kind: "spent", minutes: 10 }];
    expect(awardClears(["rim-0"], spentOut, base, [], false).awarded).toBe(1);
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
    ], false);
    expect(s).toMatchObject({ enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 2, remainingMinutes: 3, clearsToday: 3 });
    expect(s.paidHomes).toEqual(["rim-0", "place-cove"]);
  });

  it("promises nothing in the quiet world, so the client never predicts pay it cannot get", () => {
    const s = bountyStatusFor([{ kind: "bonus", minutes: 2 }], base, [], true);
    expect(s).toMatchObject({ enabled: true, subCapMinutes: 5, paidMinutes: 2, remainingMinutes: 0 });
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

describe("the client's purse", () => {
  it("promises nothing until the server has answered", () => {
    const p = startPurse();
    expect(takeClear(p, "rim-0")).toMatchObject({ paid: false, capped: false, clearsToday: 1 });
  });

  it("predicts a paid clear, an already-paid home, and the cap", () => {
    const p = startPurse();
    applyStatus(p, bountyStatusFor([{ kind: "bonus", minutes: 4 }], base, [{ homeId: "rim-0", minutes: 1 }], false), []);
    expect(takeClear(p, "rim-0")).toMatchObject({ paid: false, already: true, clearsToday: 2 });
    expect(takeClear(p, "rim-1")).toMatchObject({ paid: true, clearsToday: 3 });
    expect(takeClear(p, "rim-2")).toMatchObject({ paid: false, capped: true, clearsToday: 4 });
  });

  it("lays unsent clears back on top of the server's answer", () => {
    const p = startPurse();
    applyStatus(p, bountyStatusFor([], base, [], false), ["rim-0", "rim-0", "rim-1"]);
    expect(p.clearsToday).toBe(3);
    expect(p.remaining).toBe(3);
    expect([...p.paidHomes]).toEqual(["rim-0", "rim-1"]);
  });
});

describe("earningLines — the one place the Realm says how minutes are earned (spec §3.11)", () => {
  // The earning-time settings at 0, so each older line is asserted alone; the new lines have their own tests below.
  const settings = { enabled: true, earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 5, dailyAllowanceMinutes: 0, minutesPerStar: 0, sideQuestDailyCapMinutes: 0, bankCapMinutes: 0 };
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

  /* ---- earning time (spec §4.8): the free minutes, side quests' stars, and the bank */
  const earning = { ...settings, dailyAllowanceMinutes: 10, minutesPerStar: 1, sideQuestDailyCapMinutes: 15, bankCapMinutes: 30 };

  it("earned and both: the day's free minutes first, then side quests' stars and the bank after the older lines", () => {
    for (const mode of ["earned", "both"] as const) {
      expect(earningLines(earning, status(), mode)).toEqual([
        "You get 10 free minutes every day.",
        "Finish a quest and you earn 5 more minutes here.",
        "Clearing troubles earns a minute each, up to 5 a day.",
        "Side quests earn 1 minute per star, up to 15 a day.",
        "Unspent minutes are kept for tomorrow, up to 30.",
      ]);
    }
  });

  it("counts the minutes a star pays right", () => {
    expect(earningLines({ ...earning, minutesPerStar: 2 }, status(), "earned")).toContain("Side quests earn 2 minutes per star, up to 15 a day.");
    expect(earningLines({ ...earning, dailyAllowanceMinutes: 1 }, status(), "earned")[0]).toBe("You get 1 free minute every day.");
  });

  it("never says a grown-up gives all the minutes while free minutes or side quests give some", () => {
    const noQuest = { ...earning, earnedMinutesPerQuest: 0 };
    for (const lines of [earningLines(noQuest, status(), "earned"), earningLines({ ...noQuest, troubleBonusCapMinutes: 0 }, null, "earned")]) {
      expect(lines.join(" ")).not.toMatch(/A grown-up gives you your minutes/);
      expect(lines.join(" ")).toMatch(/A grown-up can give you more minutes too/);
    }
    // Only the side quests on: still no contradiction.
    expect(earningLines({ ...noQuest, dailyAllowanceMinutes: 0 }, null, "earned").join(" ")).not.toMatch(/A grown-up gives you your minutes/);
    // Nothing else gives minutes: the grown-up does, as before.
    expect(earningLines({ ...noQuest, dailyAllowanceMinutes: 0, minutesPerStar: 0 }, null, "earned")).toContain("A grown-up gives you your minutes here.");
  });

  it("leaves out each new line whose setting is 0", () => {
    const lines = (over: Partial<typeof earning>) => earningLines({ ...earning, ...over }, status(), "earned");
    expect(lines({ dailyAllowanceMinutes: 0 })).not.toContain("You get 10 free minutes every day.");
    expect(lines({ dailyAllowanceMinutes: 0 })[0]).toBe("Finish a quest and you earn 5 more minutes here.");
    expect(lines({ minutesPerStar: 0 }).some((l) => l.startsWith("Side quests earn"))).toBe(false);
    expect(lines({ sideQuestDailyCapMinutes: 0 }).some((l) => l.startsWith("Side quests earn"))).toBe(false);
    expect(lines({ bankCapMinutes: 0 }).some((l) => l.startsWith("Unspent minutes"))).toBe(false);
  });

  it("promises none of them in scheduled or open mode, where minutes are never read", () => {
    expect(earningLines(earning, status({ enabled: false }), "scheduled")).toEqual(["Your Realm time comes from recess, not from quests."]);
    expect(earningLines(earning, status({ enabled: false }), "open")).toEqual(["Your Realm is open, up to 30 minutes a day."]);
  });
});
