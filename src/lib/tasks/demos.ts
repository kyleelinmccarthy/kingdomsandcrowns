/**
 * Which worked example (demo-first, R-C9 and R-F10) a task has, if any: Aldo at the bench for an
 * assemble or a cut, Pip at a lock for a pattern or a shape sort. Client-safe and pure, so the
 * server's `demoAt` marks only a task the players can show a demo for, and the players pick the
 * same demo the server meant.
 */
import type { ClientTask } from "./types";

export type BenchDemoKey = "assemble" | "cut";
export type LockDemoKey = "pattern" | "sort" | "words" | "shapes" | "balance";
export type DemoKey = BenchDemoKey | LockDemoKey;

export const LOCK_DEMO_KEYS: readonly LockDemoKey[] = ["pattern", "sort", "words", "shapes", "balance"];

/**
 * The demo for a task: a bench task's mode; for a lock, one for every puzzle a K–3 hero can meet
 * (ruling RF-g): the pattern, a shape sort (`sort1`, and the 2 × 2 `sort2`, tapped the same way),
 * a word sort (`sort`, the science sorts), the shape grid and the balance. The older heroes' locks
 * (cages, logic grids, nonograms) and multiple choice have none.
 */
export function demoKeyOf(task: ClientTask | undefined): DemoKey | null {
  if (task?.kind === "measure") return task.view.mode;
  if (task?.kind !== "lock") return null;
  switch (task.view.puzzle) {
    case "pattern": return "pattern";
    case "sort1": case "sort2": return "sort";
    case "sort": return "words";
    case "shapes3": return "shapes";
    case "balance": return "balance";
    default: return null;
  }
}
