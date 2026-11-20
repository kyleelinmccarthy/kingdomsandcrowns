/**
 * The board a lock's face edits (F4), as pure functions so the surfaces stay drawing and taps.
 * Client-safe: it reads `lock-rules` only.
 *
 * A board is the response's cells, with one exception: a logic grid is edited as its whole
 * person × item table (0 blank, 1 ✓, 2 ✗, row by row), and its response is read from the ticks,
 * one per person. A row with no tick, or with two, answers nothing yet, so the board is not full.
 * The ✗s, and a nonogram's marks (·), are the child's own notes: they stay on the board and are
 * sent as empty, so a mark added or wiped is never a new answer (the second chance's repeat rule).
 */
import { checkLock, lockSize, type LockCage, type LockPuzzle, type LockResponse, type LockView } from "./lock-rules";

/** Which surface draws a puzzle. */
export type LockFamily = "grid" | "nonogram" | "logic" | "pattern" | "balance" | "sort";

export function familyOf(p: LockPuzzle): LockFamily {
  switch (p) {
    case "shapes3": case "cage4": case "cage5": return "grid";
    case "nono5": return "nonogram";
    case "logic3": case "logic4": return "logic";
    case "pattern": return "pattern";
    case "balance": return "balance";
    case "sort1": case "sort2": case "sort": return "sort";
  }
}

/** The side of a square board: 3, 4 or 5 for the grids and the nonogram, n for an n × n logic grid. */
export function gridSide(v: LockView): number {
  switch (v.puzzle) {
    case "shapes3": return 3;
    case "cage4": return 4;
    case "cage5": case "nono5": return 5;
    case "logic3": case "logic4": return v.rows.length;
    default: return 0;
  }
}

const givensOf = (v: LockView): number[] | undefined =>
  v.puzzle === "shapes3" || v.puzzle === "cage4" || v.puzzle === "cage5" ? v.givens : undefined;

/** Whether square `i` of a grid is a given: fixed, drawn apart, never cycled. */
export const isGiven = (v: LockView, i: number): boolean => (givensOf(v)?.[i] ?? 0) !== 0;

/** A fresh board: every place blank, a grid's givens already in. */
export function blankBoard(v: LockView): number[] {
  if (familyOf(v.puzzle) === "logic") return Array(gridSide(v) ** 2).fill(0);
  const { cells } = lockSize(v);
  const givens = givensOf(v);
  return Array.from({ length: cells }, (_, i) => givens?.[i] ?? 0);
}

/** The board that shows a response: the cells themselves, or a logic grid's ticks. */
export function boardFromCells(v: LockView, cells: readonly number[]): number[] {
  if (familyOf(v.puzzle) !== "logic") return [...cells];
  const n = gridSide(v);
  const board = Array(n * n).fill(0);
  cells.forEach((x, r) => {
    if (x > 0 && x <= n) board[r * n + x - 1] = 1;
  });
  return board;
}

/** The response's cells a board stands for. */
export function cellsFromBoard(v: LockView, board: readonly number[]): number[] {
  if (v.puzzle === "nono5") return board.map((x) => (x === 1 ? 1 : 0));
  if (familyOf(v.puzzle) !== "logic") return [...board];
  const n = gridSide(v);
  return Array.from({ length: n }, (_, r) => {
    const ticks = board.slice(r * n, r * n + n).flatMap((x, c) => (x === 1 ? [c] : []));
    return ticks.length === 1 ? ticks[0] + 1 : 0;
  });
}

export const responseOf = (v: LockView, board: readonly number[]): LockResponse =>
  ({ puzzle: v.puzzle, cells: cellsFromBoard(v, board) }) as LockResponse;

/**
 * Whether every place is answered, so "Check the lock" may be pressed: nothing left blank as the
 * rules count it (`checkLock`'s `empty`), a nonogram's rows each holding their runs' total, and a
 * balance with a stone on the pan. An unfinished board never spends a try.
 */
export function boardIsFull(v: LockView, board: readonly number[]): boolean {
  const check = checkLock(v, responseOf(v, board));
  return check.empty === 0 && !check.broken.includes("response");
}

/** The next value a tap gives: blank, 1, …, max, then blank again. */
export const cycleValue = (x: number, max: number): number => (x >= max ? 0 : x + 1);

const OP_SIGN: Record<LockCage["op"], string> = { "+": "+", "-": "−", "×": "×", "÷": "÷", "=": "" };

/** A cage's label, as a KenKen prints it: "7+", "2÷", or the bare number for a single square. */
export const cageLabel = (c: LockCage): string => `${c.target}${OP_SIGN[c.op]}`;

/** Spoken: "7, add", "2, divide", "4". */
export function cageWords(c: LockCage): string {
  const op = { "+": "add", "-": "take away", "×": "times", "÷": "divide", "=": "" }[c.op];
  return op ? `${c.target}, ${op}` : `${c.target}`;
}

/**
 * For each square of a caged board: its cage, the walls drawn round the cage (a side is a wall
 * where the neighbour is in another cage, or off the board), and the cage's label on its first
 * square (the top-left one, as the cage's lowest index).
 */
export function cageLayout(cages: readonly LockCage[], side: number): { cage: number; label: string | null; top: boolean; right: boolean; bottom: boolean; left: boolean }[] {
  const cageOf = Array<number>(side * side).fill(-1);
  cages.forEach((c, k) => c.cells.forEach((i) => {
    if (i >= 0 && i < cageOf.length) cageOf[i] = k;
  }));
  const firsts = new Set(cages.map((c) => Math.min(...c.cells)));
  return cageOf.map((k, i) => {
    const r = Math.floor(i / side);
    const c = i % side;
    const other = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= side || cc >= side || cageOf[rr * side + cc] !== k;
    return {
      cage: k,
      label: k >= 0 && firsts.has(i) ? cageLabel(cages[k]) : null,
      top: other(r - 1, c), right: other(r, c + 1), bottom: other(r + 1, c), left: other(r, c - 1),
    };
  });
}

export type MarkedLines = { rows: Set<number>; cols: Set<number>; cages: Set<number>; clues: Set<number>; blanks: Set<number>; sum: boolean };

/** The broken rule ids (`checkLock`), read as the parts of the face they outline. */
export function markedLines(broken: Iterable<string>): MarkedLines {
  const out: MarkedLines = { rows: new Set(), cols: new Set(), cages: new Set(), clues: new Set(), blanks: new Set(), sum: false };
  const by: Record<string, Set<number>> = { row: out.rows, col: out.cols, cage: out.cages, clue: out.clues, blank: out.blanks };
  for (const id of broken) {
    if (id === "sum") out.sum = true;
    const [kind, at] = id.split(":");
    if (by[kind] && at !== undefined && /^\d+$/.test(at)) by[kind].add(Number(at));
  }
  return out;
}

export const NO_MARKS: MarkedLines = markedLines([]);
