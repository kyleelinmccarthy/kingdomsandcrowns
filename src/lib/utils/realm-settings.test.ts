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

describe("depthOverride", () => {
  it("defaults to automatic", () => {
    expect(DEFAULT_REALM_SETTINGS.depthOverride).toBe("auto");
  });

  it("passes the three stored values through and coerces anything else to auto", () => {
    expect(settingsFromRow({ depthOverride: "auto" }).depthOverride).toBe("auto");
    expect(settingsFromRow({ depthOverride: "simple" }).depthOverride).toBe("simple");
    expect(settingsFromRow({ depthOverride: "full" }).depthOverride).toBe("full");
    // A hand-edited database, a future enum change, a column that does not exist yet:
    // the Realm never crashes on a bad enum, it falls back to automatic.
    expect(settingsFromRow({ depthOverride: "Simple" }).depthOverride).toBe("auto");
    expect(settingsFromRow({ depthOverride: null }).depthOverride).toBe("auto");
    expect(settingsFromRow({ depthOverride: 7 }).depthOverride).toBe("auto");
    expect(settingsFromRow({ depthOverride: undefined }).depthOverride).toBe("auto");
    expect(settingsFromRow(null).depthOverride).toBe("auto");
  });

  it("accepts the three values in a patch and refuses anything else", () => {
    expect(validateRealmSettingsPatch({ depthOverride: "auto" })).toEqual({ depthOverride: "auto" });
    expect(validateRealmSettingsPatch({ depthOverride: "simple" })).toEqual({ depthOverride: "simple" });
    expect(validateRealmSettingsPatch({ depthOverride: "full" })).toEqual({ depthOverride: "full" });
    expect(() => validateRealmSettingsPatch({ depthOverride: "everything" })).toThrow("Choose automatic, simple, or everything.");
    expect(() => validateRealmSettingsPatch({ depthOverride: null })).toThrow("Choose automatic, simple, or everything.");
  });
});
