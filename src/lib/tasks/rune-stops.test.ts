import { describe, expect, it } from "vitest";
import type { ClientTask } from "./types";
import { runeSetOffLine } from "./rune-copy";
import { isRuneWalk, runeStopOf, runeStops } from "./rune-stops";

type RuneClient = Extract<ClientTask, { kind: "rune" }>;
const rune = (n: number, object: RuneClient["view"]["object"]): RuneClient => ({
  kind: "rune", id: `lang-gk:rune:0000000${n}`, skillId: "lang-gk", prompt: "Build the word you hear.",
  view: { effect: "mend", object, tiles: ["m", "e", "nd", "a"], listen: true },
});
const WAGON = { id: "rune:west-wagon", label: "the broken wagon" };
const LANTERN = { id: "rune:lane-lantern", label: "the dark lantern" };
const VINE = { id: "rune:lane-vine", label: "the drooping vine" };
const choice: ClientTask = { kind: "choice", id: "q", skillId: "add", prompt: "p", view: { choices: ["a"] } };

describe("runeStops: the objects a rune run walks to, in order", () => {
  it("gives every rune task's bound object as { id, label }", () => {
    expect(runeStops({ questions: [rune(1, WAGON), rune(2, LANTERN), rune(3, VINE)] })).toEqual([WAGON, LANTERN, VINE]);
  });

  it("skips a task with no object, an object no longer in the catalog, and a task of another kind (RI-a / N5)", () => {
    const gone = { id: "rune:gone", label: "the broken gone thing" };
    expect(runeStops({ questions: [rune(1, null), rune(2, gone), rune(3, LANTERN), choice] })).toEqual([LANTERN]);
    expect(runeStops({ questions: [] })).toEqual([]);
  });
});

describe("isRuneWalk: a run the rune walk can take (RI-a / N5)", () => {
  it("is a run whose every task is a rune with a stop", () => {
    expect(isRuneWalk({ questions: [rune(1, WAGON), rune(2, LANTERN)] })).toBe(true);
    expect(isRuneWalk({ questions: [rune(1, WAGON), rune(2, { id: "rune:gone", label: "x" })] })).toBe(false);
    expect(isRuneWalk({ questions: [rune(1, WAGON), rune(2, null)] })).toBe(false);
    expect(isRuneWalk({ questions: [rune(1, WAGON), choice] })).toBe(false);
    expect(isRuneWalk({ questions: [] })).toBe(false);
  });
});

describe("runeStopOf: what E at a rune object means on a walk (RI-a / S2)", () => {
  const stops = runeStops({ questions: [rune(1, WAGON), rune(2, LANTERN), rune(3, VINE)] });

  it("is current at the stop on now, and later at a stop still ahead", () => {
    expect(runeStopOf(stops, 1, [], stops[1].id)).toBe("current");
    expect(runeStopOf(stops, 1, [], stops[2].id)).toBe("later");
  });

  it("is done at a stop mended on this walk", () => {
    expect(runeStopOf(stops, 1, [stops[0].id], stops[0].id)).toBe("done");
  });

  it("the current stop stays current once mended: the stone stays open until Done (RI-a / B1)", () => {
    expect(runeStopOf(stops, 1, [stops[1].id], stops[1].id)).toBe("current");
  });

  it("is nothing at a passed stop that was missed, and at an object off the walk", () => {
    expect(runeStopOf(stops, 1, [], stops[0].id)).toBeNull();
    expect(runeStopOf(stops, 1, [], "rune:other")).toBeNull();
    expect(runeStopOf([], 0, [], WAGON.id)).toBeNull();
  });
});

describe("the Set off line for no stops (RI-a / N5)", () => {
  it("is empty", () => {
    expect(runeSetOffLine([])).toBe("");
  });
});
