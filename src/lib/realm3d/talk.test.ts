import { describe, expect, it } from "vitest";
import { objectiveState } from "@/lib/realm/objective";
import { villagerById } from "@/lib/realm/villagers";
import { attemptFeedback, deedToast, resultBuildingLine, resultHeadline, resultStarsLine, starsLabel, starsLeftLine, talkCopy, type SiteState } from "./talk";

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
    expect(starsLeftLine({ stars: 7, maxStars: 9 })).toBe("2 more stars to earn here.");
    expect(starsLeftLine({ stars: 8, maxStars: 9 })).toBe("1 more star to earn here.");
    expect(starsLeftLine({ stars: 9, maxStars: 9 })).toBe("Every star here is yours.");
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
    const t = deedToast({ site: well, after: { done: 1, total: 5, complete: false }, rose: false, villagerName: "Old Bram", next: objectiveState(all({ well: { done: 1 } }), 1) });
    expect(t).toMatchObject({ title: "The Village Well is rising!", line: "Old Bram says thank you.", done: 1, total: 5, rose: false });
    expect(t.spoken).toBe("The Village Well is rising! Old Bram says thank you.");
  });

  it("raises a building with the flat Realm's own sentence, next objective folded in", () => {
    const next = objectiveState(all({ well: { done: 5, complete: true } }), 1);
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next });
    expect(t.title).toBe("The Village Well stands!");
    expect(t.line).toBe("Next: the Grain Mill, with Miller Tessa.");
    expect(t.spoken).toBe("The Village Well stands. Next: the Grain Mill, with Miller Tessa.");
    expect(t.rose).toBe(true);
  });

  it("says the whole village is raised when the last building rises", () => {
    const done = all(Object.fromEntries(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => [id, { done: 5, complete: true, stars: 9 }])));
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next: objectiveState(done, 1) });
    expect(t.line).toBe("Every building is built.");
  });

  it("says where stars are still to earn when the last building rises and some are left", () => {
    const done = all(Object.fromEntries(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => [id, { done: 5, complete: true, stars: id === "mill" ? 4 : 9 }])));
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next: objectiveState(done, 1) });
    expect(t.title).toBe("The Village Well stands!");
    expect(t.line).toBe("Every building is built — there are stars to earn at the Grain Mill.");
  });

  it("calls a side quest at a standing building practice, not a rise", () => {
    const t = deedToast({ site: { ...well, done: 5, complete: true }, after: { done: 5, total: 5, complete: true }, rose: false, villagerName: "Old Bram", next: objectiveState(all(), 1) });
    expect(t.title).toBe("The Village Well stands.");
    expect(t.rose).toBe(false);
  });
});

describe("a side quest that earned no star", () => {
  it("does not say the building rose, and says the villager will help", () => {
    const t = deedToast({ site: well, after: { done: 0, total: 5, complete: false }, rose: false, counted: false, villagerName: "Old Bram", next: objectiveState(all(), 1) });
    expect(t).toMatchObject({ title: "Old Bram will help you try again.", rose: false, done: 0, total: 5 });
    expect(`${t.title} ${t.line} ${t.spoken}`).not.toMatch(/rising|rose|stands|fail/i);
  });
  it("says the village will help when no villager is named", () => {
    const t = deedToast({ site: well, after: { done: 0, total: 5, complete: false }, rose: false, counted: false, villagerName: null, next: objectiveState(all(), 1) });
    expect(t.title).toBe("The village will help you try again.");
  });
  it("still says the building is rising for a run that counted", () => {
    const t = deedToast({ site: well, after: { done: 1, total: 5, complete: false }, rose: false, counted: true, villagerName: "Old Bram", next: objectiveState(all(), 1) });
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
