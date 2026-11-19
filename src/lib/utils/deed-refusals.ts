import { SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "./side-quest-copy";

/**
 * Every refusal the deed actions throw, in one place: in production Next hides a thrown server
 * action's message, so the browser shows one only when it recognises it as ours. Kept apart from
 * `deed-attempts.ts` so the boards can import it without the deed engine.
 */
export const ALREADY_ANSWERED = "That question has already been answered.";
export const ANSWER_FIRST = "Answer the question first.";
export const NO_SECOND_TRIES = `This ${SIDE_QUEST_LOWER} has no second tries.`;
export const PICK_SHOWN = "Pick one of the answers shown.";
export const TRY_DIFFERENT = "Try a different answer this time.";
export const CLOSED = "The Realm is closed for this hero. A grown-up can open it in the Chronicle.";
// Sentence case here (not the SIDE_QUESTS title-case noun): this reads as a plain sentence, not an error code.
export const HERO_ONLY = "Side quests are for the hero to play.";
/** A grown-up previewing the Realm cannot start a build run. */
export const BUILD_HERO_ONLY = "Building is for the hero to do.";
/** A grown-up previewing the Realm never uses up the hero's moment of seeing a building rise. */
export const RISE_HERO_ONLY = "Only the hero can see their kingdom rise.";
/** A grown-up previewing the Realm cannot pin the hero's plan. */
export const PIN_HERO_ONLY = "Only the hero can choose what to build.";
/** A grown-up previewing the Realm never uses up the hero's delivery card. */
export const DELIVERY_HERO_ONLY = "Only the hero can take the delivery.";
/** The Crown Challenge opens only on a side quest with every star. */
export const CHALLENGE_LOCKED = "Earn three stars on this side quest first.";
export const NOT_IN_CHRONICLE = `That ${SIDE_QUEST_LOWER} is not in the chronicle.`;
export const NONE_READY = `No ${SIDE_QUESTS_LOWER} are ready for this hero yet.`;
export const FINISHED = `That ${SIDE_QUEST_LOWER} has already been finished.`;
export const NOT_IN_RUN = `That question is not in this ${SIDE_QUEST_LOWER}.`;
export const NOT_THROUGH = "That answer did not go through. Try it again.";
export const ANSWER_EVERY = `Answer every question before finishing the ${SIDE_QUEST_LOWER}.`;
/** Too few questions at the challenge's rung to make a whole Crown Challenge. */
export const CHALLENGE_NOT_READY = `The Crown Challenge for this ${SIDE_QUEST_LOWER} isn't ready yet. Come back soon!`;

/** A plan that is not in the catalog, or whose next level the hero cannot build yet. */
export const PLAN_NOT_READY = "That plan isn't ready yet.";
/** A stale board (another tab built, or spent): the level it shows is not the level on offer now. */
export const PLANS_CHANGED = "The plans changed. Take another look at the board.";

const KNOWN = new Set([
  PLANS_CHANGED,
  ALREADY_ANSWERED, ANSWER_FIRST, NO_SECOND_TRIES, PICK_SHOWN, TRY_DIFFERENT, CLOSED, HERO_ONLY, BUILD_HERO_ONLY, RISE_HERO_ONLY, PIN_HERO_ONLY, DELIVERY_HERO_ONLY,
  CHALLENGE_LOCKED, NOT_IN_CHRONICLE, NONE_READY, FINISHED, NOT_IN_RUN, NOT_THROUGH, ANSWER_EVERY,
  CHALLENGE_NOT_READY, PLAN_NOT_READY,
]);

/** One child-safe line for any error a deed action threw: our own refusal, or a friendly fallback. */
export function deedErrorLine(err: unknown): string {
  return err instanceof Error && KNOWN.has(err.message) ? err.message : "That didn't work.";
}
