import { describe, it, expect } from "vitest";
import { DEEDS, RUNE_DEED_IDS, RUNE_STOPS, SIDE_QUEST_QUESTIONS, TRAIL_CLUES, TRAIL_DEED_IDS, deedRunLength, deedsForBuilding, deedStory, findDeed } from "./deeds";
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
  it("asks a science side quest's four sorts, a reading side quest's four clues, a language side quest's three runes, and every other side quest's eight (RF-j, R-H10, R-I9)", () => {
    expect(SIDE_QUEST_QUESTIONS).toBe(8);
    expect(TRAIL_CLUES).toBe(4);
    const own = (area: string) => (area === "science" ? 4 : area === "reading" ? TRAIL_CLUES : area === "language" ? 3 : SIDE_QUEST_QUESTIONS);
    for (const d of DEEDS) expect(d.questionCount, d.id).toBe(own(d.area));
  });
  it("names a mechanic for every deed, and it is a registered task kind", () => {
    for (const d of DEEDS) expect(Object.keys(TASK_KINDS)).toContain(d.mechanic);
  });
  it("plays every reading side quest as a trail, and names them in TRAIL_DEED_IDS (R-H9, H7)", () => {
    const reading = DEEDS.filter((d) => d.area === "reading");
    expect(reading.map((d) => d.id)).toEqual(["well-signs", "chapel-scroll", "library-catalog"]);
    for (const d of reading) expect(d.mechanic, d.id).toBe("trail");
    expect([...TRAIL_DEED_IDS]).toEqual(reading.map((d) => d.id));
    // Only reading walks: every other area keeps the mechanic it had.
    for (const d of DEEDS.filter((x) => x.area !== "reading")) expect(d.mechanic, d.id).not.toBe("trail");
    expect(DEEDS.filter((d) => d.mechanic === "trail").map((d) => d.id)).toEqual([...TRAIL_DEED_IDS]);
  });
  it("plays every language side quest as runes, two or three stops, and names them in RUNE_DEED_IDS (R-I14, R-I9)", () => {
    const language = DEEDS.filter((d) => d.area === "language");
    expect(language.map((d) => d.id)).toEqual(["mill-ledger", "bridge-toll", "market-crier", "library-scribe"]);
    expect(RUNE_STOPS).toEqual({ min: 2, max: 3 });
    for (const d of language) {
      expect(d.mechanic, d.id).toBe("rune");
      expect(d.questionCount, d.id).toBe(3);
      expect(d.stops, d.id).toBe(RUNE_STOPS);
    }
    expect([...RUNE_DEED_IDS]).toEqual(language.map((d) => d.id));
    // Only language casts runes, and only language has stops.
    for (const d of DEEDS.filter((x) => x.area !== "language")) {
      expect(d.mechanic, d.id).not.toBe("rune");
      expect(d.stops, d.id).toBeUndefined();
    }
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
  const science = findDeed("well-water")!;
  it("is the grown-up's length for every eight-task side quest, however it is played", () => {
    for (const d of DEEDS.filter((x) => x.questionCount === SIDE_QUEST_QUESTIONS)) {
      for (const length of [4, 8, 12]) {
        expect(deedRunLength(d, length, true)).toBe(length);
        expect(deedRunLength(d, length, false)).toBe(length);
      }
    }
  });
  it("scales a science side quest whose run draws sorts by its share of eight: half the grown-up's length", () => {
    expect(deedRunLength(science, 8, true)).toBe(4);
    expect(deedRunLength(science, 12, true)).toBe(6);
    expect(deedRunLength(science, 4, true)).toBe(2);
    expect(deedRunLength(science, 5, true)).toBe(3);
  });
  it("keeps the grown-up's whole length when the run falls back to multiple choice (locks off, the gate, no sort pool)", () => {
    expect(deedRunLength(science, 8, false)).toBe(8);
    expect(deedRunLength(science, 12, false)).toBe(12);
  });
  it("asks a language side quest that draws runes two or three stops: 2 at length 4, 3 at 8 and at 12 (R-I9)", () => {
    for (const d of DEEDS.filter((x) => x.mechanic === "rune")) {
      expect([4, 8, 12].map((length) => deedRunLength(d, length, true)), d.id).toEqual([2, 3, 3]);
      // The clamp holds at the edges of the grown-up's range too.
      expect(deedRunLength(d, 1, true), d.id).toBe(2);
      expect(deedRunLength(d, 40, true), d.id).toBe(3);
    }
  });
  it("keeps the grown-up's whole length for a language side quest played as multiple choice (runes off, the gate, a focus no rune plays: R-I8)", () => {
    for (const d of DEEDS.filter((x) => x.mechanic === "rune")) {
      for (const length of [4, 8, 12]) expect(deedRunLength(d, length, false), d.id).toBe(length);
    }
  });
  it("leaves every other side quest's lengths as they were", () => {
    // Recorded before the language deeds took stops: each non-language deed at 4, 8 and 12, drawing its mechanic and not.
    const before = (d: (typeof DEEDS)[number], length: number, draws: boolean) =>
      draws ? Math.max(1, Math.round((length * d.questionCount) / SIDE_QUEST_QUESTIONS)) : length;
    for (const d of DEEDS.filter((x) => x.area !== "language")) {
      for (const length of [1, 4, 5, 8, 12]) {
        for (const draws of [true, false]) expect(deedRunLength(d, length, draws), `${d.id} ${length} ${draws}`).toBe(before(d, length, draws));
      }
    }
  });
  it("halves a reading side quest that draws trails, and keeps the whole length when it plays as choice (R-H10, R-H22)", () => {
    const reading = findDeed("well-signs")!;
    expect(deedRunLength(reading, 8, true)).toBe(4);
    expect(deedRunLength(reading, 12, true)).toBe(6);
    expect(deedRunLength(reading, 4, true)).toBe(2);
    for (const length of [4, 8, 12]) expect(deedRunLength(reading, length, false)).toBe(length);
  });
});
