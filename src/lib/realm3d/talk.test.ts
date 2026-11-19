import { describe, expect, it } from "vitest";
import { objectiveState } from "@/lib/realm/objective";
import { villagerById } from "@/lib/realm/villagers";
import type { ClientTask } from "@/lib/tasks/types";
import { attemptFeedback, deedToast, resultBuildingLine, resultHeadline, resultMinutesLine, resultStarsLine, starsLabel, starsLeftLine, talkCopy, type SiteState } from "./talk";

const bram = villagerById("bram")!;
const well: SiteState = { id: "well", label: "Village Well", done: 0, total: 5, complete: false, stars: 0, maxStars: 9 };
const all = (over: Record<string, Partial<SiteState>> = {}) =>
  ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({ id, done: 0, total: 5, complete: false, stars: 0, maxStars: 9, ...over[id] }));

describe("a villager's conversation", () => {
  it("greets a child who was sent here, says what the site needs, and asks for help", () => {
    const t = talkCopy({ villager: bram, site: well, viewer: "child", heroName: "Emma", waiting: true, numerals: true });
    expect(t.name).toBe("Old Bram");
    expect(t.role).toBe("Keeper of the Village Well");
    expect(t.says).toBe(`There you are! ${bram.greeting}`);
    expect(t.need).toBe("The Village Well needs 5 side quests to rise. None are done yet.");
    expect(t.ask).toMatch(/^Pick one to help\./);
  });

  it("counts down what is left once work has started", () => {
    expect(talkCopy({ villager: bram, site: { ...well, done: 4 }, viewer: "child", heroName: "Emma", waiting: false, numerals: true }).need).toBe(
      "The Village Well needs 1 more side quest to rise.",
    );
    expect(talkCopy({ villager: bram, site: { ...well, done: 2 }, viewer: "child", heroName: "Emma", waiting: false, numerals: true }).need).toBe(
      "The Village Well needs 3 more side quests to rise.",
    );
  });

  it("uses no numbers at simple depth — the pips carry the count", () => {
    const t = talkCopy({ villager: bram, site: { ...well, done: 2 }, viewer: "child", heroName: "Emma", waiting: false, numerals: false });
    expect(t.need).not.toMatch(/\d/);
    expect(t.says).toBe(bram.greeting);
  });

  it("thanks the child for a building that stands, and says how many stars are left to earn", () => {
    const t = talkCopy({ villager: bram, site: { ...well, done: 5, complete: true, stars: 7 }, viewer: "child", heroName: "Emma", waiting: false, numerals: true });
    expect(t.says).toBe("The Village Well stands, and that is thanks to you!");
    expect(t.need).toBe("2 more stars to earn here.");
    expect(t.need).not.toContain("for practice");
    expect(t.ask).toBe("Pick one to play again.");
  });

  it("words the stars still to earn, down to none", () => {
    expect(starsLeftLine({ stars: 7, maxStars: 9 }, true)).toBe("2 more stars to earn here.");
    expect(starsLeftLine({ stars: 8, maxStars: 9 }, true)).toBe("1 more star to earn here.");
    expect(starsLeftLine({ stars: 9, maxStars: 9 }, true)).toBe("Every star here is yours.");
  });

  it("words the stars still to earn with no digits at simple depth", () => {
    expect(starsLeftLine({ stars: 7, maxStars: 9 }, false)).toBe("There are still stars to earn here.");
    expect(starsLeftLine({ stars: 9, maxStars: 9 }, false)).toBe("Every star here is yours.");
    const t = talkCopy({ villager: bram, site: { ...well, done: 5, complete: true, stars: 7 }, viewer: "child", heroName: "Emma", waiting: false, numerals: false });
    expect(`${t.says} ${t.need} ${t.ask}`).not.toMatch(/\d/);
  });

  it("tells a visiting grown-up the side quests are the child's to play", () => {
    const t = talkCopy({ villager: bram, site: well, viewer: "parent", heroName: "Noah", waiting: true, numerals: true });
    expect(t.says).toBe(`I was hoping Noah would come. ${bram.greeting}`);
    expect(t.ask).toBe("Side Quests are for Noah to play. Here is what each one asks.");
    expect(talkCopy({ villager: bram, site: { ...well, complete: true }, viewer: "parent", heroName: "Noah", waiting: false, numerals: true }).says).toMatch(/thanks to Noah/);
  });
});

