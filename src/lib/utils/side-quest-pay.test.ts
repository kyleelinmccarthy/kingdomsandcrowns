import { describe, it, expect } from "vitest";
import { DEFAULT_REALM_SETTINGS } from "./realm-settings";
import { sideQuestPay } from "./side-quest-pay";

const s = { ...DEFAULT_REALM_SETTINGS };

describe("sideQuestPay", () => {
  it("pays stars × minutes per star", () => {
    expect(sideQuestPay(3, s, 0)).toEqual({ minutes: 3, full: false });
    expect(sideQuestPay(2, { ...s, minutesPerStar: 3 }, 0)).toEqual({ minutes: 6, full: false });
  });

  it("pays only what is left under the day's limit, and says when the limit is reached", () => {
    expect(sideQuestPay(3, { ...s, sideQuestDailyCapMinutes: 15 }, 14)).toEqual({ minutes: 1, full: true });
    expect(sideQuestPay(3, { ...s, sideQuestDailyCapMinutes: 15 }, 12)).toEqual({ minutes: 3, full: true });
    expect(sideQuestPay(3, { ...s, sideQuestDailyCapMinutes: 15 }, 15)).toEqual({ minutes: 0, full: true });
    expect(sideQuestPay(3, { ...s, sideQuestDailyCapMinutes: 15 }, 20)).toEqual({ minutes: 0, full: true });
  });

  it("a limit of 0 or 0 minutes a star turns the pay off, and a 0 limit is never 'full'", () => {
    expect(sideQuestPay(3, { ...s, sideQuestDailyCapMinutes: 0 }, 0)).toEqual({ minutes: 0, full: false });
    expect(sideQuestPay(3, { ...s, minutesPerStar: 0 }, 0)).toEqual({ minutes: 0, full: false });
  });

  it("pays nothing where minutes mean nothing: a Realm turned off, or a mode that does not earn", () => {
    expect(sideQuestPay(3, { ...s, accessMode: "scheduled" }, 0)).toEqual({ minutes: 0, full: false });
    expect(sideQuestPay(3, { ...s, accessMode: "open" }, 0)).toEqual({ minutes: 0, full: false });
    expect(sideQuestPay(3, { ...s, enabled: false }, 0)).toEqual({ minutes: 0, full: false });
    expect(sideQuestPay(3, { ...s, accessMode: "both" }, 0)).toEqual({ minutes: 3, full: false });
  });

  it("no stars, no minutes", () => {
    expect(sideQuestPay(0, s, 0)).toEqual({ minutes: 0, full: false });
  });
});
