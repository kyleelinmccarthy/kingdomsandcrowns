import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { villagerById } from "@/lib/realm/villagers";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { useTrailWalk } from "./use-trail-walk";

const clue = (n: number) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt: `Clue ${n}.`, view: {} });
const run: RunStart = {
  runId: "r1",
  deed: { id: "well-signs", title: "Signs for the Well", story: "The sign-painter left clues.", area: "reading" },
  questions: [clue(1), clue(2)],
  responses: [null, null],
  kind: "deed",
  pending: null,
};
const summary: RunSummary = {
  correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 3, counted: true, crowned: false, kind: "deed",
  building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 9, practice: false }, minutesEarned: 3, sideQuestPayFull: false,
};
const bram = villagerById("bram")!;

function setup(initial: string | null = null) {
  return renderHook(({ kind }: { kind: string | null }) => useTrailWalk(kind), { initialProps: { kind: initial } });
}

describe("useTrailWalk", () => {
  it("starts with no walk, nothing walked and nothing revealed", () => {
    const { result } = setup();
    expect(result.current.walk).toBeNull();
    expect(result.current.walked).toBeNull();
    expect(result.current.revealed).toBeNull();
    expect(result.current.answerRef.current).toBeNull();
  });

  it("begin sets the walk and bumps its key, and clears what was revealed", () => {
    const { result } = setup();
    act(() => result.current.reveal("landmark:mill"));
    act(() => result.current.begin(run, bram, "well"));
    expect(result.current.walk).toEqual({ key: 1, run, villager: bram, buildingId: "well" });
    expect(result.current.revealed).toBeNull();
    act(() => result.current.begin(run, bram, "well"));
    expect(result.current.walk?.key).toBe(2);
  });

  it("finish moves the run to walked, for its villager, and clears the walk", () => {
    const { result, rerender } = setup();
    act(() => result.current.begin(run, bram, "well"));
    act(() => result.current.reveal("landmark:mill"));
    act(() => result.current.finish(summary));
    rerender({ kind: "interact" });
    expect(result.current.walk).toBeNull();
    expect(result.current.walked).toEqual({ villagerId: "bram", run, summary });
    expect(result.current.revealed).toBeNull();
  });

  it("finish with no walk on does nothing", () => {
    const { result } = setup();
    act(() => result.current.finish(summary));
    expect(result.current.walked).toBeNull();
  });

  it("walked is cleared once the overlay is no longer the villager's board: Esc, the dim or its own close (F-8)", () => {
    const { result, rerender } = setup();
    act(() => result.current.begin(run, bram, "well"));
    // The frame finishes and opens the board in one go.
    act(() => result.current.finish(summary));
    rerender({ kind: "interact" });
    expect(result.current.walked).not.toBeNull();
    rerender({ kind: null });
    expect(result.current.walked).toBeNull();
    // Opening a board again does not bring it back.
    rerender({ kind: "interact" });
    expect(result.current.walked).toBeNull();
  });

  it("walked is cleared when the board gives way to another overlay too (the pause menu)", () => {
    const { result, rerender } = setup("interact");
    act(() => result.current.begin(run, bram, "well"));
    act(() => result.current.finish(summary));
    expect(result.current.walked).not.toBeNull();
    rerender({ kind: "pause" });
    expect(result.current.walked).toBeNull();
  });

  it("clearWalked clears it at once", () => {
    const { result } = setup("interact");
    act(() => result.current.begin(run, bram, "well"));
    act(() => result.current.finish(summary));
    act(() => result.current.clearWalked());
    expect(result.current.walked).toBeNull();
  });

  it("leave clears the walk and what was revealed, and walks nothing", () => {
    const { result } = setup();
    act(() => result.current.begin(run, bram, "well"));
    act(() => result.current.reveal("landmark:mill"));
    expect(result.current.revealed).toBe("landmark:mill");
    act(() => result.current.leave());
    expect(result.current.walk).toBeNull();
    expect(result.current.revealed).toBeNull();
    expect(result.current.walked).toBeNull();
  });

  it("keeps its functions and the answer ref the same across renders, so the frame's callbacks stay stable", () => {
    const { result, rerender } = setup();
    const first = result.current;
    act(() => result.current.begin(run, bram, "well"));
    rerender({ kind: "pause" });
    for (const k of ["begin", "finish", "leave", "reveal", "clearWalked", "answerRef"] as const) expect(result.current[k], k).toBe(first[k]);
  });
});
