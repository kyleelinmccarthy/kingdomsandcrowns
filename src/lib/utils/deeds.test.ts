import { describe, it, expect } from "vitest";
import { DEEDS, deedsForBuilding, deedStory, findDeed } from "./deeds";
import { BUILDINGS } from "./kingdom";

describe("DEEDS", () => {
  it("has twenty deeds with unique ids and valid buildings", () => {
    expect(DEEDS).toHaveLength(20);
    expect(new Set(DEEDS.map((d) => d.id)).size).toBe(20);
    const buildingIds = new Set(BUILDINGS.map((b) => b.id));
    for (const d of DEEDS) {
      expect(buildingIds.has(d.buildingId)).toBe(true);
      expect(d.questionCount).toBe(8);
      expect(d.story.length).toBeGreaterThan(20);
    }
  });
  it("gives every building at least two deeds and uses every area at least twice", () => {
    for (const b of BUILDINGS) expect(deedsForBuilding(b.id).length).toBeGreaterThanOrEqual(2);
    for (const area of ["math", "reading", "language", "science"]) {
      expect(DEEDS.filter((d) => d.area === area).length).toBeGreaterThanOrEqual(2);
    }
  });
  it("picks the tone variant only when one exists", () => {
    const withMonsters = DEEDS.find((d) => d.monsterStory)!;
    expect(deedStory(withMonsters, "monsters")).toBe(withMonsters.monsterStory);
    expect(deedStory(withMonsters, "gentle")).toBe(withMonsters.story);
    const plain = DEEDS.find((d) => !d.monsterStory)!;
    expect(deedStory(plain, "monsters")).toBe(plain.story);
    expect(findDeed("nope")).toBeNull();
  });
});
