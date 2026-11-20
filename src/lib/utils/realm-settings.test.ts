import { describe, it, expect } from "vitest";
import { DEFAULT_REALM_SETTINGS, MATERIALS_PER_QUEST_RANGE, settingsFromRow, validateRealmSettingsPatch } from "./realm-settings";
import { STORED_MAX } from "@/lib/realm3d/tutorial";

const ROW = {
  enabled: true,
  accessMode: "earned",
  earnedMinutesPerQuest: 5,
  offHoursEnabled: false,
  dailyCapMinutes: 30,
  toneMode: "gentle",
  depthOverride: "auto",
  tutorialStep: 0,
};

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
    expect(validateRealmSettingsPatch({ accessMode: "open" })).toEqual({ accessMode: "open" });
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

describe("tutorialStep", () => {
  it("accepts a tutorial step in range and refuses one outside it", () => {
    expect(validateRealmSettingsPatch({ tutorialStep: 0 })).toEqual({ tutorialStep: 0 });
    expect(validateRealmSettingsPatch({ tutorialStep: 4 })).toEqual({ tutorialStep: 4 });
    // The 3D Realm's lessons are stored above the flat Realm's four, up to STORED_MAX.
    expect(validateRealmSettingsPatch({ tutorialStep: 5 })).toEqual({ tutorialStep: 5 });
    expect(validateRealmSettingsPatch({ tutorialStep: STORED_MAX })).toEqual({ tutorialStep: STORED_MAX });
    expect(() => validateRealmSettingsPatch({ tutorialStep: STORED_MAX + 1 })).toThrow();
    expect(() => validateRealmSettingsPatch({ tutorialStep: -1 })).toThrow();
    expect(() => validateRealmSettingsPatch({ tutorialStep: 1.5 })).toThrow();
  });

  it("defaults a missing or corrupt tutorial step to the beginning", () => {
    expect(DEFAULT_REALM_SETTINGS.tutorialStep).toBe(0);
    expect(settingsFromRow({ ...ROW, tutorialStep: -1 }).tutorialStep).toBe(0);
    expect(settingsFromRow({ ...ROW, tutorialStep: 2.5 }).tutorialStep).toBe(0);
    expect(settingsFromRow({ ...ROW, tutorialStep: "7" }).tutorialStep).toBe(0);
    expect(settingsFromRow({ ...ROW, tutorialStep: STORED_MAX }).tutorialStep).toBe(STORED_MAX);
  });

  it("reads a step past this build's ladder as finished, never as never-started", () => {
    // A newer build (a longer ladder) wrote it, and an older build — a rollback, or a tab left
    // open across a deploy — is reading it. Resetting it to 0 sent a child who had finished
    // back to lesson 1, and their next lesson then overwrote the finished value for good.
    expect(settingsFromRow({ ...ROW, tutorialStep: STORED_MAX + 1 }).tutorialStep).toBe(STORED_MAX);
    expect(settingsFromRow({ ...ROW, tutorialStep: 99 }).tutorialStep).toBe(STORED_MAX);
  });
});

describe("side-quest length and second chances", () => {
  it("defaults to 8 questions with second chances on", () => {
    expect(DEFAULT_REALM_SETTINGS.sideQuestLength).toBe(8);
    expect(DEFAULT_REALM_SETTINGS.secondChances).toBe(true);
  });
  it("reads an out-of-range length as the default and keeps a valid one", () => {
    expect(settingsFromRow({ sideQuestLength: 13 }).sideQuestLength).toBe(8);
    expect(settingsFromRow({ sideQuestLength: 6 }).sideQuestLength).toBe(6);
  });
  it("reads a non-boolean second-chances value as the default", () => {
    expect(settingsFromRow({ secondChances: "yes" }).secondChances).toBe(true);
    expect(settingsFromRow({ secondChances: false }).secondChances).toBe(false);
  });
  it("rejects a bad length or flag on write", () => {
    expect(() => validateRealmSettingsPatch({ sideQuestLength: 3 })).toThrow("Side quests must be 4–12 questions.");
    expect(validateRealmSettingsPatch({ sideQuestLength: 12 })).toEqual({ sideQuestLength: 12 });
    expect(validateRealmSettingsPatch({ secondChances: false })).toEqual({ secondChances: false });
    expect(() => validateRealmSettingsPatch({ secondChances: 1 })).toThrow();
  });
});

