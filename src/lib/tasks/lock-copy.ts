/**
 * The words a lock says. Client-safe: the server's `answerText` and the players' feedback line
 * (`talk.ts`) read the same strings, so they cannot drift.
 */
import { isSort, type LockPuzzle } from "./lock-rules";
import type { FeedbackCode } from "./types";

/** Said after a missed lock, as the solved board is drawn (R-F2). Never wrapped in "The answer was …". */
export const LOCK_MISS_LINE = "Here is one way it fits.";

/**
 * A sort's second-chance line (ruling RF-c). Which bin an item belongs in is the answer, so a sort's
 * face marks nothing, and its line never points at a marked rule.
 */
export const LOCK_SORT_RETRY_LINE = "Some of these are in the wrong place. Look again.";

/**
 * A lock's second-chance line: what is wrong in kind, never which square or how to fix it (R-F3).
 * A sort (`puzzle`) says `LOCK_SORT_RETRY_LINE` for a broken rule, since nothing on it is marked.
 */
export function lockFeedbackLine(code: "rule_broken" | "incomplete", puzzle?: LockPuzzle): string {
  if (code === "incomplete") return "There are empty spaces left.";
  return puzzle && isSort(puzzle) ? LOCK_SORT_RETRY_LINE : "Something doesn't fit yet. Look at the marked rule.";
}

/** Whether a feedback code is a lock's. */
export const isLockFeedback = (code: FeedbackCode | undefined): code is "rule_broken" | "incomplete" =>
  code === "rule_broken" || code === "incomplete";
