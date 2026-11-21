import { TASK_CODECS } from "@/lib/tasks/codecs";
import { TASK_KINDS, isTaskCorrect } from "@/lib/tasks/registry";
import type { LockTask, Task } from "@/lib/tasks/types";

/**
 * Answers to a stored lock task, for the real-database tests that play a lock run through
 * (`practice-db.test.ts`, `world-locks-db.test.ts`). They read the task as the server stored it,
 * solution and all, so they never stand for what the browser can know.
 */

/** The lock's own stored solution, encoded as the browser would send it. */
export const lockRight = (t: Task): string => TASK_CODECS.lock.encode((t as LockTask).solution);

/** A response the lock accepts as well formed that is still wrong: its own solution with one cell changed. */
export function lockWrong(t: Task): string {
  const { puzzle, cells } = (t as LockTask).solution;
  for (const [i, c] of cells.entries()) {
    for (let v = 0; v <= 9; v++) {
      if (v === c) continue;
      const s = TASK_CODECS.lock.encode({ puzzle, cells: cells.map((x, j) => (j === i ? v : x)) } as LockTask["solution"]);
      if (TASK_KINDS.lock.parseResponse(s, t as LockTask) !== null && !isTaskCorrect(t, s)) return s;
    }
  }
  throw new Error(`no wrong response for ${t.id}`);
}
