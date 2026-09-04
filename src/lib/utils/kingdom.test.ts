import { describe, it, expect } from "vitest";
import { BUILDINGS, buildingProgress, findBuilding } from "./kingdom";

describe("BUILDINGS", () => {
  it("has eight buildings with unique ids and five deeds each", () => {
    expect(BUILDINGS).toHaveLength(8);
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(8);
    for (const b of BUILDINGS) expect(b.deedsToBuild).toBe(5);
  });
  it("reports progress and completion", () => {
    const well = findBuilding("well")!;
    expect(buildingProgress(2, well)).toEqual({ done: 2, total: 5, complete: false });
    expect(buildingProgress(7, well)).toEqual({ done: 5, total: 5, complete: true });
    expect(findBuilding("moat")).toBeNull();
  });
});
