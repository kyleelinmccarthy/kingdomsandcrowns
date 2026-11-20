/**
 * Hand-built lock tasks, one per puzzle the slice-4 tests exercise, until the generators (F2, F3)
 * and sort pools (F6) exist. Each has more than one rule where its puzzle has more than one, and a
 * second valid solution wherever the puzzle allows one (`alt`), so tests can pin that a lock is
 * checked against its rules, never against the stored `solution`.
 */
import type { LockResponse, LockShape } from "@/lib/tasks/lock-rules";
import type { LockTask } from "@/lib/tasks/types";

const A: LockShape = { shape: "circle", color: "red" };
const B: LockShape = { shape: "square", color: "blue" };
const C: LockShape = { shape: "triangle", color: "yellow" };

type Stub<P extends LockTask["puzzle"]> = Extract<LockTask, { puzzle: P }>;

const base = (puzzle: string) => ({ kind: "lock" as const, id: `stub:${puzzle}`, skillId: "logic-stub", prompt: `Open the ${puzzle} lock.` });

/** "A B _ A B _": a repeat of three whose third shape is not shown, so any shape fills it, as long as both blanks agree. */
export const PATTERN: Stub<"pattern"> = {
  ...base("pattern"), puzzle: "pattern",
  sequence: [A, B, null, A, B, null], tray: [A, B, C],
  solution: { puzzle: "pattern", cells: [3, 3] },
};
export const PATTERN_ALT: LockResponse = { puzzle: "pattern", cells: [1, 1] };

/** Sort shapes by colour: red or blue. */
export const SORT1: Stub<"sort1"> = {
  ...base("sort1"), puzzle: "sort1",
  items: [A, { shape: "circle", color: "blue" }, { shape: "square", color: "red" }, B],
  bins: ["Red", "Blue"], fits: [[0], [1], [0], [1]],
  solution: { puzzle: "sort1", cells: [1, 2, 1, 2] },
};

/** Sort by shape (rows) and colour (columns): bin = 2 × row + column. */
export const SORT2: Stub<"sort2"> = {
  ...base("sort2"), puzzle: "sort2",
  items: [A, B, { shape: "circle", color: "blue" }, { shape: "square", color: "red" }],
  rows: ["Circles", "Squares"], cols: ["Red", "Blue"], fits: [[0], [3], [1], [2]],
  solution: { puzzle: "sort2", cells: [1, 4, 2, 3] },
};

/** Only the 1s are given, so 2 and 3 may swap: two valid boards. */
export const SHAPES3: Stub<"shapes3"> = {
  ...base("shapes3"), puzzle: "shapes3",
  symbols: [A, B, C], givens: [1, 0, 0, 0, 0, 1, 0, 1, 0],
  solution: { puzzle: "shapes3", cells: [1, 2, 3, 2, 3, 1, 3, 1, 2] },
};
export const SHAPES3_ALT: LockResponse = { puzzle: "shapes3", cells: [1, 3, 2, 3, 2, 1, 2, 1, 3] };

/** 7 balances as 1 + 6, 3 + 4 or 1 + 2 + 4. */
export const BALANCE: Stub<"balance"> = {
  ...base("balance"), puzzle: "balance",
  weights: [1, 2, 3, 4, 6], target: 7, unit: "stones",
  solution: { puzzle: "balance", cells: [1, 0, 0, 0, 1] },
};
export const BALANCE_ALT: LockResponse = { puzzle: "balance", cells: [0, 0, 1, 1, 0] };

/**
 *  1 2 | 3 4      cages: [0,1] + 3   [2,3] × 12   [4,8] - 1   [5,6] ÷ 4
 *  3 4 1 2               [7,11] + 5  [9,10] - 3   [12,13] × 12  [14,15] - 1
 *  2 1 4 3
 *  4 3 2 1
 */
export const CAGE4: Stub<"cage4"> = {
  ...base("cage4"), puzzle: "cage4",
  cages: [
    { cells: [0, 1], op: "+", target: 3 },
    { cells: [2, 3], op: "×", target: 12 },
    { cells: [4, 8], op: "-", target: 1 },
    { cells: [5, 6], op: "÷", target: 4 },
    { cells: [7, 11], op: "+", target: 5 },
    { cells: [9, 10], op: "-", target: 3 },
    { cells: [12, 13], op: "×", target: 12 },
    { cells: [14, 15], op: "-", target: 1 },
  ],
  solution: { puzzle: "cage4", cells: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1] },
};

/** A face:  ##.##  #...#  ..#..  #...#  .###. */
export const NONO5: Stub<"nono5"> = {
  ...base("nono5"), puzzle: "nono5",
  rows: [[2, 2], [1, 1], [1], [1, 1], [3]],
  cols: [[2, 1], [1, 1], [1, 1], [1, 1], [2, 1]],
  solution: { puzzle: "nono5", cells: [1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0] },
};
/** The same picture with every blank marked: marks are not filled, so it is just as right. */
export const NONO5_MARKED: LockResponse = { puzzle: "nono5", cells: NONO5.solution.cells.map((v) => (v === 1 ? 1 : 2)) };

/** Ben has the lute; Ana does not; Cy does not have the harp. So Ana: harp, Ben: lute, Cy: drum. */
export const LOGIC3: Stub<"logic3"> = {
  ...base("logic3"), puzzle: "logic3",
  rows: ["Ana", "Ben", "Cy"], cols: ["lute", "drum", "harp"],
  clues: [
    { type: "isNot", a: [0, 0], text: "Ana does not have the lute." },
    { type: "is", a: [1, 0], text: "Ben has the lute." },
    { type: "isNot", a: [2, 2], text: "Cy does not have the harp." },
  ],
  solution: { puzzle: "logic3", cells: [3, 1, 2] },
};

/** A frog fits both bins, so it may go in either. */
export const SORT: Stub<"sort"> = {
  ...base("sort"), puzzle: "sort",
  categories: ["Lives in water", "Lives on land"],
  items: [{ id: "fish", label: "fish" }, { id: "whale", label: "whale" }, { id: "dog", label: "dog" }, { id: "horse", label: "horse" }, { id: "frog", label: "frog" }],
  fits: [[0], [0], [1], [1], [0, 1]],
  solution: { puzzle: "sort", cells: [1, 1, 2, 2, 1] },
};
export const SORT_ALT: LockResponse = { puzzle: "sort", cells: [1, 1, 2, 2, 2] };
