/**
 * Which worked example (demo-first, R-C9 and R-F10) a task has, if any: Aldo at the bench for an
 * assemble or a cut, Pip at a lock for a pattern or a shape sort. Client-safe and pure, so the
 * server's `demoAt` marks only a task the players can show a demo for, and the players pick the
 * same demo the server meant.
 */
import type { ClientTask } from "./types";

export type BenchDemoKey = "assemble" | "cut";
export type LockDemoKey = "pattern" | "sort";
export type DemoKey = BenchDemoKey | LockDemoKey;

/**
 * The demo for a task: a bench task's mode; a lock's pattern, or its shape sort (`sort1`, and the
 * 2 × 2 `sort2`, which is tapped the same way). Other locks (grids, the balance, a word sort) and
 * multiple choice have none.
 */
export function demoKeyOf(task: ClientTask | undefined): DemoKey | null {
  if (task?.kind === "measure") return task.view.mode;
  if (task?.kind !== "lock") return null;
  const p = task.view.puzzle;
  return p === "pattern" ? "pattern" : p === "sort1" || p === "sort2" ? "sort" : null;
}
