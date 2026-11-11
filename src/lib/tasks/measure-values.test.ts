import { describe, expect, it } from "vitest";
import { firstTryText, labelValue, piecesExpression, rulerTicks, stepLength, stepSizes } from "./measure-values";

describe("the bench's arithmetic on what the child can see", () => {
  it("reads a piece's length off its label", () => {
    expect(labelValue("4 blocks")).toBe(4);
    expect(labelValue("3/4 foot")).toBe(0.75);
    expect(labelValue("1.25 feet")).toBe(1.25);
    expect(labelValue("a plank")).toBeNull();
  });

  it("writes the picked pieces as a sum to work out, in the order offered, never with its total (RC-k)", () => {
    const pieces = ["1/2 foot", "3/4 foot", "1/4 foot"];
    expect(piecesExpression(pieces, [])).toBe("");
    expect(piecesExpression(pieces, [2, 0])).toBe("1/2 + 1/4");
    expect(piecesExpression(["4 blocks", "5 blocks"], [1])).toBe("5");
    expect(piecesExpression(pieces, [2, 0])).not.toMatch(/=|3\/4/);
  });

  it("offers whole steps, the task's own step, and tens on a long ruler, each once", () => {
    expect(stepSizes({ step: "1", maxLength: "20" })).toEqual(["1"]);
    expect(stepSizes({ step: "1/4", maxLength: "2" })).toEqual(["1", "1/4"]);
    expect(stepSizes({ step: "0.01", maxLength: "150" })).toEqual(["10", "1", "0.01"]);
    expect(stepSizes({ step: "10", maxLength: "500" })).toEqual(["10", "1"]);
    expect(stepSizes({ step: "10.0", maxLength: "500" })).toEqual(["10", "1"]);
    expect(stepSizes({})).toEqual(["1"]);
  });

  it("ticks a ruler at the task's step, or at a round multiple of it on a long ruler", () => {
    expect(rulerTicks(2, "1/4")).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]); // a quarter-foot ruler to 2: 9 ticks at quarters
    expect(rulerTicks(10, "1")).toHaveLength(11);
    const hundred = rulerTicks(100, "1");
    expect(hundred.length).toBeGreaterThanOrEqual(9);
    expect(hundred.length).toBeLessThanOrEqual(12);
    expect(hundred.every((t) => Number.isInteger(t))).toBe(true);
    const tenths = rulerTicks(5, "0.1"); // 50 tenths: a round multiple of a tenth instead
    expect(tenths.length).toBeLessThanOrEqual(12);
    expect(tenths.every((t) => Math.abs(t * 10 - Math.round(t * 10)) < 1e-9)).toBe(true);
    const long = rulerTicks(150);
    expect(long[long.length - 1]).toBe(150);
  });

  it("steps from nothing as from 0, in the step's notation, never below 0", () => {
    expect(stepLength("", "1/4", 1)).toBe("1/4");
    expect(stepLength("1/4", "1", 1)).toBe("1 1/4");
    expect(stepLength("0.1", "0.1", 1)).toBe("0.2");
    expect(stepLength("", "1", -1)).toBe("0");
    expect(stepLength("1/4", "1", -1)).toBe("0");
    expect(stepLength("oops", "1", 1)).toBe("1");
  });

  it("never steps past the ruler, and leaves a typed length already past it alone", () => {
    expect(stepLength("1 3/4", "1", 1, "2")).toBe("2");
    expect(stepLength("2", "1/4", 1, "2")).toBe("2");
    expect(stepLength("3", "1/4", 1, "2")).toBe("3");
    expect(stepLength("3", "1/4", -1, "2")).toBe("2 3/4");
  });

  it("says a first try back in the child's own terms", () => {
    expect(firstTryText({ pieces: ["4 blocks", "6 blocks", "5 blocks"] }, "a:0,2")).toBe("4 blocks + 5 blocks");
    // The length box is labelled with the unit, so a length goes without it.
    expect(firstTryText({}, "c:1/2")).toBe("1/2");
    expect(firstTryText({}, "nonsense")).toBeNull();
  });
});
