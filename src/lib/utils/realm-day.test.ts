import { describe, it, expect } from "vitest";
import { DEFAULT_REALM_SETTINGS, type RealmSettings } from "./realm-settings";
import type { LedgerRow, RealmAccessMode } from "./realm-access";
import { dayOpeningRows, isDayOpen, opensDays, previewToday } from "./realm-day";

const settings: RealmSettings = { ...DEFAULT_REALM_SETTINGS, dailyAllowanceMinutes: 10, bankCapMinutes: 30 };
// Yesterday: 10 free, 25 earned, 15 spent — the spend eats the free 10 first, so 20 is banked.
const yesterday: LedgerRow[] = [
  { kind: "allowance", minutes: 10 },
  { kind: "earned", minutes: 25 },
  { kind: "spent", minutes: 15 },
];

describe("dayOpeningRows — what a new day starts with", () => {
  it.each<[RealmAccessMode, number, number]>([
    ["earned", 10, 20],
    ["both", 10, 20],
    ["scheduled", 0, 0],
    ["open", 0, 0],
  ])("in %s mode: allowance %i, carried %i", (accessMode, allowance, carried) => {
    expect(dayOpeningRows(yesterday, { ...settings, accessMode })).toEqual({ allowance, carried });
  });

  it("opens nothing when the Realm is switched off", () => {
    expect(dayOpeningRows(yesterday, { ...settings, enabled: false })).toEqual({ allowance: 0, carried: 0 });
  });

  it("carries at most the bank cap, and nothing at a cap of 0", () => {
    expect(dayOpeningRows(yesterday, { ...settings, bankCapMinutes: 12 }).carried).toBe(12);
    expect(dayOpeningRows(yesterday, { ...settings, bankCapMinutes: 0 }).carried).toBe(0);
  });

  it("starts a child with no history on the allowance and an empty bank", () => {
    expect(dayOpeningRows([], settings)).toEqual({ allowance: 10, carried: 0 });
  });
});

describe("opensDays — only an enabled Realm in an earning mode opens days", () => {
  it.each<[RealmAccessMode, boolean]>([["earned", true], ["both", true], ["scheduled", false], ["open", false]])("%s → %s", (accessMode, want) => {
    expect(opensDays({ ...settings, accessMode })).toBe(want);
    expect(opensDays({ ...settings, accessMode, enabled: false })).toBe(false);
  });
});

describe("isDayOpen — a day is open once its allowance row is written", () => {
  it("is the allowance row, not any other row (a charge can land before the day opens)", () => {
    expect(isDayOpen([])).toBe(false);
    expect(isDayOpen([{ kind: "spent", minutes: 1 }, { kind: "earned", minutes: 5 }])).toBe(false);
    expect(isDayOpen([{ kind: "allowance", minutes: 0 }])).toBe(true);
  });
});

describe("previewToday — today's rows as they will be once the child opens the day", () => {
  it("adds the allowance and carried rows when today is not opened yet", () => {
    const today: LedgerRow[] = [{ kind: "spent", minutes: 2 }];
    expect(previewToday(today, yesterday, settings)).toEqual([
      { kind: "spent", minutes: 2 },
      { kind: "allowance", minutes: 10 },
      { kind: "carried", minutes: 20 },
    ]);
  });

  it("adds nothing (no 0 rows) when the Realm is off or the mode never opens days", () => {
    const today: LedgerRow[] = [{ kind: "spent", minutes: 2 }];
    for (const s of [{ ...settings, enabled: false }, { ...settings, accessMode: "scheduled" as const }, { ...settings, accessMode: "open" as const }]) {
      expect(previewToday(today, yesterday, s)).toEqual(today);
    }
  });

  it("leaves an opened day exactly as written, whatever the settings now say", () => {
    const today: LedgerRow[] = [{ kind: "allowance", minutes: 5 }, { kind: "carried", minutes: 0 }];
    expect(previewToday(today, yesterday, settings)).toEqual(today);
  });
});
