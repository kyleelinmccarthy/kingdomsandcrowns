import { describe, it, expect } from "vitest";
import { applyDeedResult, type KingdomState } from "./kingdom-state";

const state: KingdomState = {
  tone: "gentle",
  buildings: [
    { id: "well", label: "Village Well", description: "", icon: "box", done: 4, total: 5, complete: false, stars: 4, maxStars: 9, deeds: [{ id: "well-stones", title: "T", story: "S", area: "math", bestStars: 1, crowned: false }] },
    { id: "mill", label: "Grain Mill", description: "", icon: "compass", done: 5, total: 5, complete: true, stars: 9, maxStars: 9, deeds: [] },
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

  it("copies the building's stars and the deed's new best", () => {
    const { state: next } = applyDeedResult(state, "well", { done: 5, total: 5, complete: true, stars: 6, maxStars: 9 }, { id: "well-stones", bestStars: 3 });
    expect(next.buildings[0]).toMatchObject({ stars: 6, maxStars: 9 });
    expect(next.buildings[0].deeds[0]).toMatchObject({ id: "well-stones", bestStars: 3 });
    expect(state.buildings[0].deeds[0].bestStars).toBe(1);
  });

  it("keeps the stars it had when the result carries none", () => {
    expect(applyDeedResult(state, "well", { done: 5, total: 5, complete: true }).state.buildings[0]).toMatchObject({ stars: 4, maxStars: 9 });
  });

  it("returns the same state for an unknown building", () => {
    const { state: next, rose } = applyDeedResult(state, "nope", { done: 1, total: 5, complete: false });
    expect(next).toBe(state);
    expect(rose).toBe(false);
  });
});
