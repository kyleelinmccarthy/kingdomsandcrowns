import { describe, it, expect } from "vitest";
import { withRewards } from "./quest-rewards";

describe("withRewards", () => {
  it("attaches each assignment's reward and leaves the others as they were", () => {
    const a = { assignment: { id: "a1" } };
    const b = { assignment: { id: "a2" } };
    const out = withRewards([a, b], { a1: { made: "+1 Ink", minutes: 5 } });
    expect(out[0]).toEqual({ assignment: { id: "a1" }, rewards: { made: "+1 Ink", minutes: 5 } });
    expect(out[1]).toBe(b);
    expect(a).toEqual({ assignment: { id: "a1" } });
  });

  it("is the assignments untouched for no rewards, and never reads an inherited key", () => {
    const a = { assignment: { id: "constructor" } };
    expect(withRewards([a], {})).toEqual([a]);
  });
});
