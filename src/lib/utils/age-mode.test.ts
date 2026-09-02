import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveAgeMode, resolveAge, compareGrades, gradeIndex } from "./age-mode";

describe("deriveAgeMode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'elementary' for ages 10 and under", () => {
    const currentYear = new Date().getFullYear();
    expect(deriveAgeMode(currentYear - 6)).toBe("elementary");
    expect(deriveAgeMode(currentYear - 10)).toBe("elementary");
  });

  it("returns 'middle' for ages 11-14", () => {
    const currentYear = new Date().getFullYear();
    expect(deriveAgeMode(currentYear - 11)).toBe("middle");
    expect(deriveAgeMode(currentYear - 14)).toBe("middle");
  });

  it("returns 'high' for ages 15 and above", () => {
    const currentYear = new Date().getFullYear();
    expect(deriveAgeMode(currentYear - 15)).toBe("high");
    expect(deriveAgeMode(currentYear - 18)).toBe("high");
  });
});

describe("gradeIndex", () => {
  it("places kindergarten before first grade", () => {
    expect(gradeIndex("K")).toBe(0);
    expect(gradeIndex("1")).toBe(1);
  });
});

describe("compareGrades", () => {
  it("orders K below 1", () => {
    expect(compareGrades("K", "1")).toBeLessThan(0);
  });
  it("orders numerically, not as strings", () => {
    expect(compareGrades("3", "10")).toBeLessThan(0);
    expect(compareGrades("10", "9")).toBeGreaterThan(0);
  });
  it("returns 0 for the same grade", () => {
    expect(compareGrades("7", "7")).toBe(0);
  });
});

describe("resolveAge", () => {
  it("prefers grade and derives its age band", () => {
    expect(resolveAge(undefined, "4")).toEqual({ birthYear: null, grade: "4", ageMode: "elementary" });
  });
  it("falls back to birth year", () => {
    const year = new Date().getFullYear() - 16;
    expect(resolveAge(year, undefined)).toEqual({ birthYear: year, grade: null, ageMode: "high" });
  });
  it("rejects an unknown grade", () => {
    expect(() => resolveAge(undefined, "13")).toThrow("valid grade");
  });
  it("requires one of the two", () => {
    expect(() => resolveAge(undefined, undefined)).toThrow("birth year or a grade");
  });
});
