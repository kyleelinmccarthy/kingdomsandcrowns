import { describe, it, expect } from "vitest";
import {
  computeRealmAccess,
  isOutsideSchoolHours,
  ledgerBalance,
  minutesSpent,
  type AccessInput,
} from "./realm-access";

const settings = { enabled: true, accessMode: "earned" as const, offHoursEnabled: false, dailyCapMinutes: 30 };
const classes = [
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "13:00", endTime: "14:00" },
];
const base: AccessInput = {
  timeOfDay: "10:30",
  isSchoolDay: true,
  settings,
  ledgerToday: [{ kind: "earned", minutes: 10 }],
  classBlocksToday: classes,
  recessBlocksToday: [],
};

describe("ledger math", () => {
  it("balance is earned plus granted minus spent, never negative", () => {
    expect(ledgerBalance([{ kind: "earned", minutes: 5 }, { kind: "granted", minutes: 10 }, { kind: "spent", minutes: 7 }])).toBe(8);
    expect(ledgerBalance([{ kind: "spent", minutes: 7 }])).toBe(0);
  });
  it("spent sums only spent rows", () => {
    expect(minutesSpent([{ kind: "earned", minutes: 5 }, { kind: "spent", minutes: 3 }, { kind: "spent", minutes: 4 }])).toBe(7);
  });
});

describe("isOutsideSchoolHours", () => {
  it("is true on a non-school day", () => {
    expect(isOutsideSchoolHours("10:30", false, classes)).toBe(true);
  });
  it("is true when there are no class blocks", () => {
    expect(isOutsideSchoolHours("10:30", true, [])).toBe(true);
  });
  it("is true before the first class and at or after the last", () => {
    expect(isOutsideSchoolHours("08:59", true, classes)).toBe(true);
    expect(isOutsideSchoolHours("14:00", true, classes)).toBe(true);
  });
  it("is false between classes on a school day (a gap is still school time)", () => {
    expect(isOutsideSchoolHours("10:30", true, classes)).toBe(false);
  });
  it("treats a malformed time as during school (fail closed)", () => {
    expect(isOutsideSchoolHours("noon", true, classes)).toBe(false);
  });
});

describe("computeRealmAccess", () => {
  it("denies when disabled", () => {
    expect(computeRealmAccess({ ...base, settings: { ...settings, enabled: false } })).toEqual({ allowed: false, reason: "disabled" });
  });
  it("denies at the daily cap, whatever the mode", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "both", offHoursEnabled: true },
      isSchoolDay: false,
      ledgerToday: [{ kind: "earned", minutes: 60 }, { kind: "spent", minutes: 30 }],
    });
    expect(r).toEqual({ allowed: false, reason: "cap_reached" });
  });
  it("allows off hours with cap minus spent remaining", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, offHoursEnabled: true },
      isSchoolDay: false,
      ledgerToday: [{ kind: "spent", minutes: 12 }],
    });
    expect(r).toEqual({ allowed: true, minutesRemaining: 18, source: "off_hours" });
  });
  it("allows a recess block and limits to the block's remaining time", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "scheduled" },
      ledgerToday: [],
      recessBlocksToday: [{ startTime: "10:15", endTime: "10:40" }],
    });
    expect(r).toEqual({ allowed: true, minutesRemaining: 10, source: "recess" });
  });
  it("denies outside the recess block in scheduled mode", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "scheduled" },
      recessBlocksToday: [{ startTime: "11:00", endTime: "11:20" }],
    });
    expect(r).toEqual({ allowed: false, reason: "outside_recess" });
  });
  it("allows earned minutes and limits to the smaller of balance and cap headroom", () => {
    expect(computeRealmAccess(base)).toEqual({ allowed: true, minutesRemaining: 10, source: "earned" });
    const nearCap = computeRealmAccess({ ...base, ledgerToday: [{ kind: "earned", minutes: 50 }, { kind: "spent", minutes: 25 }] });
    expect(nearCap).toEqual({ allowed: true, minutesRemaining: 5, source: "earned" });
  });
  it("denies with no_minutes when the balance is empty in earned mode", () => {
    expect(computeRealmAccess({ ...base, ledgerToday: [] })).toEqual({ allowed: false, reason: "no_minutes" });
  });
  it("in both mode, recess wins when active and earned minutes cover the rest", () => {
    const both = { ...settings, accessMode: "both" as const };
    const inRecess = computeRealmAccess({ ...base, settings: both, recessBlocksToday: [{ startTime: "10:00", endTime: "11:00" }] });
    expect(inRecess).toEqual({ allowed: true, minutesRemaining: 30, source: "recess" });
    const afterRecess = computeRealmAccess({ ...base, settings: both, recessBlocksToday: [{ startTime: "09:00", endTime: "09:30" }] });
    expect(afterRecess).toEqual({ allowed: true, minutesRemaining: 10, source: "earned" });
  });
  it("names the most helpful denial in both mode", () => {
    const both = { ...settings, accessMode: "both" as const };
    expect(computeRealmAccess({ ...base, settings: both, ledgerToday: [] })).toEqual({ allowed: false, reason: "no_minutes" });
  });
  it("reports the mode's own reason instead of school_hours during school time", () => {
    const r = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "scheduled", offHoursEnabled: true },
      recessBlocksToday: [],
    });
    expect(r).toEqual({ allowed: false, reason: "outside_recess" });
    const offOnly = computeRealmAccess({
      ...base,
      settings: { ...settings, accessMode: "earned", offHoursEnabled: true },
      ledgerToday: [],
    });
    expect(offOnly).toEqual({ allowed: false, reason: "no_minutes" });
  });
});