describe("the village's answer to a finished side quest", () => {
  it("says the site is rising and who is grateful", () => {
    const t = deedToast({ site: well, after: { done: 1, total: 5, complete: false }, rose: false, villagerName: "Old Bram", next: objectiveState(all({ well: { done: 1 } }), 1), numerals: true });
    expect(t).toMatchObject({ title: "The Village Well is rising!", line: "Old Bram says thank you.", done: 1, total: 5, rose: false });
    expect(t.spoken).toBe("The Village Well is rising! Old Bram says thank you.");
  });

  it("raises a building with the flat Realm's own sentence, next objective folded in", () => {
    const next = objectiveState(all({ well: { done: 5, complete: true } }), 1);
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next, numerals: true });
    expect(t.title).toBe("The Village Well stands!");
    expect(t.line).toBe("Next: the Grain Mill, with Miller Tessa.");
    expect(t.spoken).toBe("The Village Well stands. Next: the Grain Mill, with Miller Tessa.");
    expect(t.rose).toBe(true);
  });

  it("says the whole village is raised when the last building rises", () => {
    const done = all(Object.fromEntries(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => [id, { done: 5, complete: true, stars: 9 }])));
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next: objectiveState(done, 1), numerals: true });
    expect(t.line).toBe("Every building is built.");
  });

  it("says where stars are still to earn when the last building rises and some are left", () => {
    const done = all(Object.fromEntries(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => [id, { done: 5, complete: true, stars: id === "mill" ? 4 : 9 }])));
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next: objectiveState(done, 1), numerals: true });
    expect(t.title).toBe("The Village Well stands!");
    expect(t.line).toBe("Every building is built — there are stars to earn at the Grain Mill.");
  });

  it("calls a side quest at a standing building practice, not a rise, and says what stars are left", () => {
    const t = deedToast({ site: { ...well, done: 5, complete: true, stars: 6 }, after: { done: 5, total: 5, complete: true, stars: 7, maxStars: 9 }, rose: false, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(t.title).toBe("The Village Well stands.");
    expect(t.line).toBe("2 more stars to earn here.");
    expect(t.spoken).toBe("The Village Well stands. 2 more stars to earn here.");
    expect(t.rose).toBe(false);
  });

  it("says what stars are left at a standing building with no digits at simple depth", () => {
    const t = deedToast({ site: { ...well, done: 5, complete: true, stars: 6 }, after: { done: 5, total: 5, complete: true, stars: 7, maxStars: 9 }, rose: false, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: false });
    expect(t.line).toBe("There are still stars to earn here.");
    const full = deedToast({ site: { ...well, done: 5, complete: true, stars: 9 }, after: { done: 5, total: 5, complete: true }, rose: false, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: false });
    expect(full.line).toBe("Every star here is yours.");
  });
});

