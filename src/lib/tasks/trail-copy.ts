/**
 * The words a reading trail says (slice 5). Client-safe: the server's `answerText` and the players'
 * feedback line (`talk.ts`) read the same strings, so they cannot drift.
 */

/** Leads a trail's second-chance line; the redirect for the place searched follows it (R-H1). */
export const TRAIL_RETRY_LEAD = "Not here.";

/** Said after a missed clue, as the place is shown: "It was the mill." Never wrapped in "The answer was …". */
export const trailAnswerText = (label: string): string => `It was ${label}.`;

/** A stored clue whose answer is no longer one of the village's anchors (a catalog change since) still has a line. */
export const TRAIL_UNKNOWN_ANSWER = "It was somewhere else.";
