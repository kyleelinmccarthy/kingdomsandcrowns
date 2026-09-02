import { describe, it, expect } from "vitest";
import { levelFromXp, XP_PER_LEVEL } from "./level";

describe("levelFromXp", () => {
  it("starts at level 1 with no XP", () => {
    expect(levelFromXp(0)).toBe(1);
  });
  it("stays on level 1 just below the threshold", () => {
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1);
  });
  it("reaches level 2 exactly at the threshold", () => {
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2);
  });
  it("scales linearly (level 50 is the castle unlock)", () => {
    expect(levelFromXp(4900)).toBe(50);
  });
  it("treats negative XP as level 1", () => {
    expect(levelFromXp(-10)).toBe(1);
  });
  it("treats NaN as level 1", () => {
    expect(levelFromXp(Number.NaN)).toBe(1);
  });
});
