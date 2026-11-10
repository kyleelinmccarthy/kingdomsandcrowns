/**
 * The pace guard: three wrong first answers in quick succession look like guessing, and a
 * child who rapid-guesses learns less. The answer is a kind word and an easier clue, never a
 * penalty. It is UI-only: the times come from the browser clock inside `useDeedFlow` and are
 * never sent to the server or stored against the child.
 */
export const PACE = { misses: 3, windowMs: 10_000 } as const;

export const NUDGE_LINE = "Slow down, friend. Read it once more. Here's a clue.";

/** True when the latest `PACE.misses` first answers were all wrong and fell within `PACE.windowMs`. */
export function shouldNudge(history: readonly { at: number; correct: boolean }[]): boolean {
  if (history.length < PACE.misses) return false;
  const recent = history.slice(-PACE.misses);
  if (recent.some((a) => a.correct)) return false;
  return recent[recent.length - 1].at - recent[0].at <= PACE.windowMs;
}
