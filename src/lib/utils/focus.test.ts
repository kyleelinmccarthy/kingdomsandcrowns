import { describe, it, expect } from "vitest";
import { FOCUS_MAX, FOCUS_WEIGHT, focusAreasOf, focusWindow, validFocus } from "./focus";
import type { Grade } from "./grade-levels";

const ALL3 = { math: "3", reading: "3", language: "3", science: "3" } as const;

describe("focusWindow", () => {
  it("keeps skills within one grade of the strand's grade, and no others", () => {
    const ids = focusWindow(ALL3).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["add-100", "mul-facts", "place-value"]));
    expect(ids).not.toContain("frac-addsub"); // grade 5, two away
    expect(ids).not.toContain("add-20"); // grade 1, two away
  });

  it("measures each skill against its own strand's grade", () => {
    const grades: Record<"math" | "reading" | "language" | "science", Grade> = { ...ALL3, math: "5" };
    const math = focusWindow(grades)
      .filter((s) => s.area === "math")
      .map((s) => s.id);
    expect(math).toContain("frac-addsub");
    expect(math).not.toContain("mul-facts");
  });

  it("treats K and 1 as one step apart", () => {
    const ids = focusWindow({ ...ALL3, math: "K" }).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["add-10", "add-20"]));
    expect(ids).not.toContain("add-100");
  });

  it("offers logic at the hero's own grade and the one either side", () => {
    const ids = focusWindow({ ...ALL3, logic: "3" }).filter((s) => s.area === "logic").map((s) => s.id);
    expect(ids).toEqual(["logic-g23", "logic-g45"]); // grades 2 and 4, each one step from 3
    const at4 = focusWindow({ ...ALL3, logic: "4" }).filter((s) => s.area === "logic").map((s) => s.id);
    expect(at4).toEqual(["logic-g45"]);
    expect(focusWindow(ALL3).some((s) => s.area === "logic")).toBe(false); // missing from grades: nothing
  });

  it("offers nothing for a strand missing from the grades", () => {
    expect(focusWindow({ math: "3" }).every((s) => s.area === "math")).toBe(true);
    expect(focusWindow({})).toEqual([]);
  });
});

describe("validFocus", () => {
  const window = focusWindow(ALL3);

  it("drops an unknown id and an id two grades away", () => {
    expect(validFocus(["nope", "frac-addsub", "mul-facts"], window)).toEqual(["mul-facts"]);
  });

  it("drops repeats and caps at three", () => {
    const four = window.slice(0, 4).map((s) => s.id);
    expect(validFocus([four[0], four[0], ...four.slice(1)], window)).toEqual(four.slice(0, FOCUS_MAX));
    expect(validFocus(four, window)).toHaveLength(3);
  });

  it("is empty for nothing", () => {
    expect(validFocus([], window)).toEqual([]);
  });
});

describe("constants", () => {
  it("are three and three", () => {
    expect([FOCUS_MAX, FOCUS_WEIGHT]).toEqual([3, 3]);
  });
});

describe("focusAreasOf", () => {
  it("is the distinct strands of the known skills, in first-seen order", () => {
    expect(focusAreasOf(["mul-facts", "div-facts", "sight-k1", "nope"])).toEqual(["math", "reading"]);
    expect(focusAreasOf([])).toEqual([]);
  });
});