describe("earning-time settings", () => {
  it("defaults: 10 free minutes, 1 minute a star, 15 side-quest minutes a day, a 30-minute bank", () => {
    expect(DEFAULT_REALM_SETTINGS.dailyAllowanceMinutes).toBe(10);
    expect(DEFAULT_REALM_SETTINGS.minutesPerStar).toBe(1);
    expect(DEFAULT_REALM_SETTINGS.sideQuestDailyCapMinutes).toBe(15);
    expect(DEFAULT_REALM_SETTINGS.bankCapMinutes).toBe(30);
  });

  it("reads an out-of-range or non-integer value as the default and keeps boundaries", () => {
    expect(settingsFromRow({ dailyAllowanceMinutes: 61 }).dailyAllowanceMinutes).toBe(10);
    expect(settingsFromRow({ dailyAllowanceMinutes: 1.5 }).dailyAllowanceMinutes).toBe(10);
    expect(settingsFromRow({ dailyAllowanceMinutes: 0 }).dailyAllowanceMinutes).toBe(0);
    expect(settingsFromRow({ dailyAllowanceMinutes: 60 }).dailyAllowanceMinutes).toBe(60);
    expect(settingsFromRow({ minutesPerStar: 6 }).minutesPerStar).toBe(1);
    expect(settingsFromRow({ minutesPerStar: 0 }).minutesPerStar).toBe(0);
    expect(settingsFromRow({ minutesPerStar: 5 }).minutesPerStar).toBe(5);
    expect(settingsFromRow({ sideQuestDailyCapMinutes: 121 }).sideQuestDailyCapMinutes).toBe(15);
    expect(settingsFromRow({ sideQuestDailyCapMinutes: 0 }).sideQuestDailyCapMinutes).toBe(0);
    expect(settingsFromRow({ sideQuestDailyCapMinutes: 120 }).sideQuestDailyCapMinutes).toBe(120);
    expect(settingsFromRow({ bankCapMinutes: -1 }).bankCapMinutes).toBe(30);
    expect(settingsFromRow({ bankCapMinutes: 241 }).bankCapMinutes).toBe(30);
    expect(settingsFromRow({ bankCapMinutes: 0 }).bankCapMinutes).toBe(0);
    expect(settingsFromRow({ bankCapMinutes: 240 }).bankCapMinutes).toBe(240);
  });

  it("rejects out-of-range writes and accepts the boundaries", () => {
    expect(() => validateRealmSettingsPatch({ dailyAllowanceMinutes: 61 })).toThrow("Free minutes must be 0–60 a day.");
    expect(() => validateRealmSettingsPatch({ dailyAllowanceMinutes: -1 })).toThrow();
    expect(validateRealmSettingsPatch({ dailyAllowanceMinutes: 0 })).toEqual({ dailyAllowanceMinutes: 0 });
    expect(validateRealmSettingsPatch({ dailyAllowanceMinutes: 60 })).toEqual({ dailyAllowanceMinutes: 60 });
    expect(() => validateRealmSettingsPatch({ minutesPerStar: 6 })).toThrow("Minutes per star must be 0–5.");
    expect(() => validateRealmSettingsPatch({ minutesPerStar: 0.5 })).toThrow();
    expect(validateRealmSettingsPatch({ minutesPerStar: 0 })).toEqual({ minutesPerStar: 0 });
    expect(validateRealmSettingsPatch({ minutesPerStar: 5 })).toEqual({ minutesPerStar: 5 });
    expect(() => validateRealmSettingsPatch({ sideQuestDailyCapMinutes: 121 })).toThrow("Side-quest minutes must be 0–120 a day.");
    expect(validateRealmSettingsPatch({ sideQuestDailyCapMinutes: 0 })).toEqual({ sideQuestDailyCapMinutes: 0 });
    expect(validateRealmSettingsPatch({ sideQuestDailyCapMinutes: 120 })).toEqual({ sideQuestDailyCapMinutes: 120 });
    expect(() => validateRealmSettingsPatch({ bankCapMinutes: 241 })).toThrow("The saved-minutes bank must be 0–240 minutes.");
    expect(validateRealmSettingsPatch({ bankCapMinutes: 0 })).toEqual({ bankCapMinutes: 0 });
    expect(validateRealmSettingsPatch({ bankCapMinutes: 240 })).toEqual({ bankCapMinutes: 240 });
  });
});

