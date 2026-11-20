/**
 * The catalog harness for the older locks (F3): every generated task, at every level and seed,
 * passes the checks every lock owes (determinism, one id one puzzle, a right stored solution, never
 * pre-solved), and each unique-answer puzzle has exactly one answer, counted by the test solver
 * (`locks/solver.ts`). `g58.test.ts` and `g912.test.ts` run it per skill; the per-puzzle checks
 * below are shared by both.
 */
import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { checkTask } from "@/lib/tasks/lock";
import type { LockResponse } from "@/lib/tasks/lock-rules";
import { LOCKS } from "@/lib/tasks/locks";
import { solutions } from "@/lib/tasks/locks/solver";
import type { LockTask } from "@/lib/tasks/types";

export const LEVELS = [0, 1, 2, 3, 4];
export const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);

export type Of<P extends LockTask["puzzle"]> = Extract<LockTask, { puzzle: P }>;

export function drawLock(skillId: string, level: number, seed: number): LockTask {
  const t = LOCKS[skillId](level, seededRng(seed), skillId);
  if (!t) throw new Error(`${skillId} gave no task at level ${level}, seed ${seed}`);
  return t;
}

/** What a child hands in having done nothing: the givens kept, every other place blank. */
export function untouched(t: LockTask): LockResponse {
  const cells = (t.puzzle === "cage4" || t.puzzle === "cage5") && t.givens ? [...t.givens] : t.solution.cells.map(() => 0);
  return { puzzle: t.puzzle, cells } as LockResponse;
}

/** The checks every lock owes, whatever its puzzle. */
export function expectSound(t: LockTask): void {
  expect(t.kind).toBe("lock");
  expect(t.prompt.length, t.id).toBeGreaterThan(0);
  expect(t.prompt.length, t.id).toBeLessThan(60);
  expect(`${t.prompt} ${t.explain ?? ""}`).not.toMatch(/behind|ahead/i);
  expect(checkTask(t, t.solution), t.id).toMatchObject({ ok: true, broken: [], empty: 0 });
  expect(TASK_CODECS.lock.decode(TASK_CODECS.lock.encode(t.solution))).toEqual(t.solution);
  const start = checkTask(t, untouched(t));
  expect(start.ok, t.id).toBe(false);
  expect(start.empty, t.id).toBeGreaterThan(0);
}

/**
 * Generic catalog checks for one skill, levels 0-4 x 500 seeds, plus `more(level, tasks)` for the
 * skill's own puzzle checks. Tasks are drawn once per level.
 */
export function describeCatalog(skillId: string, puzzles: readonly LockTask["puzzle"][], more: (level: number, tasks: LockTask[]) => void): void {
  describe.each(LEVELS)(`${skillId} level %i`, (level) => {
    const tasks = SEEDS.map((seed) => drawLock(skillId, level, seed));

    it("is deterministic: the same seed gives the same task", () => {
      for (const seed of SEEDS) expect(drawLock(skillId, level, seed)).toEqual(tasks[seed - 1]);
    });

    it("gives sound lock tasks for its own skill and puzzles: solution right, never pre-solved", () => {
      for (const t of tasks) {
        expect(t.skillId).toBe(skillId);
        expect(puzzles).toContain(t.puzzle);
        expect(t.id.startsWith(`${skillId}:${t.puzzle}:`), t.id).toBe(true);
        expectSound(t);
      }
    });

    it("an id is one puzzle: equal ids are equal tasks, and at least 5 distinct ids per puzzle", () => {
      const seen = new Map<string, string>();
      for (const t of tasks) {
        const json = JSON.stringify(t);
        expect(seen.get(t.id) ?? json, t.id).toBe(json);
        seen.set(t.id, json);
      }
      for (const p of puzzles) {
        const ofKind = new Set(tasks.filter((t) => t.puzzle === p).map((t) => t.id));
        expect(ofKind.size, `${p} ids`).toBeGreaterThanOrEqual(5);
      }
    });

    more(level, tasks);
  });
}

/** Whether `cells` (row-major, side `n`) are one orthogonally connected piece. */
function connected(cells: number[], n: number): boolean {
  const seen = new Set([cells[0]]);
  const todo = [cells[0]];
  while (todo.length) {
    const c = todo.pop()!;
    for (const d of cells) {
      const adjacent = Math.abs(Math.floor(c / n) - Math.floor(d / n)) + Math.abs((c % n) - (d % n)) === 1;
      if (adjacent && !seen.has(d)) {
        seen.add(d);
        todo.push(d);
      }
    }
  }
  return seen.size === cells.length;
}

