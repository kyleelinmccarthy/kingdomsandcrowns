/**
 * The words a lock says. Client-safe: the server's `answerText` and the players' feedback line
 * (`talk.ts`) read the same strings, so they cannot drift.
 */
import type { FeedbackCode } from "./types";

/** Said after a missed lock, as the solved board is drawn (R-F2). Never wrapped in "The answer was …". */
export const LOCK_MISS_LINE = "Here is one way it fits.";

/** A lock's second-chance line: what is wrong in kind, never which square or how to fix it (R-F3). */
export function lockFeedbackLine(code: "rule_broken" | "incomplete"): string {
  return code === "incomplete" ? "There are empty spaces left." : "Something doesn't fit yet. Look at the marked rule.";
}

/** Whether a feedback code is a lock's. */
export const isLockFeedback = (code: FeedbackCode | undefined): code is "rule_broken" | "incomplete" =>
  code === "rule_broken" || code === "incomplete";
