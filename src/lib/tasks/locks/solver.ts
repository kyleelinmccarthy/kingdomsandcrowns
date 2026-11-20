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
 */
import { checkTask } from "../lock";
import type { LockResponse, LockShape, LockView } from "../lock-rules";
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

/** Every valid response to a pattern, shapes3 or balance task, by trying them all. */
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
    default:
      throw new Error(`${t.puzzle}: no brute-force enumeration, see sortAnswer`);
  }
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
