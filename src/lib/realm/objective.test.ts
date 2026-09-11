import { describe, it, expect } from "vitest";
import { objectiveRank, rankBuildings } from "./objective";
import type { SiteProgress } from "./layout";

// Every building is 5 side quests today; slice 13 lowers the real counts and re-baselines this fixture (spec §3.8).
const site = (id: string, done: number): SiteProgress => ({ id, done, total: 5, complete: done >= 5 });

describe("objectiveRank", () => {
  it("ranks work in progress first, untouched second, finished last", () => {
    expect(objectiveRank({ done: 2, complete: false })).toBe(0);
    expect(objectiveRank({ done: 0, complete: false })).toBe(1);
    expect(objectiveRank({ done: 5, complete: true })).toBe(2);
    // Complete rests at the end however its done count reads.
    expect(objectiveRank({ done: 0, complete: true })).toBe(2);
  });
});

describe("rankBuildings", () => {
  // The eight buildings in six progress states.
  const fixture = [
    site("well", 5), site("mill", 0), site("bridge", 2), site("chapel", 5),
    site("market", 0), site("library", 4), site("watchtower", 1), site("garden", 3),
  ];

  it("reproduces the order deed-picker's local rank produced", () => {
    // deed-picker.tsx:20-22, deleted in this task and re-expressed here so the two can never drift apart.
    const legacyRank = (b: { done: number; complete: boolean }) => (b.complete ? 2 : b.done > 0 ? 0 : 1);
    const legacy = [...fixture].sort((a, b) => legacyRank(a) - legacyRank(b)).map((b) => b.id);
    expect(legacy).toEqual(["bridge", "library", "watchtower", "garden", "mill", "market", "well", "chapel"]);
    expect(rankBuildings(fixture).map((b) => b.id)).toEqual(legacy);
  });

  it("is stable within a rank and never mutates its input", () => {
    const before = fixture.map((b) => b.id);
    const ranked = rankBuildings(fixture);
    expect(ranked).not.toBe(fixture);
    expect(fixture.map((b) => b.id)).toEqual(before);
    // Equal ranks keep input order: library (4 of 5) does not overtake bridge (2 of 5). That tie-break
    // belongs to objectiveState, not here — deed-picker's list order must not change in this task.
    expect(ranked.slice(0, 4).map((b) => b.id)).toEqual(["bridge", "library", "watchtower", "garden"]);
  });
});
