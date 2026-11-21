import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { villagerById } from "@/lib/realm/villagers";
import { RUNE_WALK_SUMMARY, WALK_STOPS, runeWalkRun } from "@/test/rune-walk-run";
import { useRuneWalk } from "./use-rune-walk";

const run = runeWalkRun();
const [WAGON, LANTERN, FLOWERS] = WALK_STOPS.map((s) => s.id);
const bram = villagerById("bram")!;

function setup(initial: string | null = null) {
  return renderHook(({ kind }: { kind: string | null }) => useRuneWalk(kind), { initialProps: { kind: initial } });
}

describe("useRuneWalk", () => {
  it("starts with no walk: stop 0, nothing mended, nothing for the canvas", () => {
    const { result } = setup();
    expect(result.current.walk).toBeNull();
    expect(result.current.at).toBe(0);
    expect(result.current.mended).toEqual([]);
    expect(result.current.canvas).toBeNull();
    expect(result.current.sayRef.current).toBeNull();
    expect(result.current.stopOf(WAGON)).toBeNull();
    expect(result.current.casts(WAGON)).toBe(false);
  });

  it("begin sets the walk and bumps its key, and starts again at stop 0 with nothing mended", () => {
    const { result } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    expect(result.current.walk).toEqual({ key: 1, run, villager: bram, buildingId: "mill" });
    act(() => result.current.setAt(2));
    act(() => result.current.markMended(WAGON));
    act(() => result.current.begin(run, bram, "mill"));
    expect(result.current.walk?.key).toBe(2);
    expect(result.current.at).toBe(0);
    expect(result.current.mended).toEqual([]);
  });

  it("leave drops the walk, its stop and its marks", () => {
    const { result } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    act(() => result.current.setAt(1));
    act(() => result.current.markMended(WAGON));
    act(() => result.current.leave());
    expect(result.current.walk).toBeNull();
    expect(result.current.at).toBe(0);
    expect(result.current.mended).toEqual([]);
    expect(result.current.canvas).toBeNull();
  });

  it("stopOf: the stop on now, one still ahead, one mended on this walk, and anything else (RI-a / S2)", () => {
    const { result } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    expect(result.current.stopOf(WAGON)).toBe("current");
    expect(result.current.stopOf(LANTERN)).toBe("later");
    expect(result.current.stopOf(FLOWERS)).toBe("later");
    expect(result.current.stopOf("rune:old-tree")).toBeNull();
    // Passed and not mended: not a stop any more, so its own board opens.
    act(() => result.current.setAt(1));
    expect(result.current.stopOf(WAGON)).toBeNull();
    expect(result.current.stopOf(LANTERN)).toBe("current");
    // "done" is by `mended` only.
    act(() => result.current.markMended(WAGON));
    expect(result.current.stopOf(WAGON)).toBe("done");
    // A mended current stop is still the current one.
    act(() => result.current.markMended(LANTERN));
    expect(result.current.stopOf(LANTERN)).toBe("current");
  });

  it("casts by the stop's index alone, mended or not (RI-a / B1)", () => {
    const { result } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    expect(result.current.casts(WAGON)).toBe(true);
    expect(result.current.casts(LANTERN)).toBe(false);
    act(() => result.current.markMended(WAGON));
    expect(result.current.casts(WAGON)).toBe(true);
    act(() => result.current.setAt(1));
    expect(result.current.casts(WAGON)).toBe(false);
    expect(result.current.casts(LANTERN)).toBe(true);
  });

  it("markMended keeps each object once", () => {
    const { result } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    act(() => result.current.markMended(WAGON));
    const once = result.current.mended;
    act(() => result.current.markMended(WAGON));
    expect(result.current.mended).toBe(once);
    expect(result.current.mended).toEqual([WAGON]);
  });

  it("the canvas names the stops still ahead and what is mended, the same object until either changes", () => {
    const { result, rerender } = setup();
    expect(result.current.canvas).toBeNull();
    act(() => result.current.begin(run, bram, "mill"));
    const first = result.current.canvas;
    expect(first).toEqual({ named: [WAGON, LANTERN, FLOWERS], mended: [] });
    rerender({ kind: "pause" });
    expect(result.current.canvas).toBe(first);
    act(() => result.current.markMended(WAGON));
    expect(result.current.canvas).toEqual({ named: [WAGON, LANTERN, FLOWERS], mended: [WAGON] });
    const second = result.current.canvas;
    // A passed stop wears no mark: it is no longer one the walk is going to.
    act(() => result.current.setAt(1));
    expect(result.current.canvas).not.toBe(second);
    expect(result.current.canvas).toEqual({ named: [LANTERN, FLOWERS], mended: [WAGON] });
  });

  it("a walk picked back up at its finish step (every word cast) marks nothing on the canvas (fix round 1)", () => {
    const { result } = setup();
    act(() => result.current.begin(runeWalkRun({ responses: ["r:1", "r:1", "r:1"] }), bram, "mill"));
    act(() => result.current.setAt(2));
    expect(result.current.canvas).toEqual({ named: [], mended: [] });
    // One still to cast (or open on a second chance) keeps its mark.
    act(() => result.current.begin(runeWalkRun({ responses: ["r:1", "r:1", null] }), bram, "mill"));
    act(() => result.current.setAt(2));
    expect(result.current.canvas).toEqual({ named: [FLOWERS], mended: [] });
    act(() => result.current.begin(runeWalkRun({ responses: ["r:1", "r:1", null], pending: { index: 2, ruledOut: "r:2", hint: "h" } }), bram, "mill"));
    act(() => result.current.setAt(2));
    expect(result.current.canvas).toEqual({ named: [FLOWERS], mended: [] });
  });

  it("finish moves the run to walked, for its villager, and clears the walk and its marks", () => {
    const { result, rerender } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    act(() => result.current.markMended(WAGON));
    act(() => result.current.finish(RUNE_WALK_SUMMARY));
    rerender({ kind: "interact" });
    expect(result.current.walk).toBeNull();
    expect(result.current.walked).toEqual({ villagerId: "bram", run, summary: RUNE_WALK_SUMMARY });
    expect(result.current.mended).toEqual([]);
    expect(result.current.canvas).toBeNull();
  });

  it("walked is cleared once the overlay is no longer the villager's board (F-8)", () => {
    const { result, rerender } = setup();
    act(() => result.current.begin(run, bram, "mill"));
    act(() => result.current.finish(RUNE_WALK_SUMMARY));
    rerender({ kind: "interact" });
    expect(result.current.walked).not.toBeNull();
    rerender({ kind: null });
    expect(result.current.walked).toBeNull();
  });

  it("keeps its functions and the say ref the same across renders", () => {
    const { result, rerender } = setup();
    const first = result.current;
    act(() => result.current.begin(run, bram, "mill"));
    rerender({ kind: "pause" });
    for (const k of ["begin", "finish", "leave", "clearWalked", "setAt", "markMended", "sayRef"] as const) expect(result.current[k], k).toBe(first[k]);
  });
});
