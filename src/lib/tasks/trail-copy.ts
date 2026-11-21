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

/** The villager's board, in the Realm: the clue, this line, and the button that closes the board so the hero can walk (R-H14). */
export const TRAIL_SET_OFF = "Set off";
export const TRAIL_SET_OFF_LINE = "Read the clue, then walk to the place it tells of and search there.";

/** The picture run's map, off the Realm (R-H15): the line under it until a place is picked, its send button, and its marks. */
export const TRAIL_MAP_HELP = "Tap the place the clue tells of, then Search here.";
export const TRAIL_MAP_SEARCH = "Search here";
export const TRAIL_MAP_REVEAL = "It was here.";
export const TRAIL_MAP_RULED_OUT = "Not here";
/** The map's own name, for a screen reader. */
export const TRAIL_MAP_LABEL = "The village map";

/** Pip's worked example before a young hero's first clue (R-H16), shown and, for read-aloud, said. */
export const TRAIL_DEMO_COPY = "Watch Pip follow a clue. The clue says: Go to the well. Pip reads it, walks to the well, and searches there. Found it!";
/** The demo's picture, as three steps in order (`TRAIL_DEMO_COPY` says them in full). */
export const TRAIL_DEMO_STEPS = ["Read the clue", "Walk to the well", "Search there"] as const;
/** The steps' list, named for a screen reader. */
export const TRAIL_DEMO_STEPS_LABEL = "What Pip does";

/** E at a stake, in the Realm: "Search the mill" (the verb, then the place's label). */
export const TRAIL_SEARCH_VERB = "Search";

/** The walk's tracker (R-H14): its name, a second search of a place already ruled out, and its buttons. */
export const TRAIL_TRACKER_LABEL = "Reading trail";
export const TRAIL_LOOKED_HERE = "You searched here already. Try somewhere else.";
export const TRAIL_LEAVE = "Leave the trail";
export const TRAIL_FINISH = "Finish the trail";
export const TRAIL_HIDE = "Hide the clue";
export const TRAIL_SHOW = "Show the clue";
/** Where the walk is: "Clue 2 of 4", shown with numerals on and said to a screen reader always. */
export const trailClueCount = (n: number, of: number): string => `Clue ${n} of ${of}`;

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
