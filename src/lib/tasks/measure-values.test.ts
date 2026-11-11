import { describe, expect, it } from "vitest";
import { firstTryText, labelValue, stepLength, stepSizes, sumOfLabels } from "./measure-values";

describe("the bench's arithmetic on what the child can see", () => {
  it("reads a piece's length off its label", () => {
    expect(labelValue("4 blocks")).toBe(4);
    expect(labelValue("3/4 foot")).toBe(0.75);
    expect(labelValue("1.25 feet")).toBe(1.25);
    expect(labelValue("a plank")).toBeNull();
  });

  it("adds the picked pieces in the labels' own notation", () => {
    expect(sumOfLabels([])).toBe("0");
    expect(sumOfLabels(["4 blocks", "5 blocks"])).toBe("9");
    expect(sumOfLabels(["1/2 foot", "1/4 foot"])).toBe("3/4");
    expect(sumOfLabels(["3/4 foot", "3/4 foot"])).toBe("3/2");
    expect(sumOfLabels(["1.25 feet", "0.5 feet"])).toBe("1.75");
    expect(sumOfLabels(["4 blocks", "a plank"])).toBeNull();
  });

  it("offers whole steps, the task's own step, and tens on a long ruler", () => {
    expect(stepSizes({ step: "1", maxLength: "20" })).toEqual(["1"]);
    expect(stepSizes({ step: "1/4", maxLength: "2" })).toEqual(["1", "1/4"]);
    expect(stepSizes({ step: "0.01", maxLength: "150" })).toEqual(["10", "1", "0.01"]);
    expect(stepSizes({})).toEqual(["1"]);
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
