import { describe, it, expect } from "vitest";
import { DEFAULT_REALM_SETTINGS, settingsFromRow, validateRealmSettingsPatch } from "./realm-settings";

describe("settingsFromRow", () => {
  it("falls back to defaults", () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_REALM_SETTINGS);
    expect(settingsFromRow({ dailyCapMinutes: 45 })).toEqual({ ...DEFAULT_REALM_SETTINGS, dailyCapMinutes: 45 });
  });
});

describe("validateRealmSettingsPatch", () => {
  it("accepts valid values", () => {
    expect(
      validateRealmSettingsPatch({ accessMode: "both", earnedMinutesPerQuest: 10, dailyCapMinutes: 60, toneMode: "monsters", enabled: false, offHoursEnabled: true })
    ).toEqual({ accessMode: "both", earnedMinutesPerQuest: 10, dailyCapMinutes: 60, toneMode: "monsters", enabled: false, offHoursEnabled: true });
  });
  it("rejects an unknown mode or tone", () => {
    expect(() => validateRealmSettingsPatch({ accessMode: "always" })).toThrow();
    expect(() => validateRealmSettingsPatch({ toneMode: "gory" })).toThrow();
  });
  it("bounds minutes per quest to 0..60 and the cap to 5..240", () => {
    expect(() => validateRealmSettingsPatch({ earnedMinutesPerQuest: 61 })).toThrow();
    expect(() => validateRealmSettingsPatch({ earnedMinutesPerQuest: -1 })).toThrow();
    expect(() => validateRealmSettingsPatch({ dailyCapMinutes: 4 })).toThrow();
    expect(() => validateRealmSettingsPatch({ dailyCapMinutes: 241 })).toThrow();
    expect(validateRealmSettingsPatch({ earnedMinutesPerQuest: 0, dailyCapMinutes: 5 })).toEqual({ earnedMinutesPerQuest: 0, dailyCapMinutes: 5 });
  });
  it("rejects unknown keys", () => {
    expect(() => validateRealmSettingsPatch({ childId: "x" })).toThrow();
  });
});
