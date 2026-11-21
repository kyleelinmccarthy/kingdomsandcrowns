/**
 * Which worked example (demo-first, R-C9, R-F10 and R-H16) a task has, if any: Aldo at the bench for
 * an assemble or a cut, Pip at a lock for a pattern or a shape sort, and Pip following a clue for a
 * reading trail. Client-safe and pure, so the server's `demoAt` marks only a task the players can
 * show a demo for, and the players pick the same demo the server meant.
 */
import type { HandsOnKind } from "./kinds";
import type { LockPuzzle } from "./lock-rules";
import type { ClientTask } from "./types";

export type BenchDemoKey = "assemble" | "cut";
export type LockDemoKey = "pattern" | "sort" | "words" | "shapes" | "balance";
export type DemoKey = BenchDemoKey | LockDemoKey | "trail";

/**
 * Pip's demos, and the puzzles each one shows (ruling RF-g): one for every puzzle a K–3 hero can
 * meet. The pattern; a shape sort (`sort1`, and the 2 × 2 `sort2`, tapped the same way); a word
 * sort (`sort`, the science sorts); the shape grid; and the balance. The older heroes' locks (cages,
 * logic grids, nonograms) have none. Each demo is seen once, by its own puzzles (`demoAt`).
 */
export const LOCK_DEMO_PUZZLES: Readonly<Record<LockDemoKey, readonly LockPuzzle[]>> = {
  pattern: ["pattern"],
  sort: ["sort1", "sort2"],
  words: ["sort"],
  shapes: ["shapes3"],
  balance: ["balance"],
};

export const LOCK_DEMO_KEYS = Object.keys(LOCK_DEMO_PUZZLES) as readonly LockDemoKey[];

export const isLockDemo = (key: DemoKey): key is LockDemoKey => Object.prototype.hasOwnProperty.call(LOCK_DEMO_PUZZLES, key);

/** The kind of task a demo shows: the bench's two are `measure`, Pip's locks `lock`, Pip's clue `trail`. */
export function demoKind(key: DemoKey): HandsOnKind {
  if (key === "trail") return "trail";
  return isLockDemo(key) ? "lock" : "measure";
}

/** The demo for a task: a bench task's mode, a lock's by its puzzle (`LOCK_DEMO_PUZZLES`), a clue's the trail's; multiple choice has none. */
export function demoKeyOf(task: ClientTask | undefined): DemoKey | null {
  if (task?.kind === "measure") return task.view.mode;
  if (task?.kind === "trail") return "trail";
  if (task?.kind !== "lock") return null;
  const puzzle = task.view.puzzle;
  return LOCK_DEMO_KEYS.find((key) => LOCK_DEMO_PUZZLES[key].includes(puzzle)) ?? null;
}
