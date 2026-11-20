import { describe, expect, it } from "vitest";
import { CONTENT_BANDS, type ContentBand } from "./content-bands";
import {
  TOWER_FLOOR_SOLVED, TOWER_HOLDS, TOWER_HOLDS_LINE, TOWER_LABEL, TOWER_STORY, TOWER_TITLE, TOWER_VERB, TOWER_WAITING, towerFloorLine, towerFloorName,
} from "./world-lock-copy";

/** No child-facing grade or band label anywhere in Part G (R-G5, owner). */
const GRADE_WORDS = /grade|kindergarten|band|\bk1\b|g23|g45|g68|g912|behind|ahead/i;

const floor = (solved: number, open = true) => ({ band: "g23" as ContentBand, open, solved });

describe("the Puzzle Tower's copy", () => {
  it("has the brief's words, exactly", () => {
    expect(TOWER_VERB).toBe("Climb");
    expect(TOWER_LABEL).toBe("the Puzzle Tower");
    expect(TOWER_TITLE).toBe("The Puzzle Tower");
    expect(TOWER_STORY).toBe("A bonus puzzle, just for the joy of it.");
    expect(TOWER_FLOOR_SOLVED).toBe("Floor solved!");
    expect(TOWER_HOLDS).toBe("The puzzle holds.");
    expect(TOWER_HOLDS_LINE).toBe("Every climb makes you sharper.");
  });

  it("says a waiting floor's line exactly, whatever the count", () => {
    expect(TOWER_WAITING).toBe("Earn 3 stars on a science side quest to open this floor.");
    expect(towerFloorLine(floor(0, false), true)).toBe(TOWER_WAITING);
    expect(towerFloorLine(floor(0, false), false)).toBe(TOWER_WAITING);
    expect(towerFloorLine(floor(5, false), true)).toBe(TOWER_WAITING);
  });

  it("says the three open lines", () => {
    expect(towerFloorLine(floor(3), true)).toBe("3 solved here.");
    expect(towerFloorLine(floor(1), true)).toBe("1 solved here.");
    expect(towerFloorLine(floor(3), false)).toBe("You've solved puzzles here.");
    expect(towerFloorLine(floor(0), true)).toBe("A new puzzle waits.");
    expect(towerFloorLine(floor(0), false)).toBe("A new puzzle waits.");
  });

  it("names floors by position, first to fifth", () => {
    expect([0, 1, 2, 3, 4].map(towerFloorName)).toEqual(["The first floor", "The second floor", "The third floor", "The fourth floor", "The fifth floor"]);
    expect(towerFloorName(2)).toBe("The third floor");
  });

  it("names a floor for every band, one each", () => {
    const names = CONTENT_BANDS.map((_, i) => towerFloorName(i));
    expect(new Set(names).size).toBe(CONTENT_BANDS.length);
  });

  it("never names a grade or a band, in any line a child can read", () => {
    const lines = [TOWER_VERB, TOWER_LABEL, TOWER_TITLE, TOWER_STORY, TOWER_FLOOR_SOLVED, TOWER_HOLDS, TOWER_HOLDS_LINE, TOWER_WAITING];
    for (const i of CONTENT_BANDS.keys()) {
      lines.push(towerFloorName(i));
      for (const numerals of [true, false]) for (const solved of [0, 4]) for (const open of [true, false]) lines.push(towerFloorLine({ open, solved }, numerals));
    }
    for (const line of lines) expect(line, line).not.toMatch(GRADE_WORDS);
  });
});