describe("a side quest that earned no star", () => {
  it("does not say the building rose, and says the villager will help", () => {
    const t = deedToast({ site: well, after: { done: 0, total: 5, complete: false }, rose: false, counted: false, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(t).toMatchObject({ title: "Old Bram will help you try again.", rose: false, done: 0, total: 5 });
    expect(`${t.title} ${t.line} ${t.spoken}`).not.toMatch(/rising|rose|stands|fail/i);
  });
  it("says the village will help when no villager is named", () => {
    const t = deedToast({ site: well, after: { done: 0, total: 5, complete: false }, rose: false, counted: false, villagerName: null, next: objectiveState(all(), 1), numerals: true });
    expect(t.title).toBe("The village will help you try again.");
  });
  it("still says the building is rising for a run that counted", () => {
    const t = deedToast({ site: well, after: { done: 1, total: 5, complete: false }, rose: false, counted: true, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(t.title).toBe("The Village Well is rising!");
  });
});

describe("the result card", () => {
  it("words a result as the flat Realm did", () => {
    expect(resultHeadline({ correctCount: 5, total: 5, flawless: true }, "Fill the Bucket")).toEqual({ title: "Flawless!", line: "5 of 5 right in Fill the Bucket." });
    expect(resultHeadline({ correctCount: 3, total: 5, flawless: false }, "Fill the Bucket").title).toBe("Side quest done!");
    expect(resultBuildingLine({ label: "Village Well", done: 2, total: 5, complete: false })).toBe("Village Well: 2 of 5 side quests");
    expect(resultBuildingLine({ label: "Village Well", done: 5, total: 5, complete: true })).toBe("Village Well is built!");
  });
});

describe("a review's result", () => {
  it("is a review done, with how many were reviewed and how many right, flawless or not", () => {
    expect(resultHeadline({ correctCount: 3, total: 3, flawless: true, kind: "review" }, "Longwater riddle stone")).toEqual({ title: "Review done!", line: "Reviewed 3 · 3 right" });
    expect(resultHeadline({ correctCount: 1, total: 3, flawless: false, kind: "review" }, "Longwater riddle stone")).toEqual({ title: "Review done!", line: "Reviewed 3 · 1 right" });
  });
});

describe("a build run's result", () => {
  const done = { correctCount: 2, total: 3, flawless: false, kind: "build" as const };
  it("says the plan is built at level 1, and grows above it", () => {
    expect(resultHeadline(done, "Banners", { level: 1 })).toEqual({ title: "The Banners is built!", line: "2 of 3 right." });
    expect(resultHeadline(done, "Banners", { level: 2 }).title).toBe("The Banners grows!");
    expect(resultHeadline(done, "Banners", { level: 3 }).title).toBe("The Banners grows!");
  });
  it("never says Flawless! or side quest, even for a perfect run", () => {
    const head = resultHeadline({ ...done, correctCount: 3, flawless: true }, "Fountain", { level: 1 });
    expect(head.title).toBe("The Fountain is built!");
    expect(`${head.title} ${head.line}`).not.toMatch(/flawless|side quest/i);
  });
  it("is built at level 1 when the level is not known", () => {
    expect(resultHeadline(done, "Banners").title).toBe("The Banners is built!");
  });
  it("never says 'New best!' or that the village will help, whatever the stars", () => {
    expect(resultStarsLine({ stars: 3, previousBest: 0, counted: false, kind: "build" })).toBe("");
    expect(resultStarsLine({ stars: 0, previousBest: 0, counted: false, kind: "build" })).toBe("");
  });
});

describe("a Crown Challenge's result", () => {
  it("is crowned when every answer was right, and so close otherwise", () => {
    expect(resultHeadline({ correctCount: 3, total: 3, flawless: true, kind: "challenge" }, "Fill the Bucket")).toEqual({ title: "Crowned!", line: "3 of 3 right in Fill the Bucket." });
    expect(resultHeadline({ correctCount: 2, total: 3, flawless: false, kind: "challenge" }, "Fill the Bucket").title).toBe("So close — try the challenge again any time.");
  });
  it("never says 'New best!', whatever the side quest's best", () => {
    expect(resultStarsLine({ stars: 0, previousBest: 3, counted: false, kind: "challenge" })).toBe("");
  });
  it("toasts the crown, or says it can be tried again — never that someone will help", () => {
    const won = deedToast({ site: { ...well, done: 5, complete: true }, after: { done: 5, total: 5, complete: true }, rose: false, counted: false, challenge: { won: true }, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(won).toMatchObject({ title: "Crowned!", rose: false });
    expect(won.spoken).toBe(`${won.title} ${won.line}`);
    const close = deedToast({ site: { ...well, done: 5, complete: true }, after: { done: 5, total: 5, complete: true }, rose: false, counted: false, challenge: { won: false }, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(close.title).toBe("So close!");
    expect(close.line).toBe("Try the challenge again any time.");
    for (const t of [won, close]) expect(t.spoken).not.toMatch(/help you|rising|fail/i);
  });
});

describe("the result card's stars", () => {
  const base = { stars: 2 as const, previousBest: 1 as const, counted: true, kind: "deed" as const };
  it("celebrates a new best, and only a new best", () => {
    expect(resultStarsLine(base)).toBe("New best!");
    expect(resultStarsLine({ ...base, previousBest: 2 })).toBe("");
    expect(resultStarsLine({ ...base, stars: 3, previousBest: 3 })).toBe("");
  });
  it("tells a starless side quest the villager will help, never that it failed", () => {
    const none = { ...base, stars: 0 as const, previousBest: 0 as const, counted: false };
    expect(resultStarsLine(none, "Old Bram")).toBe("Old Bram will help you try again.");
    expect(resultStarsLine(none)).toBe("The village will help you try again.");
    expect(resultStarsLine(none)).not.toMatch(/fail/i);
  });
  it("says nothing about trying again for a challenge", () => {
    expect(resultStarsLine({ stars: 0, previousBest: 0, counted: false, kind: "challenge" })).toBe("");
  });
  it("words the star count for a screen reader", () => {
    expect(starsLabel(1)).toBe("1 of 3 stars");
    expect(starsLabel(3)).toBe("3 of 3 stars");
  });
});

describe("the result card's minutes", () => {
  it("says what the side quest earned, one minute or many", () => {
    expect(resultMinutesLine({ minutesEarned: 3, sideQuestPayFull: false })).toBe("+3 minutes earned");
    expect(resultMinutesLine({ minutesEarned: 1, sideQuestPayFull: true })).toBe("+1 minute earned");
  });
  it("once the day's side-quest minutes are all earned, says so gently", () => {
    const line = resultMinutesLine({ minutesEarned: 0, sideQuestPayFull: true });
    expect(line).toBe("You've earned all your side-quest minutes for today — great work!");
    expect(line).not.toMatch(/out of time|behind|failed/i);
  });
  it("says nothing when nothing was paid and nothing is used up", () => {
    expect(resultMinutesLine({ minutesEarned: 0, sideQuestPayFull: false })).toBeNull();
  });
});

describe("what a villager says after an answer", () => {
  it("is pleased with a first try, and says so with the villager's name on the Realm board", () => {
    const right = { correct: true, secondChance: false, answer: "5" };
    expect(attemptFeedback(right, false)).toEqual({ heading: null, text: "That's it!" });
    expect(attemptFeedback(right, false, "Old Bram").text).toBe("That's it! Old Bram is pleased.");
  });
  it("cheers a right retry", () => {
    expect(attemptFeedback({ correct: true, secondChance: false, answer: "5" }, true, "Old Bram").text).toBe("You got there!");
  });
  it("gives a hint, not the answer, on a second chance", () => {
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Count on." }, false)).toEqual({ heading: "Try again", text: "Not quite. Count on." });
  });
  it("reveals the answer with the explanation, or the hint when there is none", () => {
    expect(attemptFeedback({ correct: false, secondChance: false, answer: "5", explain: "2 + 3 is 5." }, false).text).toBe("The answer was 5. 2 + 3 is 5.");
    expect(attemptFeedback({ correct: false, secondChance: false, answer: "5", hint: "Count on." }, true).text).toBe("The answer was 5. Count on.");
    expect(attemptFeedback({ correct: false, secondChance: false, answer: "5" }, false).text).toBe("The answer was 5.");
  });
});

describe("what a villager says after a bench answer", () => {
  it("says which way a wrong length is off on a second chance, before the hint", () => {
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Count on.", feedback: "too_long" }, false))
      .toEqual({ heading: "Try again", text: "A little long. Trim it. Count on." });
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Count on.", feedback: "too_short" }, false).text)
      .toBe("A little short. Add to it. Count on.");
  });
  it("keeps the length words for a task that names a length, or no quantity", () => {
    const length: ClientTask = { kind: "measure", id: "m", skillId: "s", prompt: "p", view: { mode: "cut", unit: "feet", quantity: "length" } };
    const bare: ClientTask = { kind: "measure", id: "m", skillId: "s", prompt: "p", view: { mode: "cut", unit: "feet" } };
    for (const task of [length, bare]) {
      expect(attemptFeedback({ correct: false, secondChance: true, feedback: "too_long" }, false, undefined, task).text).toBe("A little long. Trim it.");
      expect(attemptFeedback({ correct: false, secondChance: true, feedback: "too_short" }, false, undefined, task).text).toBe("A little short. Add to it.");
    }
  });
  it("never calls an area, a count or a weight long or short: it is over or under", () => {
    const task = (quantity: "area" | "count" | "weight" | "volume"): ClientTask => ({ kind: "measure", id: "m", skillId: "s", prompt: "p", view: { mode: "cut", unit: "u", quantity } });
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Count on.", feedback: "too_long" }, false, undefined, task("area")))
      .toEqual({ heading: "Try again", text: "A little over. Bring it down. Count on." });
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Count on.", feedback: "too_short" }, false, undefined, task("count")).text)
      .toBe("A little under. Bring it up. Count on.");
    expect(attemptFeedback({ correct: false, secondChance: true, feedback: "too_long" }, false, undefined, task("weight")).text).toBe("A little over. Bring it down.");
    expect(attemptFeedback({ correct: false, secondChance: true, feedback: "too_short" }, false, undefined, task("volume")).text).toBe("A little under. Bring it up.");
  });
  it("shows the worked notation after a right answer, first try or retry", () => {
    expect(attemptFeedback({ correct: true, secondChance: false, answer: "x", bridge: "4 + 5 = 9" }, false).text).toBe("That's it! 4 + 5 = 9");
    expect(attemptFeedback({ correct: true, secondChance: false, answer: "x", bridge: "4 + 5 = 9" }, false, "Old Bram").text).toBe("That's it! Old Bram is pleased. 4 + 5 = 9");
    expect(attemptFeedback({ correct: true, secondChance: false, answer: "x", bridge: "1/2 + 1/4 = 3/4" }, true).text).toBe("You got there! 1/2 + 1/4 = 3/4");
  });
  const assembleTask: ClientTask = { kind: "measure", id: "m", skillId: "add-10", prompt: "p", view: { mode: "assemble", unit: "blocks", pieces: ["1 block", "8 blocks"], target: "9 blocks" } };
  const cutTask: ClientTask = { kind: "measure", id: "m", skillId: "frac-addsub", prompt: "p", view: { mode: "cut", unit: "feet", step: "1/4", maxLength: "2" } };
  const choiceTask: ClientTask = { kind: "choice", id: "q", skillId: "add", prompt: "p", view: { choices: ["a", "b"] } };

  it("an assemble miss's answer is already a sentence, so it is said as it is: the task on the bench says so", () => {
    const answer = "Pieces that add up to 9 blocks, like 1 + 8 = 9.";
    expect(attemptFeedback({ correct: false, secondChance: false, answer, feedback: "too_long" }, true, undefined, assembleTask).text).toBe(answer);
    expect(attemptFeedback({ correct: false, secondChance: false, answer, hint: "Count on." }, true, "Old Bram", assembleTask).text).toBe(`${answer} Count on.`);
  });
  it("only the task's kind decides that, never the answer's words", () => {
    const lookalike = "Pieces that add up to ten.";
    expect(attemptFeedback({ correct: false, secondChance: false, answer: lookalike }, true, undefined, choiceTask).text).toBe(`The answer was ${lookalike}.`);
    expect(attemptFeedback({ correct: false, secondChance: false, answer: lookalike }, true).text).toBe(`The answer was ${lookalike}.`);
  });
  it("a choice answer that is a sentence still reads exactly as it always has", () => {
    expect(attemptFeedback({ correct: false, secondChance: false, answer: "The cat sat down." }, true).text).toBe("The answer was The cat sat down..");
    expect(attemptFeedback({ correct: false, secondChance: false, answer: "The cat sat down." }, true, undefined, choiceTask).text).toBe("The answer was The cat sat down..");
  });
  it("a cut miss names its answer the usual way, and says its equation once, in the explanation", () => {
    expect(attemptFeedback({ correct: false, secondChance: false, answer: "3/4 feet", feedback: "too_short" }, true, undefined, cutTask).text).toBe("The answer was 3/4 feet.");
    const text = attemptFeedback({ correct: false, secondChance: false, answer: "7 blocks", explain: "Take 5 from 12 and 7 is left: 12 − 5 = 7." }, true, "Old Bram", cutTask).text;
    expect(text).toBe("The answer was 7 blocks. Take 5 from 12 and 7 is left: 12 − 5 = 7.");
    expect(text.split("12 − 5 = 7")).toHaveLength(2);
  });
});
