/**
 * TEST-ONLY brute-force solvers for the lock puzzles. Nothing in the app imports this file.
 *
 * `solutions(task)` lists every response that passes the full server check (`checkTask`), found by
 * trying every combination of the open places. It exists so the catalog tests can COUNT answers:
 * a unique-solution kind must have exactly one, and every answer found must be graded right.
 *
 * A sort's open places are too many to enumerate (4^8 per puzzle) and its rule is per item, so
 * `sortAnswer` instead derives each item's bin from the bin LABELS the child reads, an oracle that
 * shares no code with the generator's `fits`.
 *
 * The older locks (F3) are searched, and every search judges with the checker itself, so the solver
 * can't disagree with the grader about what counts, and shares no code with the generators:
 * - a logic grid tries every one of the n! matchings;
 * - a nonogram tries every board whose rows each have their clue's runs (a superset of the right
 *   boards: a right board's rows all have their runs);
 * - a cage fills square by square, cage after cage, and drops a branch as soon as `checkLock` calls a
 *   rule broken on the partial board. That is sound: a repeat in a line, or a full cage that misses,
 *   stays broken however the rest is filled. It stops after `CAGE_LIMIT` answers.
 */
import { checkTask } from "../lock";
import { checkLock, type LockResponse, type LockShape, type LockView } from "../lock-rules";
import type { LockTask } from "../types";
import { ATTRS, VALUES, attrOf, valueLabel, type Attr } from "./shapes";

/** Every way to fill `slots` places each with 0..max (or 1..max when `blankOk` is false). */
function* fills(slots: number, max: number, blankOk: boolean): Generator<number[]> {
  const cur: number[] = Array(slots).fill(0);
  const go = function* (i: number): Generator<number[]> {
    if (i === slots) return yield [...cur];
    for (let v = blankOk ? 0 : 1; v <= max; v++) {
      cur[i] = v;
      yield* go(i + 1);
    }
  };
  yield* go(0);
}

/** Every valid response to a task, by trying them all (a cage stops at `CAGE_LIMIT`). Sorts: see `sortAnswer`. */
export function solutions(t: LockTask): LockResponse[] {
  const out: LockResponse[] = [];
  const keep = (cells: number[]) => {
    const r = { puzzle: t.puzzle, cells } as LockResponse;
    if (checkTask(t, r).ok) out.push(r);
  };
  switch (t.puzzle) {
    case "pattern": {
      const blanks = t.sequence.filter((s) => s === null).length;
      for (const c of fills(blanks, t.tray.length, false)) keep(c);
      break;
    }
    case "shapes3": {
      const open = t.givens.flatMap((g, i) => (g === 0 ? [i] : []));
      for (const c of fills(open.length, t.symbols.length, false)) {
        const cells = [...t.givens];
        open.forEach((at, k) => (cells[at] = c[k]));
        keep(cells);
      }
      break;
    }
    case "balance": {
      for (let mask = 0; mask < 1 << t.weights.length; mask++) keep(t.weights.map((_, i) => (mask >> i) & 1));
      break;
    }
    case "logic3": case "logic4": {
      for (const p of permutations(t.rows.length)) keep(p.map((c) => c + 1));
      break;
    }
    case "nono5": {
      for (const cells of rowBoards(t.rows)) keep(cells);
      break;
    }
    case "cage4": case "cage5":
      return cageSearch(t);
    default:
      throw new Error(`${t.puzzle}: no brute-force enumeration, see sortAnswer`);
  }
  return out;
}

/** Every ordering of 0..n-1. */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, at) => [...p.slice(0, at), n - 1, ...p.slice(at)]));
}

/** The run lengths of a line of 0/1, written here afresh so the solver shares nothing with the generator. */
const runLengths = (line: number[]): number[] => line.join("").split("0").filter((s) => s.length > 0).map((s) => s.length);

/** Every 5x5 board (0/1) whose rows each have exactly their clue's runs. */
function* rowBoards(rowClues: number[][]): Generator<number[]> {
  const lines = Array.from({ length: 32 }, (_, m) => [0, 1, 2, 3, 4].map((i) => (m >> (4 - i)) & 1));
  const fitting = rowClues.map((clue) => lines.filter((l) => runLengths(l).join(",") === clue.filter((x) => x > 0).join(",")));
  const go = function* (r: number, acc: number[]): Generator<number[]> {
    if (r === 5) return yield acc;
    for (const l of fitting[r] ?? []) yield* go(r + 1, [...acc, ...l]);
  };
  yield* go(0, []);
}

/** The most answers a cage search collects: past two, uniqueness has already failed. */
export const CAGE_LIMIT = 4;

function cageSearch(t: Extract<LockTask, { puzzle: "cage4" | "cage5" }>): LockResponse[] {
  const side = t.puzzle === "cage4" ? 4 : 5;
  const size = side * side;
  // Square order: cage by cage as listed, then any square no cage holds. Givens are in from the start.
  const order = [...new Set([...t.cages.flatMap((c) => c.cells), ...Array.from({ length: size }, (_, i) => i)])];
  const cells = Array.from({ length: size }, (_, i) => t.givens?.[i] ?? 0);
  const open = order.filter((i) => cells[i] === 0);
  const holds = () => checkLock(t, { puzzle: t.puzzle, cells } as LockResponse).broken.length === 0;
  const out: LockResponse[] = [];
  const go = (k: number) => {
    if (out.length >= CAGE_LIMIT) return;
    if (k === open.length) {
      const r = { puzzle: t.puzzle, cells: [...cells] } as LockResponse;
      if (checkTask(t, r).ok) out.push(r);
      return;
    }
    for (let v = 1; v <= side; v++) {
      cells[open[k]] = v;
      if (holds()) go(k + 1);
    }
    cells[open[k]] = 0;
  };
  if (holds()) go(0);
  return out;
}

/** The bin (0-based) a shape goes in for `attr`, read off the bin labels, or -1 when no label names it. */
function binByLabel(s: LockShape, attr: Attr, labels: readonly string[]): number {
  const v = attrOf(s, attr);
  return VALUES[attr].some((x) => x === v) ? labels.indexOf(valueLabel(attr, v!)) : -1;
}

/** Which attribute a list of bin labels names: the one whose vocabulary labels them all. */
function attrOfLabels(labels: readonly string[]): Attr {
  const found = ATTRS.filter((a) => labels.every((l) => VALUES[a].some((v) => valueLabel(a, v) === l)));
  if (found.length !== 1) throw new Error(`bin labels ${labels.join("/")} do not name one attribute`);
  return found[0];
}

/** The one correct response to a sort1 or sort2, derived from its labels alone. */
export function sortAnswer(v: Extract<LockView, { puzzle: "sort1" | "sort2" }>): LockResponse {
  if (v.puzzle === "sort1") {
    const attr = attrOfLabels(v.bins);
    return { puzzle: "sort1", cells: v.items.map((s) => binByLabel(s, attr, v.bins) + 1) };
  }
  const rowAttr = attrOfLabels(v.rows);
  const colAttr = attrOfLabels(v.cols);
  return { puzzle: "sort2", cells: v.items.map((s) => 2 * binByLabel(s, rowAttr, v.rows) + binByLabel(s, colAttr, v.cols) + 1) };
}
