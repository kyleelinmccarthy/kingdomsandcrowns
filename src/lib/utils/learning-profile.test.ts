import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEARNING_PROFILE,
  LEARNING_PRESETS,
  applyPreset,
  profileFromRow,
  readingAttributes,
  validateProfilePatch,
  validateSubjectOffset,
  SUBJECT_AREAS,
  SUBJECT_OFFSET_COLUMN,
} from "./learning-profile";
import { GRADES, effectiveGrade } from "./grade-levels";

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

describe("SUBJECT_OFFSET_COLUMN", () => {
  it("gives each strand its OWN column, and no two strands the same one", () => {
    // Injective, and each entry the column for its own area. A cross-wired map is silent
    // at every other layer: setting Reading would write the Math column, so the strand a
    // grown-up touched would snap back while a strand they never touched moved a year.
    const columns = SUBJECT_AREAS.map((area) => SUBJECT_OFFSET_COLUMN[area]);
    expect(columns).toHaveLength(4);
    expect(new Set(columns).size).toBe(4);
    for (const area of SUBJECT_AREAS) {
      expect(SUBJECT_OFFSET_COLUMN[area]).toBe(`${area}Offset`);
    }
  });

  it("covers every strand a gap can be set on", () => {
    expect(SUBJECT_AREAS).toEqual(["math", "reading", "language", "science"]);
    expect(Object.keys(SUBJECT_OFFSET_COLUMN).sort()).toEqual([...SUBJECT_AREAS].sort());
  });
});

describe("validateSubjectOffset", () => {
  it("returns the strand's own column and the gap untouched", () => {
    expect(validateSubjectOffset("reading", -2)).toEqual({ column: "readingOffset", offset: -2 });
    expect(validateSubjectOffset("math", 3)).toEqual({ column: "mathOffset", offset: 3 });
    expect(validateSubjectOffset("science", 0)).toEqual({ column: "scienceOffset", offset: 0 });
  });

  it("refuses an out-of-range gap outright, and NEVER clamps it into one", () => {
    // Clamping at write time is the bug: it rewrites what the grown-up asked for. Only
    // `gradeAt` clamps, at read time, so a far-out gap comes back into range on its own
    // when the child is promoted. A gap clamped to the ladder's end at write time would
    // strand a child there — the promotion would have nothing left to lift.
    expect(() => validateSubjectOffset("math", -20)).toThrow(/doesn't look right/i);
    expect(() => validateSubjectOffset("math", 20)).toThrow(/doesn't look right/i);
    // The read-time clamp is still what keeps a legal-but-large gap safe on the page.
    expect(effectiveGrade("1", validateSubjectOffset("math", -GRADES.length).offset)).toBe("K");
  });

  it("refuses a gap that is not a whole number of grades", () => {
    expect(() => validateSubjectOffset("math", 1.5)).toThrow(/doesn't look right/i);
    expect(() => validateSubjectOffset("math", NaN)).toThrow(/doesn't look right/i);
    expect(() => validateSubjectOffset("math", Infinity)).toThrow(/doesn't look right/i);
  });

  it("refuses a strand that is not one of the four", () => {
    expect(() => validateSubjectOffset("history", 1)).toThrow(/subject doesn't look right/i);
    expect(() => validateSubjectOffset("mathOffset", 1)).toThrow(/subject doesn't look right/i);
  });
});
