import { describe, it, expect } from "vitest";
import {
  GRADES, gradeIndex, gradeAt, effectiveGrade, estimateGrade,
  nearestGrades, bandForGrade, gapLabel, NO_OFFSETS,
} from "./grade-levels";

describe("the grade ladder", () => {
  it("runs K through 12 with K at the bottom", () => {
    expect(GRADES).toHaveLength(13); // K plus 1-12
    expect(GRADES[0]).toBe("K");
    expect(GRADES.at(-1)).toBe("12");
    expect(gradeIndex("K")).toBe(0);
    expect(gradeIndex("3")).toBe(3);
    expect(gradeAt(0)).toBe("K");
    expect(gradeAt(6)).toBe("6");
  });

  it("starts every strand at grade level", () => {
    expect(NO_OFFSETS).toEqual({ math: 0, reading: 0, language: 0, science: 0 });
  });
});

describe("effectiveGrade", () => {
  it("is the child's own grade when the offset is zero", () => {
    expect(effectiveGrade("3", 0)).toBe("3");
  });

  it("moves up and down by the gap", () => {
    expect(effectiveGrade("3", 1)).toBe("4");
    expect(effectiveGrade("6", -2)).toBe("4");
  });

  it("clamps at both ends rather than inventing a grade", () => {
    expect(effectiveGrade("1", -5)).toBe("K");
    expect(effectiveGrade("11", 9)).toBe("12");
  });

  it("keeps the gap through a promotion, which is the whole point of storing an offset", () => {
    // Noah at grade 3 with +1 math is doing grade 4. Promote him and he is doing grade 5,
    // with nothing but his grade having changed.
    expect(effectiveGrade("3", 1)).toBe("4");
    expect(effectiveGrade("4", 1)).toBe("5");
  });

  it("brings a clamped offset back into range after a promotion, because the offset itself is never clamped", () => {
    expect(effectiveGrade("K", -2)).toBe("K");
    expect(effectiveGrade("3", -2)).toBe("1");
  });
});

describe("estimateGrade", () => {
  it("estimates age minus five for a child with only a birth year", () => {
    expect(estimateGrade(2018, new Date("2026-09-15"))).toBe("3");
    expect(estimateGrade(2015, new Date("2026-09-15"))).toBe("6");
  });

  it("clamps a very young or very old estimate onto the ladder", () => {
    expect(estimateGrade(2024, new Date("2026-09-15"))).toBe("K");
    expect(estimateGrade(1990, new Date("2026-09-15"))).toBe("12");
  });

  it("has nothing to estimate from without a birth year", () => {
    expect(estimateGrade(null, new Date("2026-09-15"))).toBeNull();
  });
});

describe("nearestGrades", () => {
  it("offers the grade itself, then easier ones nearest first, then harder", () => {
    expect(nearestGrades("2")).toEqual(["2", "1", "K", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  });

  it("covers every grade exactly once, from any starting point", () => {
    for (const g of GRADES) {
      const walk = nearestGrades(g);
      expect(new Set(walk).size).toBe(GRADES.length);
      expect(walk[0]).toBe(g);
    }
  });
});

describe("bandForGrade", () => {
  // Every grade, pinned to its exact band, so a boundary edit anywhere in bandForGrade
  // is caught here rather than passing a merely-truthy check.
  const gradeToBand = [
    ["K", "k1"],
    ["1", "k1"],
    ["2", "g23"],
    ["3", "g23"],
    ["4", "g45"],
    ["5", "g45"],
    ["6", "g68"],
    ["7", "g68"],
    ["8", "g68"],
    ["9", "g912"],
    ["10", "g912"],
    ["11", "g912"],
    ["12", "g912"],
  ] as const;

  it.each(gradeToBand)("maps grade %s onto band %s", (grade, band) => {
    expect(bandForGrade(grade)).toBe(band);
  });

  it("covers every grade, so no grade can fall through", () => {
    expect(gradeToBand).toHaveLength(GRADES.length);
    expect(gradeToBand.map(([g]) => g)).toEqual(GRADES);
  });
});

describe("gapLabel", () => {
  it("names the level and the gap the way a parent reads it", () => {
    expect(gapLabel("3", 0)).toBe("Grade 3 · at grade level");
    expect(gapLabel("3", 1)).toBe("Grade 4 · 1 ahead");
    expect(gapLabel("6", -1)).toBe("Grade 5 · 1 behind");
    expect(gapLabel("6", -2)).toBe("Grade 4 · 2 behind");
  });

  it("says where the ladder ends rather than showing an impossible gap", () => {
    expect(gapLabel("1", -5)).toBe("Grade K · the lowest level");
    expect(gapLabel("11", 9)).toBe("Grade 12 · the highest level");
  });

  it("never uses a word a child must not read about themselves", () => {
    // This label is parent-only. The test pins the vocabulary so a later edit cannot
    // quietly leak it into a child-facing surface with different words.
    expect(gapLabel("3", 0)).not.toMatch(/struggling|remedial|slow/i);
  });
});
