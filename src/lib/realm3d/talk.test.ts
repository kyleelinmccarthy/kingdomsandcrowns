import { describe, expect, it } from "vitest";
import { objectiveState } from "@/lib/realm/objective";
import { villagerById } from "@/lib/realm/villagers";
import type { ClientTask } from "@/lib/tasks/types";
import { initialFlow } from "@/lib/utils/deed-run-flow";
import { CHEST_EMPTY, worldRewardLine } from "@/lib/utils/world-lock-copy";
import { attemptFeedback, deedToast, finishLabel, fragmentToast, leaveWhat, resultBuildingLine, resultHeadline, resultMinutesLine, resultStarsLine, starsLabel, starsLeftLine, talkCopy, type SiteState } from "./talk";

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
    expect(t.says).toBe("The Village Well stands, and that is thanks to you! Raised by Emma.");
    expect(t.need).toBe("2 more stars to earn here.");
    expect(t.need).not.toContain("for practice");
    expect(t.ask).toBe("Pick one to play again.");
  });

  describe("who raised it", () => {
    const stands: SiteState = { ...well, done: 5, complete: true, stars: 7, raisedBy: "Emma", raisedAt: Date.parse("2026-04-15T18:00:00Z") / 1000 };
    const says = (site: SiteState, over: { timezone?: string | null; heroName?: string; viewer?: "child" | "parent" } = {}) =>
      talkCopy({ villager: bram, site, viewer: over.viewer ?? "child", heroName: over.heroName ?? "Emma", waiting: false, numerals: true, timezone: over.timezone }).says;

    it("adds a second sentence naming who raised it and the calendar season", () => {
      expect(says(stands, { timezone: "America/Denver" })).toBe("The Village Well stands, and that is thanks to you! Raised by Emma · Spring 2026.");
    });

    it("reads the season where the family lives", () => {
      expect(says(stands, { timezone: "Australia/Sydney" })).toMatch(/Raised by Emma · Autumn 2026\.$/);
      expect(says(stands, { timezone: null })).toMatch(/Raised by Emma · Spring 2026\.$/);
    });

    it("keeps the name written when it rose, even after the hero is renamed", () => {
      expect(says({ ...stands, raisedBy: "Em" }, { heroName: "Emma" })).toMatch(/Raised by Em ·/);
    });

    it("falls back to the live name for a building that rose this visit (no snapshot yet)", () => {
      expect(says({ ...stands, raisedBy: null }, { heroName: "Noah" })).toMatch(/Raised by Noah ·/);
      expect(says({ ...well, complete: true }, { heroName: "Noah" })).toBe("The Village Well stands, and that is thanks to you! Raised by Noah.");
    });

    it("leaves the season out when it is not known", () => {
      expect(says({ ...stands, raisedAt: null })).toBe("The Village Well stands, and that is thanks to you! Raised by Emma.");
      expect(says({ ...stands, raisedAt: Number.NaN })).toBe("The Village Well stands, and that is thanks to you! Raised by Emma.");
    });

    it("says it to a grown-up too, and never for a building that is still rising", () => {
      expect(says(stands, { viewer: "parent", heroName: "Emma" })).toMatch(/thanks to Emma! Raised by Emma · /);
      expect(says({ ...well, done: 2, raisedBy: "Emma", raisedAt: 1 })).not.toMatch(/Raised by/);
    });
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
  it("a starred replay of a story already done is practice: never 'rising', never 'try again'", () => {
    const t = deedToast({ site: { ...well, done: 1, total: 3 }, after: { done: 1, total: 3, complete: false }, rose: false, counted: false, earned: true, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(t).toMatchObject({ title: "Practised again!", line: "A new side quest will raise the Village Well.", rose: false, done: 1, total: 3 });
    expect(`${t.title} ${t.line} ${t.spoken}`).not.toMatch(/rising|rose|try again|fail/i);
  });
  it("a starred replay at a building that stands says it stands", () => {
    const t = deedToast({ site: { ...well, done: 3, total: 3, complete: true }, after: { done: 3, total: 3, complete: true, stars: 7, maxStars: 9 }, rose: false, counted: false, earned: true, villagerName: "Old Bram", next: objectiveState(all(), 1), numerals: true });
    expect(t.title).toBe("The Village Well stands.");
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
    expect(resultBuildingLine({ label: "Village Well", done: 2, total: 3, complete: false, practice: false })).toBe("Village Well: 2 of 3 side quests");
    expect(resultBuildingLine({ label: "Village Well", done: 3, total: 3, complete: true, practice: false })).toBe("Village Well is built!");
  });

  it("a run on a building that already stood is practice, and says so", () => {
    expect(resultBuildingLine({ label: "Village Well", done: 3, total: 3, complete: true, practice: true })).toBe("Practised again. The Village Well stands strong.");
  });
});

describe("a review's result", () => {
  it("is a review done, with how many were reviewed and how many right, flawless or not", () => {
    expect(resultHeadline({ correctCount: 3, total: 3, flawless: true, kind: "review" }, "Longwater riddle stone")).toEqual({ title: "Review done!", line: "Reviewed 3 · 3 right" });
    expect(resultHeadline({ correctCount: 1, total: 3, flawless: false, kind: "review" }, "Longwater riddle stone")).toEqual({ title: "Review done!", line: "Reviewed 3 · 1 right" });
  });
});

describe("a world run's result (Puzzle practice)", () => {
  const world = { correctCount: 2, total: 3, flawless: false, kind: "world" as const, stars: 0 as const, previousBest: 0 as const, counted: false };
  it("is puzzles solved, with how many were right, flawless or not, and never a side quest", () => {
    expect(resultHeadline(world, "Puzzle practice")).toEqual({ title: "Puzzles solved!", line: "2 of 3 right." });
    const perfect = resultHeadline({ ...world, correctCount: 3, flawless: true }, "Puzzle practice");
    expect(perfect.title).toBe("Puzzles solved!");
    expect(`${perfect.title} ${perfect.line}`).not.toMatch(/flawless|side quest/i);
  });
  it("has no stars line: no best to beat, and no villager to try again with", () => {
    expect(resultStarsLine(world, "Old Bram")).toBe("");
  });
  it("finishes with its own button", () => {
    expect(finishLabel("world")).toBe("Finish puzzles");
    expect(finishLabel("deed")).toBe("Finish side quest");
    expect(finishLabel("challenge")).toBe("Finish side quest");
    expect(finishLabel("review")).toBe("Finish review");
    expect(finishLabel("build")).toBe("Finish building");
  });
});

describe("a lock's run words (RG-m)", () => {
  it("a chest's or vault door's run finishes with Done, Puzzle practice and the Tower with Finish puzzles", () => {
    expect(finishLabel("world", "chest:west-lane")).toBe("Done");
    expect(finishLabel("world", "door:ringstones")).toBe("Done");
    expect(finishLabel("world", "practice")).toBe("Finish puzzles");
    expect(finishLabel("world")).toBe("Finish puzzles");
    expect(finishLabel("tower")).toBe("Finish puzzles");
    // An id that only looks like an object's is not one.
    expect(finishLabel("world", "chest:nowhere")).toBe("Finish puzzles");
  });
  it("leaves the lock, the puzzles, the review, the build or the side quest", () => {
    expect(leaveWhat("world", "chest:west-lane")).toBe("lock");
    expect(leaveWhat("world", "practice")).toBe("puzzles");
    expect(leaveWhat("tower")).toBe("puzzles");
    expect(leaveWhat("review")).toBe("review");
    expect(leaveWhat("build")).toBe("build");
    expect(leaveWhat("deed", "well-water")).toBe("side quest");
    expect(leaveWhat("challenge")).toBe("side quest");
  });
});

describe("a chest's or vault door's result", () => {
  const world = { correctCount: 1, total: 1, flawless: true, kind: "world" as const };
  const chest = (rewards: Parameters<typeof worldRewardLine>[0]["rewards"]) => ({ ...world, world: { objectId: "chest:west-lane", opened: true, rewards } });

  it("says the chest opens, and what was inside", () => {
    expect(resultHeadline(chest([{ kind: "decor", id: "stone-bench" }]), "The old chest")).toEqual({ title: "The chest opens!", line: "Inside: a stone bench. Look for it in the village." });
    expect(resultHeadline(chest([{ kind: "lore", id: "the-first-lock" }]), "The old chest")).toEqual({ title: "The chest opens!", line: "Inside: a page for your Chronicle, \u201cThe First Lock\u201d." });
  });

  it("says an emptied chest opens with nothing new, in exactly the owner's words", () => {
    expect(resultHeadline(chest([]), "The old chest")).toEqual({ title: "The chest opens!", line: "You've found everything in this chest." });
    expect(CHEST_EMPTY).toBe("You've found everything in this chest.");
  });

  it("says the vault door swings open, on a map and a page", () => {
    const door = { ...world, world: { objectId: "door:ringstones", opened: true, rewards: [{ kind: "fragment" as const, placeId: "summit-7" }, { kind: "lore" as const, id: "ringstones-map" as const }] } };
    expect(resultHeadline(door, "The vault door")).toEqual({ title: "The vault door swings open!", line: "Inside: a map and a page for your Chronicle." });
  });

  it("says the lock holds on a miss, and that a fresh one waits", () => {
    const missed = { ...world, correctCount: 0, flawless: false, world: { objectId: "chest:west-lane", opened: false, reason: "missed" as const, rewards: [] } };
    expect(resultHeadline(missed, "The old chest")).toEqual({ title: "The lock holds.", line: "Try again with a fresh lock." });
  });

  it("says it was already open, with nothing more", () => {
    const already = { ...world, world: { objectId: "door:ringstones", opened: false, reason: "already-open" as const, rewards: [] } };
    expect(resultHeadline(already, "The vault door")).toEqual({ title: "It was already open.", line: "" });
  });

  it("never names a grade, a band, stars or minutes", () => {
    for (const rewards of [[], [{ kind: "decor" as const, id: "sundial" as const }]]) {
      const head = resultHeadline(chest(rewards), "The old chest");
      expect(`${head.title} ${head.line}`).not.toMatch(/grade|band|star|minute|behind|ahead/i);
    }
  });
});

describe("a Tower floor's result", () => {
  const tower = { correctCount: 1, total: 1, flawless: true, kind: "tower" as const };
  const solved = { ...tower, tower: { band: "g23" as const, solved: 2, solvedNow: true } };
  const held = { ...tower, correctCount: 0, flawless: false, tower: { band: "g23" as const, solved: 2, solvedNow: false } };

  it("says the floor is solved, with nothing more", () => {
    expect(resultHeadline(solved, "The Puzzle Tower")).toEqual({ title: "Floor solved!", line: "" });
  });

  it("says the puzzle holds on a miss, and that every climb helps", () => {
    expect(resultHeadline(held, "The Puzzle Tower")).toEqual({ title: "The puzzle holds.", line: "Every climb makes you sharper." });
  });

  it("is told from a chest's or practice's result by the run's kind", () => {
    expect(resultHeadline({ ...tower, world: { objectId: "chest:west-lane", opened: true, rewards: [] } }, "x").title).not.toBe("The chest opens!");
    expect(resultHeadline({ correctCount: 2, total: 3, flawless: false, kind: "world" }, "Puzzle practice").title).not.toBe("Floor solved!");
  });

  it("never names a grade, a band, stars or minutes", () => {
    for (const s of [solved, held]) {
      const head = resultHeadline(s, "The Puzzle Tower");
      expect(`${head.title} ${head.line}`).not.toMatch(/grade|band|star|minute|behind|ahead|k1|g23/i);
    }
  });

  it("finishes its puzzles and leaves the puzzles, as Puzzle practice does (RG-m)", () => {
    expect(finishLabel("tower", "tower:g23")).toBe(finishLabel("world", "practice"));
    expect(leaveWhat("tower", "tower:g23")).toBe("puzzles");
  });
});

describe("a map fragment's toast", () => {
  it("says a map to the place was found, and where to look, with the map icon and no pips", () => {
    expect(fragmentToast("Thunder Head")).toEqual({
      title: "You found a map to Thunder Head!",
      line: "Look for it on your map.",
      done: 0,
      total: 0,
      rose: false,
      icon: "map",
      spoken: "You found a map to Thunder Head! Look for it on your map.",
    });
  });

  it("names every place when one opening gave several maps (G4 m3)", () => {
    expect(fragmentToast("Thunder Head", "Driftwood Cove").title).toBe("You found maps to Thunder Head and Driftwood Cove!");
    expect(fragmentToast("A", "B", "C").spoken).toBe("You found maps to A, B and C! Look for them on your map.");
    expect(fragmentToast("A", "B").line).toBe("Look for them on your map.");
  });

  it("never names a grade, a band or a count", () => {
    const t = fragmentToast("a far place");
    expect(`${t.title} ${t.line}`).not.toMatch(/grade|band|star|minute|behind|ahead/i);
  });
});

describe("a build run's result", () => {
  const done = { correctCount: 2, total: 3, flawless: false, kind: "build" as const };
  const outcome = (level: number, extra: { built?: boolean; reason?: "short" | "error" } = {}) => ({ id: "village-banners" as const, label: "Banners", level, built: true, ...extra });
  it("says the plan is built at level 1, and grows above it, agreeing with a plural name", () => {
    expect(resultHeadline({ ...done, improvement: outcome(1) }, "Banners")).toEqual({ title: "The Banners are built!", line: "2 of 3 right." });
    expect(resultHeadline({ ...done, improvement: outcome(2) }, "Banners").title).toBe("The Banners grow!");
    expect(resultHeadline({ ...done, improvement: { ...outcome(1), id: "village-lamps" as const, label: "Lamps" } }, "Lamps").title).toBe("The Lamps are built!");
  });
  it("keeps a singular name singular", () => {
    const fountain = (level: number) => ({ ...outcome(level), id: "village-fountain" as const, label: "Fountain" });
    expect(resultHeadline({ ...done, improvement: fountain(1) }, "Fountain").title).toBe("The Fountain is built!");
    expect(resultHeadline({ ...done, improvement: fountain(3) }, "Fountain").title).toBe("The Fountain grows!");
  });
  it("never says Flawless! or side quest, even for a perfect run", () => {
    const head = resultHeadline({ ...done, correctCount: 3, flawless: true, improvement: { ...outcome(1), id: "village-fountain" as const, label: "Fountain" } }, "Fountain");
    expect(head.title).toBe("The Fountain is built!");
    expect(`${head.title} ${head.line}`).not.toMatch(/flawless|side quest/i);
  });
  it("says the plan will wait when the materials were not enough", () => {
    expect(resultHeadline({ ...done, improvement: outcome(1, { built: false, reason: "short" }) }, "Banners")).toEqual({
      title: "Not quite enough materials", line: "The plan will wait for you on the plans board.",
    });
  });
  it("says the builders had to stop, and that nothing was spent, on an error or with no outcome", () => {
    const stop = { title: "The builders had to stop", line: "Nothing was spent. Try again from the plans board." };
    expect(resultHeadline({ ...done, improvement: outcome(1, { built: false, reason: "error" }) }, "Banners")).toEqual(stop);
    expect(resultHeadline(done, "Banners")).toEqual(stop);
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
  it("says nothing about trying again to a starred replay that moved nothing", () => {
    expect(resultStarsLine({ stars: 2, previousBest: 3, counted: false, kind: "deed" }, "Old Bram")).toBe("");
    expect(resultStarsLine({ stars: 3, previousBest: 3, counted: false, kind: "deed" }, "Old Bram")).toBe("");
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

describe("what a villager says after a lock answer (R-F2, R-F3)", () => {
  const lockTask: ClientTask = {
    kind: "lock", id: "l", skillId: "logic-k1", prompt: "p",
    view: { puzzle: "balance", weights: [1, 2, 3], target: 3 },
  };

  it("on a second chance, says a rule is broken or spaces are left, before the hint", () => {
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Try the small ones.", feedback: "rule_broken" }, false, undefined, lockTask))
      .toEqual({ heading: "Try again", text: "Something doesn't fit yet. Look at the marked rule. Try the small ones." });
    expect(attemptFeedback({ correct: false, secondChance: true, feedback: "incomplete" }, false, undefined, lockTask).text).toBe("There are empty spaces left.");
    expect(attemptFeedback({ correct: false, secondChance: true, hint: "Count on." }, false, undefined, lockTask).text).toBe("Not quite. Count on.");
  });

  it("on a sort's second chance, nothing is marked, so it never points at a marked rule (RF-c)", () => {
    for (const view of [
      { puzzle: "sort1" as const, items: [{ shape: "circle" as const, color: "red" as const }], bins: ["Red", "Blue"] },
      { puzzle: "sort" as const, categories: ["Alive", "Not alive"], items: [{ id: "a", label: "rock" }] },
    ]) {
      const sort: ClientTask = { kind: "lock", id: "s", skillId: "logic-k1", prompt: "p", view };
      expect(attemptFeedback({ correct: false, secondChance: true, hint: "Look at the colours.", feedback: "rule_broken" }, false, undefined, sort))
        .toEqual({ heading: "Try again", text: "Some of these are in the wrong place. Look again. Look at the colours." });
    }
  });

  it("a miss's line is a sentence of its own, never \"The answer was …\"", () => {
    const answer = "Here is one way it fits.";
    expect(attemptFeedback({ correct: false, secondChance: false, answer, reveal: "balance:1,1,0" }, true, undefined, lockTask).text).toBe(answer);
    expect(attemptFeedback({ correct: false, secondChance: false, answer, hint: "Count on." }, true, "Old Bram", lockTask).text).toBe(`${answer} Count on.`);
  });

  it("a right answer is cheered as any other", () => {
    expect(attemptFeedback({ correct: true, secondChance: false, answer: "Here is one way it fits." }, false, undefined, lockTask).text).toBe("That's it!");
    expect(attemptFeedback({ correct: true, secondChance: false, answer: "Here is one way it fits." }, true, undefined, lockTask).text).toBe("You got there!");
  });

  it("the bench's lines never answer a lock, and a lock's never answer the bench", () => {
    const cut: ClientTask = { kind: "measure", id: "m", skillId: "s", prompt: "p", view: { mode: "cut", unit: "feet" } };
    expect(attemptFeedback({ correct: false, secondChance: true, feedback: "too_long" }, false, undefined, cut).text).toBe("A little long. Trim it.");
    expect(attemptFeedback({ correct: false, secondChance: true, feedback: "rule_broken" }, false, undefined, lockTask).text).not.toMatch(/long|short|over|under/);
  });
});

describe("a villager's mention of real work", () => {
  const MENTION = "I hear you finished “Volcanoes, part 2”. Tell me what you learned sometime!";
  const base = { villager: bram, viewer: "child" as const, heroName: "Emma", numerals: true };

  it("replaces the greeting on a rising building", () => {
    const t = talkCopy({ ...base, site: well, waiting: false, mention: MENTION });
    expect(t.says).toBe(MENTION);
    expect(t.says).not.toContain(bram.greeting);
  });

  it("keeps the hello when the villager is waiting, then the mention in the greeting's place", () => {
    const t = talkCopy({ ...base, site: well, waiting: true, mention: MENTION });
    expect(t.says).toBe(`There you are! ${MENTION}`);
  });

  it("follows the 'Raised by' sentence on a finished building", () => {
    const stands: SiteState = { ...well, done: 5, complete: true, stars: 7 };
    const t = talkCopy({ ...base, site: stands, waiting: false, mention: MENTION });
    expect(t.says).toBe(`The Village Well stands, and that is thanks to you! Raised by Emma. ${MENTION}`);
  });

  it("leaves every other part of the copy unchanged", () => {
    const plain = talkCopy({ ...base, site: well, waiting: false });
    const withMention = talkCopy({ ...base, site: well, waiting: false, mention: MENTION });
    expect({ ...withMention, says: "" }).toEqual({ ...plain, says: "" });
  });

  it("with no mention (absent, null or empty) the copy is exactly what it was", () => {
    const plain = talkCopy({ ...base, site: well, waiting: true });
    expect(talkCopy({ ...base, site: well, waiting: true, mention: null })).toEqual(plain);
    expect(talkCopy({ ...base, site: well, waiting: true, mention: "" })).toEqual(plain);
    const stands: SiteState = { ...well, done: 5, complete: true, stars: 7 };
    expect(talkCopy({ ...base, site: stands, waiting: false, mention: null })).toEqual(talkCopy({ ...base, site: stands, waiting: false }));
  });
});

describe("what a villager says after a search on a trail (R-H1)", () => {
  const clue: ClientTask = { kind: "trail", id: "t", skillId: "read-g1", prompt: "Go where the big wheel turns.", view: {} };

  it("says the place is not here, then the chosen place's redirect, on a second chance", () => {
    expect(attemptFeedback({ correct: false, secondChance: true, feedback: "wrong_place", hint: "That is where water is drawn." }, false))
      .toEqual({ heading: "Try again", text: "Not here. That is where water is drawn." });
  });

  it("a second chance picked back up still says Not here., though the stored pick carries no feedback code", () => {
    const flow = initialFlow({ questions: [clue], responses: ["landmark:well"], pending: { index: 0, ruledOut: "landmark:well", hint: "That is where water is drawn." } });
    expect(flow.result?.feedback).toBeUndefined();
    expect(attemptFeedback(flow.result!, flow.ruledOut.length > 0, "Old Bram", clue)).toEqual({ heading: "Try again", text: "Not here. That is where water is drawn." });
    // Another kind picked back up keeps its own lead.
    const choice: ClientTask = { kind: "choice", id: "q", skillId: "add", prompt: "2 + 3?", view: { choices: ["4", "5"] } };
    const asked = initialFlow({ questions: [choice], responses: ["4"], pending: { index: 0, ruledOut: "4", hint: "Count on." } });
    expect(attemptFeedback(asked.result!, true, undefined, choice).text).toBe("Not quite. Count on.");
  });

  it("says where it was as a sentence, then why, after a miss", () => {
    const miss = { correct: false, secondChance: false, answer: "It was the mill.", explain: "Flour is ground at the mill.", reveal: "landmark:mill" };
    expect(attemptFeedback(miss, false, undefined, clue).text).toBe("It was the mill. Flour is ground at the mill.");
  });
});
