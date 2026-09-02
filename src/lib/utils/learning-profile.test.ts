import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEARNING_PROFILE,
  LEARNING_PRESETS,
  applyPreset,
  profileFromRow,
  readingAttributes,
  validateProfilePatch,
} from "./learning-profile";

describe("profileFromRow", () => {
  it("returns defaults for a missing row", () => {
    expect(profileFromRow(null)).toEqual(DEFAULT_LEARNING_PROFILE);
  });
  it("keeps defaults for columns the row lacks", () => {
    expect(profileFromRow({ untimed: true })).toEqual({ ...DEFAULT_LEARNING_PROFILE, untimed: true });
  });
  it("ignores an unknown input mode", () => {
    expect(profileFromRow({ inputMode: "gamepad" }).inputMode).toBe("auto");
  });
});

describe("LEARNING_PRESETS", () => {
  it("each preset sets exactly its toggles on top of the current profile", () => {
    for (const preset of LEARNING_PRESETS) {
      expect(applyPreset(DEFAULT_LEARNING_PROFILE, preset.id)).toEqual({
        ...DEFAULT_LEARNING_PROFILE,
        ...preset.toggles,
      });
    }
  });
  it("reading support turns on the reading toggles", () => {
    const p = applyPreset(DEFAULT_LEARNING_PROFILE, "reading-support");
    expect(p.readingFont).toBe(true);
    expect(p.largerText).toBe(true);
    expect(p.extraSpacing).toBe(true);
    expect(p.readAloud).toBe(true);
  });
  it("does not clear unrelated toggles", () => {
    const p = applyPreset({ ...DEFAULT_LEARNING_PROFILE, untimed: true }, "reading-support");
    expect(p.untimed).toBe(true);
  });
  it("leaves the profile alone for an unknown preset", () => {
    expect(applyPreset(DEFAULT_LEARNING_PROFILE, "nope")).toEqual(DEFAULT_LEARNING_PROFILE);
  });
});

describe("validateProfilePatch", () => {
  it("passes booleans and a valid session length", () => {
    expect(validateProfilePatch({ untimed: true, sessionMinutes: 15 })).toEqual({ untimed: true, sessionMinutes: 15 });
  });
  it("allows clearing the session length", () => {
    expect(validateProfilePatch({ sessionMinutes: null })).toEqual({ sessionMinutes: null });
  });
  it("rejects a session length outside 5..120", () => {
    expect(() => validateProfilePatch({ sessionMinutes: 2 })).toThrow();
    expect(() => validateProfilePatch({ sessionMinutes: 500 })).toThrow();
  });
  it("rejects a non-boolean toggle and an unknown key", () => {
    expect(() => validateProfilePatch({ untimed: "yes" })).toThrow();
    expect(() => validateProfilePatch({ diagnosis: "x" })).toThrow();
  });
});

describe("readingAttributes", () => {
  it("is empty when nothing is on", () => {
    expect(readingAttributes(DEFAULT_LEARNING_PROFILE)).toEqual({});
  });
  it("emits one attribute per reading toggle", () => {
    expect(
      readingAttributes({ ...DEFAULT_LEARNING_PROFILE, readingFont: true, largerText: true, extraSpacing: true })
    ).toEqual({ "data-reading-font": "on", "data-larger-text": "on", "data-extra-spacing": "on" });
  });
});
