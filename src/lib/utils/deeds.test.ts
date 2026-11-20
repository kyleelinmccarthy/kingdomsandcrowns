import { describe, it, expect } from "vitest";
import { DEEDS, SIDE_QUEST_QUESTIONS, deedRunLength, deedsForBuilding, deedStory, findDeed } from "./deeds";
import type { TaskKind } from "@/lib/tasks/types";
import { BUILDINGS } from "./kingdom";
import { AREA_LABELS } from "./skills";
import { TASK_KINDS } from "@/lib/tasks/registry";

describe("DEEDS", () => {
  it("has twenty deeds with unique ids and valid buildings", () => {
    expect(DEEDS).toHaveLength(20);
    expect(new Set(DEEDS.map((d) => d.id)).size).toBe(20);
    const buildingIds = new Set(BUILDINGS.map((b) => b.id));
    for (const d of DEEDS) {
      expect(buildingIds.has(d.buildingId)).toBe(true);
      expect(d.story.length).toBeGreaterThan(20);
    }
  });
  it("asks a science side quest's four sorts, and every other side quest's eight (RF-j)", () => {
    expect(SIDE_QUEST_QUESTIONS).toBe(8);
    for (const d of DEEDS) expect(d.questionCount, d.id).toBe(d.area === "science" ? 4 : SIDE_QUEST_QUESTIONS);
  });
  it("names a mechanic for every deed, and it is a registered task kind", () => {
    for (const d of DEEDS) expect(Object.keys(TASK_KINDS)).toContain(d.mechanic);
  });
  it("gives every building at least two deeds and uses every area at least twice", () => {
    for (const b of BUILDINGS) expect(deedsForBuilding(b.id).length).toBeGreaterThanOrEqual(2);
    // `logic` is exempt by name: the owner decided logic is practised on locks and Puzzle
    // practice, never on side quests, so no deed is ever written for it.
    expect(DEEDS.filter((d) => (d.area as string) === "logic")).toEqual([]);
    // Every area but logic, derived, so a future area with no deeds fails here.
    for (const area of Object.keys(AREA_LABELS).filter((a) => a !== "logic")) {
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

describe("deedRunLength: how many tasks a run of a side quest asks (RF-j)", () => {
  const ON = new Set<TaskKind>(["measure", "lock"]);
  const science = findDeed("well-water")!;
  it("is the grown-up's length for every eight-task side quest, whatever is switched on", () => {
    for (const d of DEEDS.filter((x) => x.questionCount === SIDE_QUEST_QUESTIONS)) {
      for (const length of [4, 8, 12]) {
        expect(deedRunLength(d, length, ON)).toBe(length);
        expect(deedRunLength(d, length, new Set())).toBe(length);
      }
    }
  });
  it("scales a science side quest played on locks by its share of eight: half the grown-up's length", () => {
    expect(deedRunLength(science, 8, ON)).toBe(4);
    expect(deedRunLength(science, 12, ON)).toBe(6);
    expect(deedRunLength(science, 4, ON)).toBe(2);
    expect(deedRunLength(science, 5, ON)).toBe(3);
  });
  it("keeps the grown-up's whole length when the science side quest is played as multiple choice (locks off, or the gate)", () => {
    expect(deedRunLength(science, 8, new Set<TaskKind>(["measure"]))).toBe(8);
    expect(deedRunLength(science, 12, new Set())).toBe(12);
  });
});
