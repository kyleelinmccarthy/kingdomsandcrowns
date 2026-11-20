// What a child reads at a chest or a vault door. Pure and client-safe. The catalog
// (`lib/realm/world-objects.ts`) takes its labels from here; the verbs, headlines and reward lines
// join them as the surfaces that use them are built. The refusals live in `deed-refusals.ts`.
// It reads the decorations and pages it names from `decor.ts` and `lore.ts`, never from
// `world-objects.ts`, which reads its labels from here.

import { DECOR } from "@/lib/realm/decor";
import { LORE } from "@/lib/realm/lore";
import type { WorldOutcome } from "@/lib/utils/deed-run-types";

/** What E at a chest names: "Open the old chest". */
export const CHEST_LABEL = "the old chest";
/** What E at a vault door names: "Open the vault door". */
export const DOOR_LABEL = "the vault door";

/** A lock run's header: "The old chest", "The vault door". */
export const CHEST_TITLE = "The old chest";
export const DOOR_TITLE = "The vault door";
export const CHEST_STORY = "An old chest, shut with a puzzle for a lock.";
export const DOOR_STORY = "A vault door, sealed with a puzzle.";

/** The last button of a chest's or vault door's run (RG-m); its leave link reads "Leave the lock". */
export const LOCK_FINISH = "Done";

/** What E says at a chest: "Open the old chest" while it is shut, "Look in the old chest" once open. */
export const CHEST_VERBS = { shut: "Open", open: "Look in" } as const;
/** What E says at a vault door: "Open the vault door", then "Look through the vault door". */
export const DOOR_VERBS = { shut: "Open", open: "Look through" } as const;

/** What an open chest's or vault door's board says, to anyone: it starts nothing. */
export const CHEST_OPEN_LINE = "You opened this chest. A new lock comes next week.";
export const DOOR_OPEN_LINE = "The vault stands open. Its map is yours.";

/** The result card's titles and lines (`resultHeadline`). */
export const CHEST_OPENS = "The chest opens!";
export const DOOR_OPENS = "The vault door swings open!";
export const LOCK_HOLDS = "The lock holds.";
export const LOCK_HOLDS_LINE = "Try again with a fresh lock.";
export const ALREADY_OPEN = "It was already open.";

/** An emptied chest still opens every week, and gives nothing new (owner, R-G2). Exact. */
export const CHEST_EMPTY = "You've found everything in this chest.";
/** A vault door's line: it always gives its map and its page together. */
export const DOOR_REWARD_LINE = "Inside: a map and a page for your Chronicle.";

/**
 * What an opening gave, as the result card says it. A vault door gives a map and a page at once;
 * a chest gives one thing (a decoration, or a page for the Chronicle), or, once emptied, nothing.
 */
export function worldRewardLine(o: Pick<WorldOutcome, "rewards">): string {
  if (o.rewards.some((r) => r.kind === "fragment")) return DOOR_REWARD_LINE;
  const first = o.rewards[0];
  if (first?.kind === "decor") return `Inside: ${DECOR[first.id].label}. Look for it in the village.`;
  if (first?.kind === "lore") return `Inside: a page for your Chronicle, “${LORE[first.id].title}”.`;
  return CHEST_EMPTY;
}
