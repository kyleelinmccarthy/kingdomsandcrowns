/**
 * The words rune spellcraft says (slice 6). Client-safe: the server's `answerText`, the players and
 * the boards read the same strings, so they cannot drift. Nothing here names a grade or a band, and
 * nothing says a child is behind or ahead (R-I15). The one-line hint lives in `skill-hints.ts`, the
 * refusals in `deed-refusals.ts` and the settings switch in its panel.
 */
import type { ContentBand } from "@/lib/utils/content-bands";

/* ------------------------------------------------------------------ E and the boards */

/** What E at a broken object says: "Cast a rune at the dark lantern". */
export const RUNE_VERB = "Cast a rune at";
/** ...at a fixed one, and for a visiting grown-up, who casts nothing: "Look at the lantern". */
export const RUNE_LOOK_VERB = "Look at";
/** A rune run's header and story. */
export const RUNE_TITLE = "The rune stone";
export const RUNE_STORY = "Something here needs a rune. Build the word and cast it.";
/** An object board for something that is fixed, to the hero and to a visiting grown-up. */
export const RUNE_HOLDS_LINE = "The rune holds. In a few days it will need a fresh one.";
export const RUNE_HOLDS_LINE_VISITOR = "The rune holds here.";
/** A board that could not start a run (runes off, or nothing to cast). */
export const RUNE_NOT_NOW = "No rune can be cast here just now.";
/** The board's line while it asks the server whether a rune can be cast. */
export const RUNE_READING = "The rune stone stirs…";

/* ------------------------------------------------------------------ the stone */

export const RUNE_STONE_LABEL = "The rune stone";
export const RUNE_HELP = "Tap the runes in order to build the word, then Cast.";
export const RUNE_CAST = "Cast";
export const RUNE_CLEAR = "Clear";
/** The built row's text while no tile is placed. */
export const RUNE_EMPTY_ROW = "Your word goes here";
/** What a screen reader calls the built row, the tray, and a placed tile (a tap takes it back). */
export const RUNE_ROW_LABEL = "Your word";
export const RUNE_TRAY_LABEL = "Runes to tap";
export const runeTakeBack = (tile: string): string => `Take back ${tile}`;
/** The stone's one read-aloud control: a dictation's word, or a meaning's. */
export const RUNE_HEAR = "Hear the word";
export const RUNE_HEAR_MEANING = "Hear the meaning";
/** Without speech a dictation prints its word after this, under the picture, so the task stays answerable. */
export const RUNE_NO_SOUND_LEAD = "Sound is off. Read the word:";
export const RUNE_SAME_WORD = "You cast that word already. Try another.";

/* ------------------------------------------------------------------ answers */

/** Leads a second-chance line; the entry's own hint follows it. */
export const RUNE_RETRY_LEAD = "Not that word.";
/** Said after a missed word, as it is shown: "The word was mend." */
export const runeAnswerText = (word: string): string => `The word was ${word}.`;

/* ------------------------------------------------------------------ the walk */

const COUNT_WORDS = ["", "Something in the village needs a rune", "Two things in the village need a rune", "Three things in the village need a rune"] as const;

/**
 * The villager's Set off card for a rune walk: what needs a rune and where to go. One to three
 * labels (a rune side quest has two or three stops); none is nothing to say.
 */
export function runeSetOffLine(labels: readonly string[]): string {
  const shown = labels.slice(0, 3);
  if (shown.length === 0) return "";
  if (shown.length === 1) return `${COUNT_WORDS[1]}: ${shown[0]}. Walk to it and cast it there.`;
  const list = `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return `${COUNT_WORDS[shown.length]}: ${list}. Walk to each one and cast it there.`;
}

export const RUNE_TRACKER_LABEL = "Rune walk";
export const runeStopCount = (n: number, of: number): string => `Rune ${n} of ${of}`;
export const runeNextLine = (label: string): string => `Next: ${label}`;
export const runeFirstLine = (label: string): string => `First, ${label}.`;
/** E at a stop already mended on this walk. */
export const RUNE_HOLDS_HERE = "The rune holds here.";
export const RUNE_LEAVE = "Leave the rune walk";
export const RUNE_FINISH = "Finish the rune walk";
export const RUNE_DONE = "Done";
export const RUNE_HIDE = "Hide the list";
export const RUNE_SHOW = "Show the list";

/* ------------------------------------------------------------------ results */

export const RUNE_WORKS = "The rune works!";
export const RUNE_FADES = "The rune fades.";
export const RUNE_FADES_LINE = "Try again with a fresh word.";
/** Another run had already fixed the object. */
export const RUNE_ALREADY = "The rune already held.";

/* ------------------------------------------------------------------ the demo */

/** Pip's worked example before a young hero's first rune, shown and, for read-aloud, said. */
export const RUNE_DEMO_COPY = "Watch Pip build a rune. Pip hears the word hop, taps h, then o, then p, and casts it. It works!";
/** The demo's picture, as three steps in order (`RUNE_DEMO_COPY` says them in full). */
export const RUNE_DEMO_STEPS = ["Hear the word", "Tap the runes in order", "Cast"] as const;

/** Said after a resolved miss when the entry has no `why` of its own, by band. */
export const RUNE_GENERIC_WHY: Readonly<Record<ContentBand, string>> = {
  k1: "Say the word slowly: each sound is one rune.",
  g23: "Some sounds take two or three letters together. Listen for them.",
  g45: "Think what the meaning asks for, then spell it part by part.",
  g68: "A word's parts carry its meaning: the start, the root and the end.",
  g912: "Old roots carry the meaning; the start and the end shape the word.",
};
