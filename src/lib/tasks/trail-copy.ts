/**
 * The words a reading trail says (slice 5). Client-safe: the server's `answerText` and the players'
 * feedback line (`talk.ts`) read the same strings, so they cannot drift.
 */
import type { ContentBand } from "@/lib/utils/content-bands";

/** Leads a trail's second-chance line; the redirect for the place searched follows it (R-H1). */
export const TRAIL_RETRY_LEAD = "Not here.";

/** Said after a missed clue, as the place is shown: "It was the mill." Never wrapped in "The answer was …". */
export const trailAnswerText = (label: string): string => `It was ${label}.`;

/** A stored clue whose answer is no longer one of the village's anchors (a catalog change since) still has a line. */
export const TRAIL_UNKNOWN_ANSWER = "It was somewhere else.";

/**
 * What a clue says after a miss when the author wrote no `why` of their own (F-20), by band, so a
 * resolved miss never falls back to the skill hint.
 */
export const TRAIL_GENERIC_WHY: Readonly<Record<ContentBand, string>> = {
  k1: "The clue names the place. Read each word slowly.",
  g23: "The clue is mostly about one place. That place is the answer.",
  g45: "Look for what the clue hints at, and the words that point to it.",
  g68: "Put the clue's facts together: only one place fits them all.",
  g912: "Read the clue's words closely: they say more than they seem to.",
};
