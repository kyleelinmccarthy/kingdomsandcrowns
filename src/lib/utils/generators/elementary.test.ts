import { describe, it, expect } from "vitest";
import { compareNum, countSeq, tenMoreLess } from "./elementary";
import { seededRng, type Question, type Rng } from "../drill-generators";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 31 + 5);

/**
 * The shared checks in `drill-verify.test.ts` prove the answer key and the choice shape
 * for every generator. What is left for here is what only these generators promise: the
 * ranges a grade is meant to stay inside, and which phrasings each level may ask.
 */
function draws(gen: (l: number, r: Rng, s: string) => Question, level: number, skillId: string): Question[] {
  return SEEDS.flatMap((seed) => {
    const rng = seededRng(seed);
    return Array.from({ length: 5 }, () => gen(level, rng, skillId));
  });
}

describe("count-seq", () => {
  it("keeps every number it names inside the level's range", () => {
    const max = [5, 10, 15, 20, 20];
    for (const lvl of LEVELS) {
      for (const q of draws(countSeq, lvl, "count-seq")) {
        const n = Number(/comes (?:after|before) (\d+)\?$/.exec(q.prompt)![1]);
        expect(n, q.prompt).toBeGreaterThanOrEqual(1);
        expect(n, q.prompt).toBeLessThanOrEqual(max[lvl] - 1);
        expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(0);
        expect(Number(q.answer), q.prompt).toBeLessThanOrEqual(max[lvl]);
      }
    }
  });

  it("counts forward only until level 3, because counting forward is learned first", () => {
    for (const lvl of [0, 1, 2]) {
      for (const q of draws(countSeq, lvl, "count-seq")) expect(q.prompt).toContain("after");
    }
    // And counting back is genuinely reachable once it is allowed, or the rule above is
    // indistinguishable from a generator that never counts back at all.
    for (const lvl of [3, 4]) {
      expect(draws(countSeq, lvl, "count-seq").some((q) => q.prompt.includes("before")), `level ${lvl}`).toBe(true);
    }
  });

  it("speaks the question it shows", () => {
    for (const q of draws(countSeq, 4, "count-seq")) expect(q.readAloud).toBe(q.prompt);
  });
});

describe("compare-num", () => {
  it.each([
    ["compare-num", [5, 10, 10, 10, 10]],
    ["compare-num-100", [20, 50, 99, 99, 99]],
  ] as [string, number[]][])("keeps %s inside its own ceilings", (skillId, ceilings) => {
    for (const lvl of LEVELS) {
      for (const q of draws(compareNum, lvl, skillId)) {
        expect(q.choices).toHaveLength(4);
        for (const c of q.choices) {
          expect(Number(c), q.choices.join(",")).toBeGreaterThanOrEqual(0);
          expect(Number(c), q.choices.join(",")).toBeLessThanOrEqual(ceilings[lvl]);
        }
      }
    }
  });

  it("gives the same id to the same set however it was drawn, so a miss can be re-asked", () => {
    for (const q of draws(compareNum, 3, "compare-num-100")) {
      const inId = q.id.split(":")[1].split(",");
      expect([...inId].sort((a, b) => Number(a) - Number(b))).toEqual(inId);
      expect([...inId].sort()).toEqual([...q.choices].sort());
    }
  });
});

describe("ten-more-less", () => {
  it("never asks a question whose answer is below zero", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(tenMoreLess, lvl, "ten-more-less")) {
        expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("starts inside the level's range and only takes ten away from level 2", () => {
    const max = [20, 40, 60, 80, 99];
    for (const lvl of LEVELS) {
      for (const q of draws(tenMoreLess, lvl, "ten-more-less")) {
        const n = Number(/than (\d+)\?$/.exec(q.prompt)![1]);
        expect(n, q.prompt).toBeLessThanOrEqual(max[lvl]);
        if (lvl <= 1) expect(q.prompt).toContain("more");
      }
    }
    for (const lvl of [2, 3, 4]) {
      expect(draws(tenMoreLess, lvl, "ten-more-less").some((q) => q.prompt.includes("less")), `level ${lvl}`).toBe(true);
    }
  });
});
