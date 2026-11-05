import { describe, expect, it } from "vitest";
import {
  CHALLENGE,
  RUN_EFFECTS,
  SCORING,
  countsTowardBuilding,
  isGilded,
  runPoints,
  starsFor,
  type QuestionOutcome,
} from "./deed-scoring";

describe("runPoints", () => {
  it("scores first tries 2, second tries 1, misses 0", () => {
    expect(runPoints(["first", "second", "miss"])).toEqual({ points: 3, max: 6 });
  });
  it("an empty run has nothing to earn", () => {
    expect(runPoints([])).toEqual({ points: 0, max: 0 });
  });
});

describe("starsFor", () => {
  it("uses >= against each threshold (max 16)", () => {
    expect(starsFor(5, 16)).toBe(0);
    expect(starsFor(6, 16)).toBe(1);
    expect(starsFor(11, 16)).toBe(2);
    expect(starsFor(14, 16)).toBe(2);
    expect(starsFor(15, 16)).toBe(3);
    expect(starsFor(16, 16)).toBe(3);
  });
  it("a run with no points to earn is 0 stars", () => {
    expect(starsFor(0, 0)).toBe(0);
    expect(starsFor(3, -1)).toBe(0);
  });
  it("every all-first run of 4-12 questions is 3 stars", () => {
    for (let n = 4; n <= 12; n++) {
      const o: QuestionOutcome[] = Array(n).fill("first");
      const { points, max } = runPoints(o);
      expect(starsFor(points, max)).toBe(3);
    }
  });
  it("an all-second-try run of 8 is exactly 1 star", () => {
    const { points, max } = runPoints(Array<QuestionOutcome>(8).fill("second"));
    expect(starsFor(points, max)).toBe(1);
  });
});

describe("countsTowardBuilding", () => {
  it("needs at least starsToBuild stars", () => {
    expect(SCORING.starsToBuild).toBe(1);
    expect(countsTowardBuilding(0)).toBe(false);
    expect(countsTowardBuilding(1)).toBe(true);
  });
});

describe("isGilded", () => {
  it("is gilded only when every star is earned", () => {
    expect(isGilded({ stars: 9, maxStars: 9 })).toBe(true);
    expect(isGilded({ stars: 8, maxStars: 9 })).toBe(false);
    expect(isGilded({ stars: 0, maxStars: 0 })).toBe(false);
  });
});

describe("run kinds", () => {
  it("a challenge changes nothing but the crown", () => {
    expect(Object.values(RUN_EFFECTS.challenge).every((v) => v === false)).toBe(true);
  });
  it("a deed does everything", () => {
    expect(Object.values(RUN_EFFECTS.deed).every((v) => v === true)).toBe(true);
  });
  it("pins the challenge shape", () => {
    expect(CHALLENGE).toEqual({ questions: 3, levelBoost: 1 });
  });
});
