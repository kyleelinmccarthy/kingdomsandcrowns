import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { EMPTY_WORLD_STATE, worldCanvas, type WorldStateView } from "@/lib/realm/world-state";
import { useWorldState, type WorldStateOptions } from "./use-world-state";

/**
 * The frame's hold on the world's locks: the bundle's view for the visit, mirrored on the client as
 * locks open, and the canvas the scene draws from, which must stay the same object until what it
 * draws changes (the memoised `World` builds its E spots from it).
 */
const VIEW: WorldStateView = { locksOn: true, open: ["door:longwater"], decor: ["sundial"], tower: [{ band: "g45", open: true, solved: 1 }] };

/** What the frame hands the hook: the places store's add, the toast, the place names, whether a panel is open. */
function options(over: Partial<WorldStateOptions> = {}): WorldStateOptions {
  return { addPlace: vi.fn(), say: vi.fn(), placeName: (id) => (id === "summit-7" ? "Thunder Head" : "a far place"), overlayOpen: false, ...over };
}

describe("useWorldState", () => {
  it("starts from the bundle's view, and draws it", () => {
    const { result } = renderHook(() => useWorldState(VIEW, options()));
    expect(result.current.view).toBe(VIEW);
    expect(result.current.canvas).toEqual(worldCanvas(VIEW));
  });

  it("is the empty state when the bundle sent none", () => {
    const { result } = renderHook(() => useWorldState(undefined, options()));
    expect(result.current.view).toBe(EMPTY_WORLD_STATE);
    expect(result.current.canvas).toEqual({ locksOn: false, locks: [], decor: [], storeys: 0 });
  });

  it("keeps the canvas the same object across a re-render, and across an equal bundle", () => {
    const { result, rerender } = renderHook(({ v }) => useWorldState(v, options()), { initialProps: { v: VIEW } });
    const first = result.current.canvas;
    rerender({ v: VIEW });
    expect(result.current.canvas).toBe(first);
    rerender({ v: { ...VIEW, open: [...VIEW.open] } });
    expect(result.current.canvas).toBe(first);
  });

  it("an opening gives a new canvas with that chest open, and the decoration it gave", () => {
    const { result } = renderHook(() => useWorldState(VIEW, options()));
    const first = result.current.canvas;
    act(() => result.current.applyWorldOutcome({ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] }));
    expect(result.current.canvas).not.toBe(first);
    expect(result.current.canvas.locks.find((l) => l.id === "chest:west-lane")!.open).toBe(true);
    expect(result.current.canvas.decor).toEqual(["stone-bench", "sundial"]);
    expect(result.current.view.open).toEqual(["chest:west-lane", "door:longwater"]);
  });

  it("a miss changes nothing, and the canvas stays the same object", () => {
    const { result } = renderHook(() => useWorldState(VIEW, options()));
    const first = result.current.canvas;
    act(() => result.current.applyWorldOutcome({ objectId: "chest:west-lane", opened: false, reason: "missed", rewards: [] }));
    expect(result.current.view).toBe(VIEW);
    expect(result.current.canvas).toBe(first);
  });

  it("keeps applyWorldOutcome the same function across renders", () => {
    const { result, rerender } = renderHook(() => useWorldState(VIEW, options()));
    const first = result.current.applyWorldOutcome;
    rerender();
    expect(result.current.applyWorldOutcome).toBe(first);
  });

  it("keeps it the same even when the options are new functions each render", () => {
    const { result, rerender } = renderHook(() => useWorldState(VIEW, options()));
    const first = result.current.applyWorldOutcome;
    rerender();
    expect(result.current.applyWorldOutcome).toBe(first);
  });
});

const DOOR = {
  objectId: "door:ringstones",
  opened: true,
  rewards: [{ kind: "fragment" as const, placeId: "summit-7" }, { kind: "lore" as const, id: "ringstones-map" as const }],
};

