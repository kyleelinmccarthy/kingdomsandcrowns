import { describe, it, expect } from "vitest";
import { BUILDINGS, buildingProgress, findBuilding } from "./kingdom";
import { deedsForBuilding } from "./deeds";

describe("BUILDINGS", () => {
  it("has eight buildings with unique ids", () => {
    expect(BUILDINGS).toHaveLength(8);
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(8);
  });

  // D13.1: an explicit number per building, guarded here. A new story fails this test on
  // purpose: its author raises the number deliberately, and `raised` keeps built walls standing.
  it("needs each of a building's stories once: its count is the number of its stories", () => {
    for (const b of BUILDINGS) expect(b.deedsToBuild, b.id).toBe(deedsForBuilding(b.id).length);
    expect(Object.fromEntries(BUILDINGS.map((b) => [b.id, b.deedsToBuild]))).toEqual({
      well: 3, mill: 3, bridge: 2, chapel: 3, market: 2, library: 3, watchtower: 2, garden: 2,
    });
  });
});

describe("buildingProgress", () => {
  const well = findBuilding("well")!;

  it("counts distinct stories done, never runs", () => {
    expect(buildingProgress({ distinctDone: 2, runsDone: 9, raised: false }, well)).toEqual({ done: 2, total: 3, complete: false });
    expect(buildingProgress({ distinctDone: 3, runsDone: 3, raised: false }, well)).toEqual({ done: 3, total: 3, complete: true });
    expect(buildingProgress({ distinctDone: 0, runsDone: 0, raised: false }, well)).toEqual({ done: 0, total: 3, complete: false });
    expect(findBuilding("moat")).toBeNull();
  });

  it("replaying one story five times does not raise a three-story building", () => {
    expect(buildingProgress({ distinctDone: 1, runsDone: 5, raised: false }, well).complete).toBe(false);
  });

  it("a raised building stays complete, whatever the count says (a story added later)", () => {
    const moreStories = { ...well, deedsToBuild: 4 };
    expect(buildingProgress({ distinctDone: 3, runsDone: 3, raised: true }, moreStories)).toEqual({ done: 4, total: 4, complete: true });
    expect(buildingProgress({ distinctDone: 0, runsDone: 0, raised: true }, well)).toEqual({ done: 3, total: 3, complete: true });
  });

  it("clamps a count past the total", () => {
    expect(buildingProgress({ distinctDone: 7, runsDone: 7, raised: false }, well)).toEqual({ done: 3, total: 3, complete: true });
  });
});
