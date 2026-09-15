import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEARNING_PROFILE,
  LEARNING_PRESETS,
  applyPreset,
  profileFromRow,
  readingAttributes,
  validateProfilePatch,
} from "./learning-profile";

const ROW: Record<keyof typeof DEFAULT_LEARNING_PROFILE, unknown> & {
  mathOffset: number;
  readingOffset: number;
  languageOffset: number;
  scienceOffset: number;
} = {
  ...DEFAULT_LEARNING_PROFILE,
  mathOffset: 0,
  readingOffset: 0,
  languageOffset: 0,
  scienceOffset: 0,
};

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
  it("starts every strand at grade level", () => {
    expect(DEFAULT_LEARNING_PROFILE.subjectOffsets).toEqual({ math: 0, reading: 0, language: 0, science: 0 });
  });
  it("reads the offsets off a row", () => {
    const row = { ...ROW, mathOffset: 1, readingOffset: -2, languageOffset: 0, scienceOffset: 3 };
    expect(profileFromRow(row).subjectOffsets).toEqual({ math: 1, reading: -2, language: 0, science: 3 });
  });
  it("falls back to grade level for a corrupt or missing offset", () => {
    const row = { ...ROW, mathOffset: null as unknown as number, readingOffset: 1.5 };
    expect(profileFromRow(row).subjectOffsets.math).toBe(0);
    expect(profileFromRow(row).subjectOffsets.reading).toBe(0);
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
