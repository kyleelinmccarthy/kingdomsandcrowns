// What a child reads at a chest or a vault door. Pure and client-safe. The catalog
// (`lib/realm/world-objects.ts`) takes its labels from here; the verbs, headlines and reward lines
// join them as the surfaces that use them are built. The refusals live in `deed-refusals.ts`.

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
