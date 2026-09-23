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

import type { ObjectiveState } from "@/lib/realm/objective";
import { riseToast } from "@/lib/realm/objective";
import type { Villager } from "@/lib/realm/villagers";
import { SIDE_QUEST_LOWER, SIDE_QUESTS, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

export type Viewer = "child" | "parent";

/** The building half of `BuildingOverview`, as much as a conversation needs. */
export type SiteState = { id: string; label: string; done: number; total: number; complete: boolean };

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
    need = `Its ${SIDE_QUESTS_LOWER} are still here, for practice.`;
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
 * that is still rising says so, and names who is grateful.
 */
export function deedToast(input: {
  site: SiteState;
  after: { done: number; total: number; complete: boolean };
  rose: boolean;
  villagerName: string | null;
  next: ObjectiveState;
}): DeedToast {
  const { site, after, rose, villagerName, next } = input;
  if (rose) {
    const sentence = riseToast(site.label, next);
    const [title, ...rest] = sentence.split(/(?<=\.)\s/);
    const line = rest.join(" ") || "Every building makes the village stronger.";
    return { title: title.replace(/\.$/, "!"), line, done: after.done, total: after.total, rose, spoken: sentence };
  }
  if (after.complete) {
    const title = `The ${site.label} stands.`;
    const line = "That was good practice.";
    return { title, line, done: after.done, total: after.total, rose, spoken: `${title} ${line}` };
  }
  const title = `The ${site.label} is rising!`;
  const line = villagerName ? `${villagerName} says thank you.` : "The village says thank you.";
  return { title, line, done: after.done, total: after.total, rose, spoken: `${title} ${line}` };
}

/** The result card's headline, as the flat Realm's `DeedResults` wrote it. */
export function resultHeadline(summary: { correctCount: number; total: number; flawless: boolean }, deedTitle: string): { title: string; line: string } {
  return {
    title: summary.flawless ? "Flawless!" : "Side quest done!",
    line: `${summary.correctCount} of ${summary.total} right in ${deedTitle}.`,
  };
}

/** The result card's building line, word for word the flat Realm's. */
export function resultBuildingLine(b: { label: string; done: number; total: number; complete: boolean }): string {
  return b.complete ? `${b.label} is built!` : `${b.label}: ${b.done} of ${b.total} ${SIDE_QUESTS_LOWER}`;
}
