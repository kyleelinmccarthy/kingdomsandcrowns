/**
 * A hand-built rune task (slice 6), until the rune pools (I4, I5) exist. A dictation for "mend" at
 * the broken wagon: the tiles hold m, e, n and d among decoys, in an order where no run of adjacent
 * tiles spells the word. Its prompt, object and hint never hold the word, so a test can hold that
 * nothing outside `readAloud` (the dictation, R-I18) tells the browser what it is.
 */
import type { RuneTask } from "@/lib/tasks/types";

export const RUNE_HINT = "It rhymes with send.";

export const RUNE: RuneTask = {
  kind: "rune",
  id: "lang-gk:rune:4e1f0a9c",
  skillId: "lang-gk",
  prompt: "The wagon is broken. Build the word you hear.",
  readAloud: "Mend. Mend the wagon. Mend.",
  effect: "mend",
  object: { id: "rune:west-wagon", label: "the broken wagon" },
  tiles: ["d", "m", "a", "e", "n", "i"],
  listen: true,
  words: ["mend"],
  hint: RUNE_HINT,
  entry: "rune-k1/mend-wagon",
  explain: "Mend means to make whole.",
};

/** The stub, with any fields changed. */
export const runeStub = (over: Partial<RuneTask> = {}): RuneTask => ({ ...RUNE, ...over });