describe("real-work settings (materials per quest, minutes on quest cards)", () => {
  it("defaults to 1 material a quest and the minutes hidden on quests", () => {
    expect(DEFAULT_REALM_SETTINGS.materialsPerQuest).toBe(1);
    expect(DEFAULT_REALM_SETTINGS.showMinutesOnQuests).toBe(false);
    expect(MATERIALS_PER_QUEST_RANGE).toEqual({ min: 0, max: 3 });
    expect(settingsFromRow(null).materialsPerQuest).toBe(1);
  });

  it("reads an out-of-range, fractional or non-number count as the default and keeps the boundaries", () => {
    for (const bad of [4, -1, 1.5, "2", null, undefined]) expect(settingsFromRow({ materialsPerQuest: bad }).materialsPerQuest, String(bad)).toBe(1);
    expect(settingsFromRow({ materialsPerQuest: 0 }).materialsPerQuest).toBe(0);
    expect(settingsFromRow({ materialsPerQuest: 3 }).materialsPerQuest).toBe(3);
  });

  it("reads a non-boolean minutes switch as the default", () => {
    expect(settingsFromRow({ showMinutesOnQuests: "yes" }).showMinutesOnQuests).toBe(false);
    expect(settingsFromRow({ showMinutesOnQuests: 1 }).showMinutesOnQuests).toBe(false);
    expect(settingsFromRow({ showMinutesOnQuests: true }).showMinutesOnQuests).toBe(true);
  });

  it("rejects a bad write and accepts the boundaries", () => {
    expect(() => validateRealmSettingsPatch({ materialsPerQuest: 4 })).toThrow("Materials per quest must be 0–3.");
    expect(() => validateRealmSettingsPatch({ materialsPerQuest: -1 })).toThrow("Materials per quest must be 0–3.");
    expect(() => validateRealmSettingsPatch({ materialsPerQuest: 1.5 })).toThrow();
    expect(validateRealmSettingsPatch({ materialsPerQuest: 0 })).toEqual({ materialsPerQuest: 0 });
    expect(validateRealmSettingsPatch({ materialsPerQuest: 3 })).toEqual({ materialsPerQuest: 3 });
    expect(validateRealmSettingsPatch({ showMinutesOnQuests: true })).toEqual({ showMinutesOnQuests: true });
    expect(() => validateRealmSettingsPatch({ showMinutesOnQuests: "yes" })).toThrow("showMinutesOnQuests must be on or off.");
  });

  it("keeps the pinned plan, the delivery mark and the regrade stamp out of the settings", () => {
    for (const key of ["pinnedPlan", "deliverySeenAt", "regradedAt"]) {
      expect(() => validateRealmSettingsPatch({ [key]: "x" }), key).toThrow(`Unknown Realm setting: ${key}`);
      expect(DEFAULT_REALM_SETTINGS).not.toHaveProperty(key);
    }
  });
});

describe("mechanics (the hands-on kinds a grown-up can switch off)", () => {
  it("is all on by default, and a default is never shared with a caller who edits it", () => {
    expect(DEFAULT_REALM_SETTINGS.mechanics).toEqual({ measure: true, lock: true });
    const a = settingsFromRow(null);
    a.mechanics.measure = false;
    expect(DEFAULT_REALM_SETTINGS.mechanics.measure).toBe(true);
    expect(settingsFromRow(null).mechanics.measure).toBe(true);
    const b = settingsFromRow({ dailyCapMinutes: 45 });
    b.mechanics.measure = false;
    expect(settingsFromRow({ dailyCapMinutes: 45 }).mechanics.measure).toBe(true);
  });

  it("reads the stored JSON text leniently: null, junk, non-objects, non-booleans and missing keys are all on", () => {
    for (const raw of [null, undefined, "", "not json", "{", "[]", "[true]", "true", "7", '"measure"', "null", "{}", '{"measure":"no"}', '{"measure":0}', '{"measure":null}', 5, {}]) {
      expect(settingsFromRow({ mechanics: raw }).mechanics, String(raw)).toEqual({ measure: true, lock: true });
    }
  });

  it("reads an off switch, and ignores keys it does not know", () => {
    expect(settingsFromRow({ mechanics: '{"measure":false}' }).mechanics).toEqual({ measure: false, lock: true });
    expect(settingsFromRow({ mechanics: '{"measure":true}' }).mechanics).toEqual({ measure: true, lock: true });
    expect(settingsFromRow({ mechanics: '{"measure":false,"origami":false}' }).mechanics).toEqual({ measure: false, lock: true });
    expect(settingsFromRow({ mechanics: '{"lock":false}' }).mechanics).toEqual({ measure: true, lock: false });
  });

  it("a row stored before locks existed reads locks on: the column is JSON, so no migration (slice 4)", () => {
    expect(settingsFromRow({ mechanics: '{"measure":false}' }).mechanics.lock).toBe(true);
    expect(validateRealmSettingsPatch({ mechanics: { lock: false } })).toEqual({ mechanics: { lock: false } });
  });

  it("accepts a partial object of known kinds with boolean values, and returns a copy", () => {
    expect(validateRealmSettingsPatch({ mechanics: { measure: false } })).toEqual({ mechanics: { measure: false } });
    expect(validateRealmSettingsPatch({ mechanics: {} })).toEqual({ mechanics: {} });
    const input = { measure: true };
    expect(validateRealmSettingsPatch({ mechanics: input }).mechanics).not.toBe(input);
  });

  it("refuses an unknown kind, a non-boolean value, and anything that is not a plain object", () => {
    for (const bad of [{ origami: true }, { measure: "off" }, { measure: 0 }, { measure: null }, { measure: false, origami: true }, null, undefined, "measure", 3, true, [], [true], ["measure"]]) {
      expect(() => validateRealmSettingsPatch({ mechanics: bad }), JSON.stringify(bad)).toThrow(/mechanics/i);
    }
  });

  it("a patch toggling measure leaves every other key alone", () => {
    expect(Object.keys(validateRealmSettingsPatch({ mechanics: { measure: false } }))).toEqual(["mechanics"]);
    expect(validateRealmSettingsPatch({ secondChances: false, mechanics: { measure: false } })).toEqual({ secondChances: false, mechanics: { measure: false } });
  });
});
