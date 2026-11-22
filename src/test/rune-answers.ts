import { TASK_CODECS } from "@/lib/tasks/codecs";
import { TASK_KINDS, isTaskCorrect } from "@/lib/tasks/registry";
import { runeTiling } from "@/lib/tasks/rune-tiles";
import type { RuneTask, Task } from "@/lib/tasks/types";

/**
 * Casts at a stored rune task, for the real-database tests that play a rune run through
 * (`world-runes-db.test.ts`). They read the task as the server stored it, words and all, so they
 * never stand for what the browser can know. The lock's twin is `lock-answers.ts`.
 */

/** A right cast: the first accepted word's tiling, encoded as the browser would send it. */
export function runeRight(t: Task): string {
  const task = t as RuneTask;
  for (const word of task.words) {
    const picks = runeTiling(word, task.tiles);
    if (picks) return TASK_CODECS.rune.encode(picks);
  }
  throw new Error(`no tiling for ${t.id}`);
}

/** A cast the stone accepts as well formed that is still wrong: one tile alone (no tile is ever a whole word). */
export function runeWrong(t: Task): string {
  const task = t as RuneTask;
  for (let i = 0; i < task.tiles.length; i++) {
    const s = TASK_CODECS.rune.encode([i]);
    if (TASK_KINDS.rune.parseResponse(s, task) !== null && !isTaskCorrect(t, s)) return s;
  }
  throw new Error(`no wrong cast for ${t.id}`);
}