describe("useWorldState: a map fragment", () => {
  it("marks its place on the map at once, even while a panel is open", () => {
    const o = options({ overlayOpen: true });
    const { result } = renderHook(() => useWorldState(VIEW, o));
    act(() => result.current.applyWorldOutcome(DOOR));
    expect(o.addPlace).toHaveBeenCalledTimes(1);
    expect(o.addPlace).toHaveBeenCalledWith("summit-7");
  });

  it("holds the toast until no panel is open, then says it once", () => {
    const o = options();
    const { result, rerender } = renderHook(({ open }) => useWorldState(VIEW, { ...o, overlayOpen: open }), { initialProps: { open: true } });
    act(() => result.current.applyWorldOutcome(DOOR));
    expect(o.say).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(o.say).not.toHaveBeenCalled();
    rerender({ open: false });
    expect(o.say).toHaveBeenCalledTimes(1);
    expect(o.say).toHaveBeenCalledWith(expect.objectContaining({ title: "You found a map to Thunder Head!", line: "Look for it on your map.", icon: "map" }));
    // Never again: not on a later render, and not when a panel opens and closes.
    rerender({ open: true });
    rerender({ open: false });
    expect(o.say).toHaveBeenCalledTimes(1);
  });

  it("says it straight away when no panel is open", () => {
    const o = options();
    const { result } = renderHook(() => useWorldState(VIEW, o));
    act(() => result.current.applyWorldOutcome(DOOR));
    expect(o.say).toHaveBeenCalledTimes(1);
    expect(o.addPlace).toHaveBeenCalledWith("summit-7");
  });

  it("opens the door in the view too", () => {
    const { result } = renderHook(() => useWorldState(VIEW, options()));
    act(() => result.current.applyWorldOutcome(DOOR));
    expect(result.current.canvas.locks.find((l) => l.id === "door:ringstones")!.open).toBe(true);
  });

  it("does nothing for a chest that gave no map, a miss, or a lock already open", () => {
    const o = options();
    const { result } = renderHook(() => useWorldState(VIEW, o));
    act(() => result.current.applyWorldOutcome({ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] }));
    act(() => result.current.applyWorldOutcome({ objectId: "door:ringstones", opened: false, reason: "missed", rewards: [] }));
    act(() => result.current.applyWorldOutcome({ objectId: "door:longwater", opened: false, reason: "already-open", rewards: [] }));
    expect(o.addPlace).not.toHaveBeenCalled();
    expect(o.say).not.toHaveBeenCalled();
  });

  it("an already-open report opens the lock in the view, with no map and no toast (G3 review 2)", () => {
    const o = options();
    const { result } = renderHook(() => useWorldState(VIEW, o));
    expect(result.current.canvas.locks.find((l) => l.id === "chest:east-lane")!.open).toBe(false);
    act(() => result.current.applyWorldOutcome({ objectId: "chest:east-lane", opened: false, reason: "already-open", rewards: [] }));
    expect(result.current.canvas.locks.find((l) => l.id === "chest:east-lane")!.open).toBe(true);
    expect(result.current.view.open).toContain("chest:east-lane");
    expect(o.addPlace).not.toHaveBeenCalled();
    expect(o.say).not.toHaveBeenCalled();
  });

  it("a solved floor sets its count in the view, and the canvas stays the same object (storeys are unchanged)", () => {
    const { result } = renderHook(() => useWorldState(VIEW, options()));
    const first = result.current.canvas;
    act(() => result.current.applyTowerOutcome({ band: "g45", solved: 2, solvedNow: true }));
    expect(result.current.view.tower).toEqual([{ band: "g45", open: true, solved: 2 }]);
    expect(result.current.canvas).toBe(first);
  });

  it("a missed floor changes nothing, and applyTowerOutcome stays one function", () => {
    const { result, rerender } = renderHook(() => useWorldState(VIEW, options()));
    const apply = result.current.applyTowerOutcome;
    const view = result.current.view;
    act(() => apply({ band: "g45", solved: 1, solvedNow: false }));
    expect(result.current.view).toBe(view);
    rerender();
    expect(result.current.applyTowerOutcome).toBe(apply);
  });

  it("says a held toast through the latest say, not the one from when it was found", () => {
    const first = options({ overlayOpen: true });
    const later = options({ overlayOpen: false });
    const { result, rerender } = renderHook(({ o }) => useWorldState(VIEW, o), { initialProps: { o: first } });
    act(() => result.current.applyWorldOutcome(DOOR));
    rerender({ o: later });
    expect(first.say).not.toHaveBeenCalled();
    expect(later.say).toHaveBeenCalledTimes(1);
  });
});
