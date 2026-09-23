import { describe, expect, it } from "vitest";
import { objectiveState } from "@/lib/realm/objective";
import { villagerById } from "@/lib/realm/villagers";
import { deedToast, resultBuildingLine, resultHeadline, talkCopy, type SiteState } from "./talk";

const bram = villagerById("bram")!;
const well: SiteState = { id: "well", label: "Village Well", done: 0, total: 5, complete: false };
const all = (over: Record<string, Partial<SiteState>> = {}) =>
  ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({ id, done: 0, total: 5, complete: false, ...over[id] }));

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

  it("thanks the child for a building that stands, and offers its side quests as practice", () => {
    const t = talkCopy({ villager: bram, site: { ...well, done: 5, complete: true }, viewer: "child", heroName: "Emma", waiting: false, numerals: true });
    expect(t.says).toBe("The Village Well stands, and that is thanks to you!");
    expect(t.need).toMatch(/practice/);
    expect(t.ask).toBe("Pick one to play again.");
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
    const done = all(Object.fromEntries(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => [id, { done: 5, complete: true }])));
    const t = deedToast({ site: { ...well, done: 4 }, after: { done: 5, total: 5, complete: true }, rose: true, villagerName: "Old Bram", next: objectiveState(done, 1) });
    expect(t.line).toBe("Every building is raised.");
  });

  it("calls a side quest at a standing building practice, not a rise", () => {
    const t = deedToast({ site: { ...well, done: 5, complete: true }, after: { done: 5, total: 5, complete: true }, rose: false, villagerName: "Old Bram", next: objectiveState(all(), 1) });
    expect(t.title).toBe("The Village Well stands.");
    expect(t.rose).toBe(false);
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
