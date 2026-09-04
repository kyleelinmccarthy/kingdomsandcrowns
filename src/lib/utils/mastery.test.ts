import { describe, it, expect } from "vitest";
import { recordResult, masteryLabel, masteryChangeCopy, parseRecentResults, MASTERY_MAX } from "./mastery";

function run(state: { level: number; recentResults: boolean[] }, results: boolean[]) {
  return results.reduce((s, r) => recordResult(s, r), state);
}

describe("recordResult", () => {
  it("steps up after seven of the last eight are right and clears history", () => {
    const s = run({ level: 1, recentResults: [] }, [true, true, true, false, true, true, true, true]);
    expect(s.level).toBe(2);
    expect(s.recentResults).toEqual([]);
  });
  it("does not step up on six of eight", () => {
    const s = run({ level: 1, recentResults: [] }, [true, true, false, false, true, true, true, true]);
    expect(s.level).toBe(1);
    expect(s.recentResults).toHaveLength(8);
  });
  it("steps down after three of the last six are wrong and clears history", () => {
    const s = run({ level: 2, recentResults: [] }, [true, false, true, false, true, false]);
    expect(s.level).toBe(1);
    expect(s.recentResults).toEqual([]);
  });
  it("clamps at 0 and at MASTERY_MAX", () => {
    expect(run({ level: 0, recentResults: [] }, [false, false, false]).level).toBe(0);
    expect(run({ level: MASTERY_MAX, recentResults: [] }, Array(8).fill(true)).level).toBe(MASTERY_MAX);
  });
  it("keeps at most ten results", () => {
    const s = run({ level: 0, recentResults: [] }, [true, false, true, false, true, false, true, false, true, false, true, false]);
    expect(s.recentResults.length).toBeLessThanOrEqual(10);
  });
});

describe("copy", () => {
  it("labels every level", () => {
    expect([0, 1, 2, 3, 4].map(masteryLabel)).toEqual(["Just starting", "Warming up", "Getting stronger", "Nearly there", "Mastered"]);
  });
  it("describes a change and stays quiet otherwise", () => {
    expect(masteryChangeCopy(1, 2, "Addition within 20")).toBe("Addition within 20: getting stronger");
    expect(masteryChangeCopy(2, 1, "Spelling")).toBe("Spelling: we'll practice this more");
    expect(masteryChangeCopy(2, 2, "Spelling")).toBeNull();
  });
});

describe("parseRecentResults", () => {
  it("tolerates bad input", () => {
    expect(parseRecentResults(null)).toEqual([]);
    expect(parseRecentResults("nope")).toEqual([]);
    expect(parseRecentResults("[true,false]")).toEqual([true, false]);
  });
});
