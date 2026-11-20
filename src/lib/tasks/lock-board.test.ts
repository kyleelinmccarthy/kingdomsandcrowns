import { describe, expect, it } from "vitest";
import { CAGE4, LOGIC3, NONO5, PATTERN, SHAPES3, SORT1, BALANCE } from "@/test/lock-stubs";
import { toClientTask } from "./registry";
import type { LockView } from "./lock-rules";
import {
  blankBoard, boardFromCells, boardIsFull, cageLayout, cellsFromBoard, cycleValue, familyOf, gridSide, markedLines, responseOf,
} from "./lock-board";

const viewOf = (t: Parameters<typeof toClientTask>[0]) => (toClientTask(t) as { view: LockView }).view;

describe("the board a lock's face edits", () => {
  it("sorts every puzzle into its surface family", () => {
    expect(["shapes3", "cage4", "cage5"].map((p) => familyOf(p as never))).toEqual(["grid", "grid", "grid"]);
    expect(familyOf("nono5")).toBe("nonogram");
    expect([familyOf("logic3"), familyOf("logic4")]).toEqual(["logic", "logic"]);
    expect(familyOf("pattern")).toBe("pattern");
    expect(familyOf("balance")).toBe("balance");
    expect(["sort1", "sort2", "sort"].map((p) => familyOf(p as never))).toEqual(["sort", "sort", "sort"]);
  });

  it("opens blank, with a grid's givens already in place", () => {
    expect(blankBoard(viewOf(SHAPES3))).toEqual(SHAPES3.givens);
    expect(blankBoard(viewOf(PATTERN))).toEqual([0, 0]);
    expect(blankBoard(viewOf(BALANCE))).toEqual([0, 0, 0, 0, 0]);
    // A logic grid's board is the whole person × item table.
    expect(blankBoard(viewOf(LOGIC3))).toHaveLength(9);
    expect(blankBoard(viewOf(NONO5))).toHaveLength(25);
  });

  it("cycles a value through blank, 1..max and back to blank", () => {
    expect([0, 1, 2, 3].map((x) => cycleValue(x, 3))).toEqual([1, 2, 3, 0]);
  });

  it("reads a logic grid's response from its ticks: one per person, or 0 when a row has none or several", () => {
    const v = viewOf(LOGIC3);
    // Ana ✓ col 1; Ben ✓ col 0 and ✗ col 2; Cy two ticks.
    const board = [0, 1, 0, 1, 0, 2, 1, 1, 0];
    expect(cellsFromBoard(v, board)).toEqual([2, 1, 0]);
    expect(boardFromCells(v, [2, 1, 3])).toEqual([0, 1, 0, 1, 0, 0, 0, 0, 1]);
    expect(cellsFromBoard(v, boardFromCells(v, [2, 1, 3]))).toEqual([2, 1, 3]);
  });

  it("is full only when every place is answered (a nonogram: every row's run total reached; a balance: a stone on the pan)", () => {
    expect(boardIsFull(viewOf(SHAPES3), SHAPES3.givens)).toBe(false);
    expect(boardIsFull(viewOf(SHAPES3), SHAPES3.solution.cells)).toBe(true);
    expect(boardIsFull(viewOf(BALANCE), [0, 0, 0, 0, 0])).toBe(false);
    expect(boardIsFull(viewOf(BALANCE), [0, 1, 0, 0, 0])).toBe(true);
    expect(boardIsFull(viewOf(NONO5), NONO5.solution.cells.map(() => 2))).toBe(false);
    expect(boardIsFull(viewOf(NONO5), NONO5.solution.cells)).toBe(true);
    expect(boardIsFull(viewOf(LOGIC3), [0, 1, 0, 1, 0, 0, 1, 1, 0])).toBe(false);
    expect(boardIsFull(viewOf(LOGIC3), boardFromCells(viewOf(LOGIC3), LOGIC3.solution.cells))).toBe(true);
    expect(boardIsFull(viewOf(SORT1), [1, 2, 0, 2])).toBe(false);
    expect(boardIsFull(viewOf(SORT1), [1, 2, 1, 2])).toBe(true);
  });

  it("hands back a response in the puzzle's own form", () => {
    expect(responseOf(viewOf(LOGIC3), boardFromCells(viewOf(LOGIC3), [2, 1, 3]))).toEqual({ puzzle: "logic3", cells: [2, 1, 3] });
    expect(responseOf(viewOf(PATTERN), [3, 3])).toEqual({ puzzle: "pattern", cells: [3, 3] });
  });

  it("outlines each cage and labels it in its top-left square", () => {
    const v = viewOf(CAGE4) as Extract<LockView, { puzzle: "cage4" }>;
    expect(gridSide(v)).toBe(4);
    const layout = cageLayout(v.cages, 4);
    // Cage 0 is squares 0 and 1 ("3+"): a wall between them would split it.
    expect(layout[0]).toMatchObject({ cage: 0, label: "3+", top: true, left: true, right: false, bottom: true });
    expect(layout[1]).toMatchObject({ cage: 0, label: null, right: true });
    v.cages.forEach((_, k) => expect(layout.filter((x) => x.label !== null && x.cage === k)).toHaveLength(1));
    expect(cageLayout([{ cells: [5, 6], op: "-", target: 1 }, { cells: [0], op: "=", target: 4 }], 4).filter((x) => x.label).map((x) => x.label)).toEqual(["4", "1−"]);
  });

  it("names the lines a broken rule marks", () => {
    const marks = new Set(["row:1", "col:2", "cage:3", "clue:0"]);
    expect(markedLines(marks)).toEqual({ rows: new Set([1]), cols: new Set([2]), cages: new Set([3]), clues: new Set([0]), blanks: new Set(), sum: false });
  });
});
