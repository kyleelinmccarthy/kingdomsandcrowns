import { describe, expect, it } from "vitest";
import { aOrAn, capitalAOrAn } from "./copy";

describe("aOrAn", () => {
  it("says 'an' for numbers read aloud with a vowel sound: eight, eleven, eighteen, eighty-x, eight hundred", () => {
    for (const n of ["8", "11", "18", "80", "85", "89", "800", "811", "8.5", "11.5", "18000", "80000", "11000", "8-foot", "18-foot"]) {
      expect(aOrAn(n), n).toBe("an");
    }
  });

  it("says 'a' for every other number", () => {
    for (const n of ["1", "2", "3", "4", "5", "6", "7", "9", "10", "12", "17", "19", "20", "98", "100", "110", "118", "180", "1800", "7-foot", "0.5", "12.5", "45", "7.5-foot"]) {
      expect(aOrAn(n), n).toBe("a");
    }
  });

  it("says 'an' before a vowel sound in a word, and 'a' before a consonant sound", () => {
    for (const w of ["oak", "elm", "iron", "arch", "ell", "hour", "heir"]) expect(aOrAn(w), w).toBe("an");
    for (const w of ["beam", "rope", "unit", "one-foot", "user", "plank", "hall"]) expect(aOrAn(w), w).toBe("a");
  });

  it("capitalises for the start of a sentence", () => {
    expect(capitalAOrAn("8-foot")).toBe("An");
    expect(capitalAOrAn("6-foot")).toBe("A");
  });
});
