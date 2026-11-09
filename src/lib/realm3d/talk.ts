/**
 * WHAT A VILLAGER SAYS, and what the village says back when a side quest is done.
 *
 * Every rule here is the flat Realm's, reworded for a conversation rather than a site card:
 * the eight villagers and their greetings are `VILLAGERS`, the building's progress is the
 * `BuildingOverview` the deed engine reports, the next objective is `objectiveState`, and a
 * building that has just risen is worded by `riseToast`. What this file adds is only the
 * sentences a child reads in a 3D conversation — who someone is, what they need, and what the
 * child can do about it — so each one is a function with a test beside it.
 *
 * A grown-up visiting is told the same things about the child, never asked to do them: in the
 * flat Realm's preview a grown-up reads every side quest's story and cannot begin one, and the
 * server refuses a Realm run from anyone but the hero. The words say so.
 *
 * No `three`, no DOM.
 */

import type { AttemptResult, RunSummary } from "@/lib/utils/deed-run-types";
import { MAX_STARS } from "@/lib/utils/deed-scoring";
import type { ObjectiveState } from "@/lib/realm/objective";
import { riseToast } from "@/lib/realm/objective";
import type { Villager } from "@/lib/realm/villagers";
import { SIDE_QUEST_LOWER, SIDE_QUESTS, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { minutesWord } from "@/lib/utils/minutes-copy";

export type Viewer = "child" | "parent";

/** The building half of `BuildingOverview`, as much as a conversation needs. */
export type SiteState = { id: string; label: string; done: number; total: number; complete: boolean; stars: number; maxStars: number };

export type TalkCopy = {
  /** "Old Bram" */
  name: string;
  /** "Keeper of the Village Well" */
  role: string;
  /** What they say, in their own voice. */
  says: string;
  /** What they need, as a plain sentence. Numbers only when `numerals`; pips carry it otherwise. */
  need: string;
  /** What the child can do about it: the line above the list of side quests. */
  ask: string;
};

/** What a standing building still has to give: the stars not yet earned on its side quests. */
export function starsLeftLine(site: { stars: number; maxStars: number }, numerals: boolean): string {
  const left = Math.max(0, site.maxStars - site.stars);
  if (left === 0) return "Every star here is yours.";
  if (!numerals) return "There are still stars to earn here.";
  return `${left} more ${left === 1 ? "star" : "stars"} to earn here.`;
}

function areIs(n: number): string {
  return n === 1 ? "is" : "are";
}

/**
 * One conversation. `waiting` is true when this is the villager the objective card names — the
 * one the gold ! led the child to — and they say so, because being expected is half of why a
 * child walks across a village.
 */
export function talkCopy(input: {
  villager: Villager;
  site: SiteState;
  viewer: Viewer;
  heroName: string;
  waiting: boolean;
  numerals: boolean;
}): TalkCopy {
  const { villager, site, viewer, heroName, waiting, numerals } = input;
  const role = `Keeper of the ${site.label}`;
  const who = viewer === "parent" ? heroName : "you";

  let says: string;
  let need: string;
  if (site.complete) {
    says = `The ${site.label} stands, and that is thanks to ${who}!`;
    need = starsLeftLine(site, numerals);
  } else {
    const hello = waiting ? (viewer === "parent" ? `I was hoping ${heroName} would come. ` : "There you are! ") : "";
    says = `${hello}${villager.greeting}`;
    const left = Math.max(0, site.total - site.done);
    if (!numerals) {
      need = site.done === 0 ? `The ${site.label} needs ${SIDE_QUESTS_LOWER} to rise.` : `The ${site.label} is rising. Keep going!`;
    } else if (site.done === 0) {
      need = `The ${site.label} needs ${site.total} ${SIDE_QUESTS_LOWER} to rise. None ${areIs(0)} done yet.`;
    } else {
      need = `The ${site.label} needs ${left} more ${left === 1 ? SIDE_QUEST_LOWER : SIDE_QUESTS_LOWER} to rise.`;
    }
  }

  const ask =
    viewer === "parent"
      ? `${SIDE_QUESTS} are for ${heroName} to play. Here is what each one asks.`
      : site.complete
        ? `Pick one to play again.`
        : `Pick one to help. Every ${SIDE_QUEST_LOWER} you finish builds it a little more.`;

  return { name: villager.name, role, says, need, ask };
}

/** A flawless Crown Challenge, on the result card and in the toast alike. */
const CROWNED = "Crowned!";

/** The moment a side quest is finished, shown over the world as the panel closes. */
export type DeedToast = {
  title: string;
  line: string;
  /** For the pips. */
  done: number;
  total: number;
  /** The building rose with this side quest: the world just changed. */
  rose: boolean;
  /** Everything above, as one sentence for read-aloud. */
  spoken: string;
};

/**
 * What the village says when a side quest is done. A building that rose gets `riseToast`'s own
 * sentence, with the next objective folded in, exactly as the flat Realm's toast did. A building
 * that is still rising says so, and names who is grateful. A run that earned no star built
 * nothing, so it never says the building rose or is rising. A counted run at a building that
 * already stands says what stars are still to earn there, after this run.
 */
export function deedToast(input: {
  site: SiteState;
  after: { done: number; total: number; complete: boolean; stars?: number; maxStars?: number };
  rose: boolean;
  /** False when the run earned no star: it taught, but it did not build. Defaults to true. */
  counted?: boolean;
  /** Set for a Crown Challenge, which never builds: whether it won the crown. */
  challenge?: { won: boolean };
  villagerName: string | null;
  next: ObjectiveState;
  numerals: boolean;
}): DeedToast {
  const { site, after, rose, villagerName, next, counted = true, challenge, numerals } = input;
  if (challenge) {
    const [title, line] = challenge.won ? [CROWNED, "The crown shines beside your stars."] : ["So close!", "Try the challenge again any time."];
    return { title, line, done: after.done, total: after.total, rose: false, spoken: `${title} ${line}` };
  }
  if (!counted) {
    const title = `${villagerName ?? "The village"} will help you try again.`;
    return { title, line: "Every try teaches something.", done: after.done, total: after.total, rose: false, spoken: `${title} Every try teaches something.` };
  }
  if (rose) {
    const sentence = riseToast(site.label, next);
    const [title, ...rest] = sentence.split(/(?<=\.)\s/);
    const line = rest.join(" ") || "Every building makes the village stronger.";
    return { title: title.replace(/\.$/, "!"), line, done: after.done, total: after.total, rose, spoken: sentence };
  }
  if (after.complete) {
    const title = `The ${site.label} stands.`;
    const line = starsLeftLine({ stars: after.stars ?? site.stars, maxStars: after.maxStars ?? site.maxStars }, numerals);
    return { title, line, done: after.done, total: after.total, rose, spoken: `${title} ${line}` };
  }
  const title = `The ${site.label} is rising!`;
  const line = villagerName ? `${villagerName} says thank you.` : "The village says thank you.";
  return { title, line, done: after.done, total: after.total, rose, spoken: `${title} ${line}` };
}

/** The result card's headline, as the flat Realm's `DeedResults` wrote it; a Crown Challenge is crowned or close. */
export function resultHeadline(
  summary: { correctCount: number; total: number; flawless: boolean; kind?: RunSummary["kind"] },
  deedTitle: string,
): { title: string; line: string } {
  const challenge = summary.kind === "challenge";
  return {
    title: challenge
      ? summary.flawless ? CROWNED : "So close — try the challenge again any time."
      : summary.flawless ? "Flawless!" : "Side quest done!",
    line: `${summary.correctCount} of ${summary.total} right in ${deedTitle}.`,
  };
}

/** The result card's building line, word for word the flat Realm's. */
export function resultBuildingLine(b: { label: string; done: number; total: number; complete: boolean }): string {
  return b.complete ? `${b.label} is built!` : `${b.label}: ${b.done} of ${b.total} ${SIDE_QUESTS_LOWER}`;
}

/** "2 of 3 stars", for a screen reader beside the drawn stars. */
export function starsLabel(stars: number): string {
  return `${stars} of ${MAX_STARS} stars`;
}

/**
 * The line under the stars, one source for the Realm card and the page's. A new best is
 * celebrated; a side quest that earned nothing says someone will help, never that it failed.
 */
export function resultStarsLine(summary: Pick<RunSummary, "stars" | "previousBest" | "counted" | "kind">, villagerName?: string | null): string {
  if (summary.stars > summary.previousBest) return "New best!";
  if (!summary.counted && summary.kind === "deed") return `${villagerName ?? "The village"} will help you try again.`;
  return "";
}

/** Said once the day's side-quest minutes are all earned (spec 2026-11-09 §4.3). */
export const SIDE_QUEST_PAY_FULL_LINE = "You've earned all your side-quest minutes for today — great work!";

/**
 * The result card's minutes line, one source for the Realm card and the page's: what the run
 * paid, or — when it paid nothing because the day's limit is reached — that it is, gently.
 */
export function resultMinutesLine(summary: Pick<RunSummary, "minutesEarned" | "sideQuestPayFull">): string | null {
  if (summary.minutesEarned > 0) return `+${summary.minutesEarned} ${minutesWord(summary.minutesEarned)} earned`;
  return summary.sideQuestPayFull ? SIDE_QUEST_PAY_FULL_LINE : null;
}

/**
 * What to say after an answer. `retried` is true once a first pick was ruled out, so a right
 * answer then is "You got there!". A miss that has run out of tries reveals the answer, then
 * the server's explanation, or its hint when it has none.
 */
export function attemptFeedback(result: AttemptResult, retried: boolean, villagerName?: string): { heading: "Try again" | null; text: string } {
  if (result.secondChance) return { heading: "Try again", text: `Not quite. ${result.hint ?? ""}`.trim() };
  if (result.correct) {
    const text = retried ? "You got there!" : villagerName ? `That's it! ${villagerName} is pleased.` : "That's it!";
    return { heading: null, text };
  }
  const why = result.explain ?? result.hint;
  return { heading: null, text: [result.answer ? `The answer was ${result.answer}.` : "Not quite.", why].filter(Boolean).join(" ") };
}
