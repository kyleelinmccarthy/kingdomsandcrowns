import { describe, expect, it } from "vitest";
import { BALANCE, CAGE4, LOGIC3, NONO5, PATTERN, SHAPES3, SORT, SORT1, SORT2 } from "@/test/lock-stubs";
import { LOCK_PUZZLES, checkLock, lockSize, responseFits, sortBroken, type LockResponse, type LockView } from "./lock-rules";

// A task holds its view's fields (and, for a sort, its `fits` besides); the rules read the view's only.
const view = (t: LockView) => t;
const r = <P extends LockResponse["puzzle"]>(puzzle: P, cells: number[]) => ({ puzzle, cells }) as LockResponse;

describe("lock puzzles and their sizes", () => {
  it("names the eleven puzzles of R-F4", () => {
    expect([...LOCK_PUZZLES].sort()).toEqual(["balance", "cage4", "cage5", "logic3", "logic4", "nono5", "pattern", "shapes3", "sort", "sort1", "sort2"]);
  });

  it("sizes each response from the view: one cell per blank, item, weight, person or square", () => {
    expect(lockSize(view(PATTERN))).toEqual({ cells: 2, max: 3 });
    expect(lockSize(view(SORT1))).toEqual({ cells: 4, max: 2 });
    expect(lockSize(view(SORT2))).toEqual({ cells: 4, max: 4 });
    expect(lockSize(view(SORT))).toEqual({ cells: 5, max: 2 });
    expect(lockSize(view(SHAPES3))).toEqual({ cells: 9, max: 3 });
    expect(lockSize(view(BALANCE))).toEqual({ cells: 5, max: 1 });
    expect(lockSize(view(CAGE4))).toEqual({ cells: 16, max: 4 });
    expect(lockSize({ puzzle: "cage5", cages: [] })).toEqual({ cells: 25, max: 5 });
    expect(lockSize(view(NONO5))).toEqual({ cells: 25, max: 2 });
    expect(lockSize(view(LOGIC3))).toEqual({ cells: 3, max: 3 });
    expect(lockSize({ puzzle: "logic4", rows: ["a", "b", "c", "d"], cols: ["w", "x", "y", "z"], clues: [] })).toEqual({ cells: 4, max: 4 });
  });

  it("a response fits only its own puzzle, at its size, in range, with the givens kept", () => {
    expect(responseFits(view(SHAPES3), SHAPES3.solution)).toBe(true);
    expect(responseFits(view(SHAPES3), r("cage4", SHAPES3.solution.cells))).toBe(false);
    expect(responseFits(view(SHAPES3), r("shapes3", [1, 2, 3, 2, 3, 1, 3, 1]))).toBe(false);
    expect(responseFits(view(SHAPES3), r("shapes3", [1, 2, 3, 2, 3, 1, 3, 1, 4]))).toBe(false);
    expect(responseFits(view(SHAPES3), r("shapes3", [1, 2, 3, 2, 3, 1, 3, 1, 1.5]))).toBe(false);
    // The given 1 in the corner may not be changed, even to another valid board.
    expect(responseFits(view(SHAPES3), r("shapes3", [2, 1, 3, 1, 3, 2, 3, 2, 1]))).toBe(false);
  });
});