/** A cage puzzle: exactly one answer, cages that tile the board, and the operations the rules allow. */
export function expectCage(t: Of<"cage4"> | Of<"cage5">): void {
  const n = t.puzzle === "cage4" ? 4 : 5;
  expect(solutions(t), t.id).toEqual([t.solution]);
  // An independent Latin check of the stored board.
  const rows = Array.from({ length: n }, (_, r) => t.solution.cells.slice(r * n, r * n + n));
  const want = Array.from({ length: n }, (_, i) => i + 1);
  for (const line of [...rows, ...want.map((_, c) => rows.map((r) => r[c]))]) expect([...line].sort((a, b) => a - b)).toEqual(want);
  // The cages tile the board: every square in exactly one, each 1-3 squares and connected.
  expect(t.cages.flatMap((c) => c.cells).sort((a, b) => a - b)).toEqual(Array.from({ length: n * n }, (_, i) => i));
  for (const c of t.cages) {
    expect(c.cells.length).toBeGreaterThanOrEqual(1);
    expect(c.cells.length).toBeLessThanOrEqual(3);
    expect(connected(c.cells, n), t.id).toBe(true);
    expect(Number.isInteger(c.target) && c.target > 0, t.id).toBe(true);
    if (c.cells.length === 1) expect(c.op).toBe("=");
    if (c.cells.length === 2) expect(["+", "-", "×", "÷"]).toContain(c.op);
    if (c.cells.length === 3) expect(["+", "×"]).toContain(c.op);
    if (c.op === "÷") expect(c.target).toBeGreaterThanOrEqual(2);
  }
  if (t.givens) {
    expect(t.givens).toHaveLength(n * n);
    const singles = new Set(t.cages.filter((c) => c.op === "=").flatMap((c) => c.cells));
    t.givens.forEach((g, i) => {
      if (g === 0) return;
      expect(g, t.id).toBe(t.solution.cells[i]);
      expect(singles.has(i), `${t.id} given on a single`).toBe(false);
    });
    expect(t.givens.some((g) => g !== 0), `${t.id}: givens present but empty`).toBe(true);
  }
  // Most of the board is the child's to work out: at least half the squares are neither given nor a single.
  expect(openSquares(t), t.id).toBeGreaterThanOrEqual(Math.ceil((n * n) / 2));
}

/** Squares that are neither given nor a single-square cage. */
export function openSquares(t: Of<"cage4"> | Of<"cage5">): number {
  const n = t.puzzle === "cage4" ? 4 : 5;
  const fixed = new Set([...t.cages.filter((c) => c.op === "=").flatMap((c) => c.cells), ...(t.givens ?? []).flatMap((g, i) => (g ? [i] : []))]);
  return n * n - fixed.size;
}

/** How many matchings a logic grid's clues allow, by the checker. */
const answers = (t: Of<"logic3"> | Of<"logic4">) => solutions(t).length;

/** A logic grid: one answer, a minimal clue set, an elimination it needs, and clues that state one pairing each. */
export function expectLogic(t: Of<"logic3"> | Of<"logic4">): void {
  const n = t.puzzle === "logic3" ? 3 : 4;
  expect(t.rows).toHaveLength(n);
  expect(t.cols).toHaveLength(n);
  expect(new Set(t.rows).size).toBe(n);
  expect(new Set(t.cols).size).toBe(n);
  expect(solutions(t), t.id).toEqual([t.solution]);
  // Minimal: take any one clue away and more than one matching fits.
  t.clues.forEach((_, i) => {
    expect(answers({ ...t, clues: t.clues.filter((__, j) => j !== i) }), `${t.id} without clue ${i}`).toBeGreaterThan(1);
  });
  const is = t.clues.filter((c) => c.type === "is").length;
  expect(is, t.id).toBeLessThanOrEqual(n - 2);
  // An elimination is needed: there is a "not" clue, and (minimal) it can't be dropped.
  expect(t.clues.filter((c) => c.type === "isNot").length, t.id).toBeGreaterThanOrEqual(1);
  // Each clue states one pairing, truthfully, in words naming exactly that person and that item.
  const pairs = new Set<string>();
  for (const c of t.clues) {
    const [r, col] = c.a;
    pairs.add(`${r}.${col}`);
    expect(c.type === "is" ? t.solution.cells[r] === col + 1 : t.solution.cells[r] !== col + 1, `${t.id} ${c.text}`).toBe(true);
    const names = (label: string) => new RegExp(`\\b${label}\\b`, "i").test(c.text);
    expect(t.rows.filter(names), c.text).toEqual([t.rows[r]]);
    expect(t.cols.filter(names), c.text).toEqual([t.cols[col]]);
    expect(/\bnot\b/.test(c.text), c.text).toBe(c.type === "isNot");
    expect(c.text).toMatch(/^[A-Z].*\.$/);
  }
  expect(pairs.size, `${t.id}: a pairing stated twice`).toBe(t.clues.length);
}

/** Run lengths of a 0/1 line. */
const runsOf = (line: number[]) => line.join("").split("0").filter(Boolean).map((s) => s.length);

/** A nonogram: one answer, clues that are the picture's runs, and a picture that is neither sparse nor solid. */
export function expectNono(t: Of<"nono5">): void {
  expect(t.rows).toHaveLength(5);
  expect(t.cols).toHaveLength(5);
  expect(solutions(t), t.id).toEqual([t.solution]);
  expect(t.solution.cells.every((x) => x === 0 || x === 1)).toBe(true);
  const filled = t.solution.cells.filter((x) => x === 1).length;
  expect(filled, t.id).toBeGreaterThanOrEqual(8);
  expect(filled, t.id).toBeLessThan(25);
  const at = [0, 1, 2, 3, 4];
  at.forEach((i) => {
    expect(t.rows[i]).toEqual(runsOf(at.map((c) => t.solution.cells[i * 5 + c])));
    expect(t.cols[i]).toEqual(runsOf(at.map((r) => t.solution.cells[r * 5 + i])));
  });
}
