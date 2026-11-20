/**
 * The lock: a logic puzzle on a lock's face, checked against the puzzle's rules, never against a
 * stored answer, so every valid solution counts (R-F1). Server-only, like the registry (`presents`
 * reads the lock generators). The rules are client-safe and live in `lock-rules.ts`; the response
 * codec lives in `codecs.ts`, and this definition delegates to both.
 *
 * The client/server split: `checkLock(view, r)` judges everything the view shows. A sort's answer
 * (`fits`: which bin each item belongs in) is never in the view, so only the server can fault a
 * placed item; `checkTask` adds that to the view's check, and `isCorrect` and `feedback` read it.
 */
import { LOCK_MAX_CHARS, TASK_CODECS } from "./codecs";
import { LOCK_MISS_LINE } from "./lock-copy";
import { checkLock, isSort, responseFits, sortBroken, type BalanceView, type LockCheck, type LockShape, type LockView } from "./lock-rules";
import { lockFor } from "./locks";
import type { LockResponse, LockTask, TaskKindDef } from "./types";

const shapeOf = (s: LockShape): LockShape => (s.size === undefined ? { shape: s.shape, color: s.color } : { shape: s.shape, color: s.color, size: s.size });
const copyNums = (xs: readonly number[]): number[] => xs.map((x) => x);

/** The view, built field by field per puzzle, so a solution, a sort's fits or any stray field can never ride along. */
function toView(t: LockTask): LockView {
  switch (t.puzzle) {
    case "pattern": return { puzzle: t.puzzle, sequence: t.sequence.map((s) => (s ? shapeOf(s) : null)), tray: t.tray.map(shapeOf) };
    case "sort1": return { puzzle: t.puzzle, items: t.items.map(shapeOf), bins: t.bins.map(String) };
    case "sort2": return { puzzle: t.puzzle, items: t.items.map(shapeOf), rows: [String(t.rows[0]), String(t.rows[1])], cols: [String(t.cols[0]), String(t.cols[1])] };
    case "sort": return { puzzle: t.puzzle, categories: t.categories.map(String), items: t.items.map((i) => ({ id: i.id, label: i.label })) };
    case "shapes3": return { puzzle: t.puzzle, symbols: t.symbols.map(shapeOf), givens: copyNums(t.givens) };
    case "balance": {
      const v: BalanceView = { puzzle: t.puzzle, weights: copyNums(t.weights), target: t.target };
      if (t.unit !== undefined) v.unit = t.unit;
      return v;
    }
    case "cage4": case "cage5": {
      const cages = t.cages.map((c) => ({ cells: copyNums(c.cells), op: c.op, target: c.target }));
      return t.givens === undefined ? { puzzle: t.puzzle, cages } : { puzzle: t.puzzle, cages, givens: copyNums(t.givens) };
    }
    case "logic3": case "logic4":
      return {
        puzzle: t.puzzle, rows: t.rows.map(String), cols: t.cols.map(String),
        clues: t.clues.map((c) => ({ type: c.type, a: [c.a[0], c.a[1]], text: c.text })),
      };
    case "nono5": return { puzzle: t.puzzle, rows: t.rows.map(copyNums), cols: t.cols.map(copyNums) };
  }
}

/** The full check, server-side: the view's rules, plus a sort's placed items against their bins. */
export function checkTask(t: LockTask, r: LockResponse): LockCheck {
  const seen = checkLock(t, r);
  if (seen.broken.includes("response")) return seen;
  if (!isSort(t.puzzle) || !("fits" in t)) return seen; // `fits` narrows `t` to a sort task for the compiler
  const broken = [...seen.broken, ...sortBroken(t.fits, r.cells)];
  return { ok: broken.length === 0 && seen.empty === 0, broken, empty: seen.empty };
}

export const lockKind: TaskKindDef<"lock"> = {
  toView,
  // Strict: the encoded string only, at most LOCK_MAX_CHARS, in its one canonical form, for this
  // task's puzzle, at its size, in range and with its givens kept. Nothing is trimmed or coerced.
  parseResponse: (raw, t) => {
    if (typeof raw !== "string" || raw.length > LOCK_MAX_CHARS) return null;
    const r = TASK_CODECS.lock.decode(raw);
    return r !== null && responseFits(t, r) ? r : null;
  },
  encode: TASK_CODECS.lock.encode,
  decode: TASK_CODECS.lock.decode,
  isCorrect: (t, r) => checkTask(t, r).ok,
  allowsSecondChance: () => true,
  sameResponse: TASK_CODECS.lock.sameResponse,
  // The solved board is the reveal (`AttemptResult.reveal`, R-F2); the words only point at it.
  answerText: () => LOCK_MISS_LINE,
  // Spaces left come first; then whether a rule is broken. Never which one, nor how to mend it.
  feedback: (t, r) => {
    const c = checkTask(t, r);
    if (c.ok) return "none";
    return c.empty > 0 ? "incomplete" : "rule_broken";
  },
  presents: (skillId) => lockFor(skillId) !== undefined,
};