describe("checkLock: what the visible puzzle can judge (R-F3)", () => {
  it("a broken or malformed response is named as such, never as right", () => {
    expect(checkLock(view(CAGE4), r("cage4", [1, 2]))).toEqual({ ok: false, broken: ["response"], empty: 0 });
    expect(checkLock(view(CAGE4), r("pattern", [1, 1]))).toEqual({ ok: false, broken: ["response"], empty: 0 });
  });

  describe("pattern: the blanks continue the repeat", () => {
    it("takes the stored fill and any other that keeps the repeat", () => {
      expect(checkLock(view(PATTERN), PATTERN.solution)).toEqual({ ok: true, broken: [], empty: 0 });
      expect(checkLock(view(PATTERN), r("pattern", [1, 1])).ok).toBe(true);
      expect(checkLock(view(PATTERN), r("pattern", [2, 2])).ok).toBe(true);
    });
    it("marks the blanks that break it, and counts the ones left open", () => {
      expect(checkLock(view(PATTERN), r("pattern", [3, 1]))).toEqual({ ok: false, broken: ["blank:0", "blank:1"], empty: 0 });
      expect(checkLock(view(PATTERN), r("pattern", [3, 0]))).toEqual({ ok: false, broken: [], empty: 1 });
    });
    it("judges a blank against the givens: A B A B _ wants A", () => {
      const v: LockView = { puzzle: "pattern", sequence: [PATTERN.tray[0], PATTERN.tray[1], PATTERN.tray[0], PATTERN.tray[1], null], tray: PATTERN.tray };
      expect(checkLock(v, r("pattern", [1])).ok).toBe(true);
      expect(checkLock(v, r("pattern", [2]))).toEqual({ ok: false, broken: ["blank:0"], empty: 0 });
      expect(checkLock(v, r("pattern", [3]))).toEqual({ ok: false, broken: ["blank:0"], empty: 0 });
    });
    it("reads a repeat shown only once and begun again: A B C A _ wants B", () => {
      const [a, b, c] = PATTERN.tray;
      const v: LockView = { puzzle: "pattern", sequence: [a, b, c, a, null], tray: PATTERN.tray };
      expect(checkLock(v, r("pattern", [2])).ok).toBe(true);
      expect(checkLock(v, r("pattern", [3])).broken).toEqual(["blank:0"]);
    });
    it("the shortest repeat wins: A _ A _ wants A in both", () => {
      const [a] = PATTERN.tray;
      const v: LockView = { puzzle: "pattern", sequence: [a, null, a, null], tray: PATTERN.tray };
      expect(checkLock(v, r("pattern", [1, 1])).ok).toBe(true);
      expect(checkLock(v, r("pattern", [2, 2])).broken).toEqual(["blank:0", "blank:1"]);
    });
    it("a sequence with no repeat at all is a broken puzzle, never right", () => {
      const v: LockView = { puzzle: "pattern", sequence: [null], tray: PATTERN.tray };
      expect(checkLock(v, r("pattern", [1]))).toEqual({ ok: false, broken: ["repeat"], empty: 0 });
    });
  });

  describe("shapes3: each shape once in every row and column", () => {
    it("takes both valid boards", () => {
      expect(checkLock(view(SHAPES3), SHAPES3.solution)).toEqual({ ok: true, broken: [], empty: 0 });
      expect(checkLock(view(SHAPES3), r("shapes3", [1, 3, 2, 3, 2, 1, 2, 1, 3])).ok).toBe(true);
    });
    it("marks a repeated shape's row and column, and counts the empty squares", () => {
      expect(checkLock(view(SHAPES3), r("shapes3", [1, 2, 3, 2, 3, 1, 3, 1, 3]))).toEqual({ ok: false, broken: ["row:2", "col:2"], empty: 0 });
      expect(checkLock(view(SHAPES3), r("shapes3", [1, 2, 2, 3, 0, 1, 0, 1, 0]))).toEqual({ ok: false, broken: ["row:0"], empty: 3 });
    });
  });

  describe("cage4: rows, columns and each cage's target", () => {
    it("takes the solved board", () => {
      expect(checkLock(view(CAGE4), CAGE4.solution)).toEqual({ ok: true, broken: [], empty: 0 });
    });
    it("marks the cages a valid square misses", () => {
      const swapped = [1, 2, 3, 4, 3, 4, 1, 2, 4, 3, 2, 1, 2, 1, 4, 3];
      expect(checkLock(view(CAGE4), r("cage4", swapped))).toEqual({ ok: false, broken: ["cage:4", "cage:5", "cage:6"], empty: 0 });
    });
    it("marks a repeat's row, column and cage together", () => {
      const cells = [...CAGE4.solution.cells];
      cells[0] = 2;
      expect(checkLock(view(CAGE4), r("cage4", cells))).toEqual({ ok: false, broken: ["row:0", "col:0", "cage:0"], empty: 0 });
    });
    it("leaves an unfinished cage unjudged and counts the gap", () => {
      const cells = [...CAGE4.solution.cells];
      cells[0] = 0;
      expect(checkLock(view(CAGE4), r("cage4", cells))).toEqual({ ok: false, broken: [], empty: 1 });
    });
    it("reads every operation, in either order for - and ÷", () => {
      const v: LockView = {
        puzzle: "cage4",
        cages: [
          { cells: [0], op: "=", target: 2 },
          { cells: [1, 2], op: "÷", target: 2 },
          { cells: [3, 7], op: "-", target: 3 },
          { cells: [4, 5, 6], op: "×", target: 12 },
          { cells: [8, 9, 12, 13], op: "+", target: 10 },
          { cells: [10, 11, 14, 15], op: "+", target: 10 },
        ],
      };
      // Not a Latin square (only the cages are read here): = 2; 1 ÷ 2 the small way round; 1 - 4 likewise;
      // 3 × 4 × 1; 1 + 2 + 3 + 3 is 9, not 10; 1 + 2 + 3 + 4.
      const cells = [2, 1, 2, 1, 3, 4, 1, 4, 1, 2, 1, 2, 3, 3, 3, 4];
      const res = checkLock(v, r("cage4", cells));
      expect(res.broken.filter((id) => id.startsWith("cage:"))).toEqual(["cage:4"]);
    });
  });

  describe("nono5: each row and column run clue", () => {
    it("takes the picture, with blanks left empty or marked", () => {
      expect(checkLock(view(NONO5), NONO5.solution)).toEqual({ ok: true, broken: [], empty: 0 });
      expect(checkLock(view(NONO5), r("nono5", NONO5.solution.cells.map((v) => (v === 1 ? 1 : 2)))).ok).toBe(true);
    });
    it("marks an overfilled row and column", () => {
      const cells = [...NONO5.solution.cells];
      cells[2] = 1;
      expect(checkLock(view(NONO5), r("nono5", cells))).toEqual({ ok: false, broken: ["row:0", "col:2"], empty: 0 });
    });
    it("marks a full row whose runs are wrong", () => {
      const cells = [...NONO5.solution.cells];
      // Row 0 as #.###: four filled, as the clue asks, but the runs are 1 and 3, not 2 and 2.
      cells.splice(0, 5, 1, 0, 1, 1, 1);
      // Column 1 is now short, which is not yet a break; column 2 is over.
      expect(checkLock(view(NONO5), r("nono5", cells))).toEqual({ ok: false, broken: ["row:0", "col:2"], empty: 0 });
    });
    it("counts the squares still to fill, and judges no short line", () => {
      expect(checkLock(view(NONO5), r("nono5", Array(25).fill(0)))).toEqual({ ok: false, broken: [], empty: 12 });
      expect(checkLock(view(NONO5), r("nono5", Array(25).fill(2)))).toEqual({ ok: false, broken: [], empty: 12 });
    });
  });

  describe("logic3: each clue, and each item once", () => {
    it("takes the solution", () => {
      expect(checkLock(view(LOGIC3), LOGIC3.solution)).toEqual({ ok: true, broken: [], empty: 0 });
    });
    it("marks every clue a guess breaks", () => {
      expect(checkLock(view(LOGIC3), r("logic3", [1, 2, 3]))).toEqual({ ok: false, broken: ["clue:0", "clue:1", "clue:2"], empty: 0 });
    });
    it("marks an item given twice", () => {
      expect(checkLock(view(LOGIC3), r("logic3", [2, 1, 2]))).toEqual({ ok: false, broken: ["col:1"], empty: 0 });
    });
    it("an \"is\" clue is broken when someone else takes its item", () => {
      expect(checkLock(view(LOGIC3), r("logic3", [1, 0, 0]))).toEqual({ ok: false, broken: ["clue:0", "clue:1"], empty: 2 });
      expect(checkLock(view(LOGIC3), r("logic3", [0, 1, 0]))).toEqual({ ok: false, broken: [], empty: 2 });
    });
  });

  describe("balance: the pan's sum equals the weight", () => {
    it("takes any set that balances", () => {
      expect(checkLock(view(BALANCE), BALANCE.solution)).toEqual({ ok: true, broken: [], empty: 0 });
      expect(checkLock(view(BALANCE), r("balance", [0, 0, 1, 1, 0])).ok).toBe(true);
      expect(checkLock(view(BALANCE), r("balance", [1, 1, 0, 1, 0])).ok).toBe(true);
    });
    it("marks the sum when it is too light or too heavy, and an empty pan as empty", () => {
      expect(checkLock(view(BALANCE), r("balance", [1, 1, 0, 0, 0]))).toEqual({ ok: false, broken: ["sum"], empty: 0 });
      expect(checkLock(view(BALANCE), r("balance", [1, 1, 1, 1, 1]))).toEqual({ ok: false, broken: ["sum"], empty: 0 });
      expect(checkLock(view(BALANCE), r("balance", [0, 0, 0, 0, 0]))).toEqual({ ok: false, broken: [], empty: 1 });
    });
  });

  describe("sorts: the view cannot see where an item belongs", () => {
    it.each([SORT, SORT1, SORT2])("$puzzle: reports only the unplaced items, never a wrong bin", (t) => {
      const wrong = t.solution.cells.map((v, i) => (i === 0 ? (v === 1 ? 2 : 1) : v));
      expect(checkLock(view(t), t.solution)).toEqual({ ok: true, broken: [], empty: 0 });
      // Only the server, holding `fits`, can fault a placed item (`sortBroken`).
      expect(checkLock(view(t), r(t.puzzle, wrong))).toEqual({ ok: true, broken: [], empty: 0 });
      expect(checkLock(view(t), r(t.puzzle, t.solution.cells.map((v, i) => (i < 2 ? 0 : v))))).toEqual({ ok: false, broken: [], empty: 2 });
    });

    it("sortBroken marks each placed item outside the bins it fits, and takes a frog in either bin", () => {
      expect(sortBroken(SORT.fits, SORT.solution.cells)).toEqual([]);
      expect(sortBroken(SORT.fits, [1, 1, 2, 2, 2])).toEqual([]);
      expect(sortBroken(SORT.fits, [2, 1, 1, 2, 0])).toEqual(["item:0", "item:2"]);
      expect(sortBroken(SORT2.fits, [1, 4, 3, 2])).toEqual(["item:2", "item:3"]);
    });
  });
});
