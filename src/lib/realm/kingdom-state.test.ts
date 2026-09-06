import { describe, it, expect } from "vitest";
import { applyDeedResult, type KingdomState } from "./kingdom-state";

const state: KingdomState = {
  tone: "gentle",
  buildings: [
    { id: "well", label: "Village Well", description: "", icon: "box", done: 4, total: 5, complete: false, deeds: [] },
    { id: "mill", label: "Grain Mill", description: "", icon: "compass", done: 5, total: 5, complete: true, deeds: [] },
  ],
};

describe("applyDeedResult", () => {
  it("patches the building's progress and reports a rise when it completes", () => {
    const { state: next, rose } = applyDeedResult(state, "well", { done: 5, total: 5, complete: true });
    expect(rose).toBe(true);
    expect(next.buildings[0]).toMatchObject({ id: "well", done: 5, complete: true, label: "Village Well" });
    expect(next.buildings[1]).toBe(state.buildings[1]);
    expect(state.buildings[0].done).toBe(4);
  });

  it("does not report a rise for progress short of complete or for an already built site", () => {
    expect(applyDeedResult(state, "well", { done: 4, total: 5, complete: false }).rose).toBe(false);
    expect(applyDeedResult(state, "mill", { done: 5, total: 5, complete: true }).rose).toBe(false);
  });

  it("returns the same state for an unknown building", () => {
    const { state: next, rose } = applyDeedResult(state, "nope", { done: 1, total: 5, complete: false });
    expect(next).toBe(state);
    expect(rose).toBe(false);
  });
});
