import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { EMPTY_WORLD_STATE, worldCanvas, type WorldStateView } from "@/lib/realm/world-state";
import { useWorldState } from "./use-world-state";

/**
 * The frame's hold on the world's locks: the bundle's view for the visit, mirrored on the client as
 * locks open, and the canvas the scene draws from, which must stay the same object until what it
 * draws changes (the memoised `World` builds its E spots from it).
 */
const VIEW: WorldStateView = { locksOn: true, open: ["door:longwater"], decor: ["sundial"], tower: [{ band: "g45", open: true, solved: 1 }] };

describe("useWorldState", () => {
  it("starts from the bundle's view, and draws it", () => {
    const { result } = renderHook(() => useWorldState(VIEW));
    expect(result.current.view).toBe(VIEW);
    expect(result.current.canvas).toEqual(worldCanvas(VIEW));
  });

  it("is the empty state when the bundle sent none", () => {
    const { result } = renderHook(() => useWorldState(undefined));
    expect(result.current.view).toBe(EMPTY_WORLD_STATE);
    expect(result.current.canvas).toEqual({ locksOn: false, locks: [], decor: [], storeys: 0 });
  });

  it("keeps the canvas the same object across a re-render, and across an equal bundle", () => {
    const { result, rerender } = renderHook(({ v }) => useWorldState(v), { initialProps: { v: VIEW } });
    const first = result.current.canvas;
    rerender({ v: VIEW });
    expect(result.current.canvas).toBe(first);
    rerender({ v: { ...VIEW, open: [...VIEW.open] } });
    expect(result.current.canvas).toBe(first);
  });

  it("an opening gives a new canvas with that chest open, and the decoration it gave", () => {
    const { result } = renderHook(() => useWorldState(VIEW));
    const first = result.current.canvas;
    act(() => result.current.applyWorldOutcome({ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] }));
    expect(result.current.canvas).not.toBe(first);
    expect(result.current.canvas.locks.find((l) => l.id === "chest:west-lane")!.open).toBe(true);
    expect(result.current.canvas.decor).toEqual(["stone-bench", "sundial"]);
    expect(result.current.view.open).toEqual(["chest:west-lane", "door:longwater"]);
  });

  it("a miss changes nothing, and the canvas stays the same object", () => {
    const { result } = renderHook(() => useWorldState(VIEW));
    const first = result.current.canvas;
    act(() => result.current.applyWorldOutcome({ objectId: "chest:west-lane", opened: false, reason: "missed", rewards: [] }));
    expect(result.current.view).toBe(VIEW);
    expect(result.current.canvas).toBe(first);
  });

  it("keeps applyWorldOutcome the same function across renders", () => {
    const { result, rerender } = renderHook(() => useWorldState(VIEW));
    const first = result.current.applyWorldOutcome;
    rerender();
    expect(result.current.applyWorldOutcome).toBe(first);
  });
});
