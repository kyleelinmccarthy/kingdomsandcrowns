import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { villagerById } from "@/lib/realm/villagers";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { RUNE_WALK_SUMMARY, runeWalkRun } from "@/test/rune-walk-run";
import { useRuneWalk } from "./use-rune-walk";
import { useTrailWalk } from "./use-trail-walk";
import { useWalks } from "./use-walks";

const clue = (n: number) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt: `Clue ${n}.`, view: {} });
const trailRun: RunStart = {
  runId: "t1",
  deed: { id: "well-signs", title: "Signs for the Well", story: "The sign-painter left clues.", area: "reading" },
  questions: [clue(1), clue(2)],
  responses: [null, null],
  kind: "deed",
  pending: null,
};
const runeRun = runeWalkRun();
const trailSummary: RunSummary = { ...RUNE_WALK_SUMMARY, runes: undefined };
const bram = villagerById("bram")!;

function setup(runesOn = true) {
  return renderHook(
    ({ on }: { on: boolean }) => {
      const trail = useTrailWalk(null);
      const rune = useRuneWalk(null);
      return { trail, rune, walks: useWalks(trail, rune, on) };
    },
    { initialProps: { on: runesOn } },
  );
}

describe("useWalks, the routing between the two walks (RI-a / N15)", () => {
  it("begin with a run whose every task is a rune leaves the trail walk and begins the rune walk", () => {
    const { result } = setup();
    act(() => result.current.walks.begin(trailRun, bram, "well"));
    expect(result.current.trail.walk?.run).toBe(trailRun);
    act(() => result.current.walks.begin(runeRun, bram, "well"));
    expect(result.current.trail.walk).toBeNull();
    expect(result.current.rune.walk).toMatchObject({ run: runeRun, villager: bram, buildingId: "well" });
  });

  it("begin with a trail run leaves the rune walk and begins the trail walk, as today", () => {
    const { result } = setup();
    act(() => result.current.walks.begin(runeRun, bram, "well"));
    act(() => result.current.rune.markMended("rune:west-wagon"));
    act(() => result.current.walks.begin(trailRun, bram, "well"));
    expect(result.current.rune.walk).toBeNull();
    expect(result.current.rune.mended).toEqual([]);
    expect(result.current.trail.walk).toMatchObject({ run: trailRun, villager: bram, buildingId: "well" });
  });

  it("a rune run is not walked while runes are off (RI-a / S7); a trail run always is", () => {
    const { result, rerender } = setup(false);
    expect(result.current.walks.canWalk(runeRun)).toBe(false);
    expect(result.current.walks.canWalk(trailRun)).toBe(true);
    rerender({ on: true });
    expect(result.current.walks.canWalk(runeRun)).toBe(true);
    expect(result.current.walks.canWalk(trailRun)).toBe(true);
  });

  it("walkedFor gives the walk finished for that villager, the trail's or the rune's, and nothing for another", () => {
    const { result } = setup();
    expect(result.current.walks.walkedFor("bram")).toBeNull();
    act(() => result.current.walks.begin(runeRun, bram, "well"));
    act(() => result.current.rune.finish(RUNE_WALK_SUMMARY));
    expect(result.current.walks.walkedFor("bram")).toEqual({ villagerId: "bram", run: runeRun, summary: RUNE_WALK_SUMMARY });
    expect(result.current.walks.walkedFor("tessa")).toBeNull();
    act(() => result.current.walks.begin(trailRun, bram, "well"));
    act(() => result.current.trail.finish(trailSummary));
    expect(result.current.walks.walkedFor("bram")).toEqual({ villagerId: "bram", run: trailRun, summary: trailSummary });
  });

  it("keeps begin and canWalk the same across renders while runesOn holds", () => {
    const { result, rerender } = setup();
    const first = result.current.walks;
    rerender({ on: true });
    expect(result.current.walks.begin).toBe(first.begin);
    expect(result.current.walks.canWalk).toBe(first.canWalk);
  });
});
