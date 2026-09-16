/**
 * NOT duplicate coverage — do not delete this file as overlapping `drill-verify.test.ts`.
 *
 * The two files check different things. `drill-verify.test.ts` proves the ANSWER KEY is
 * right, for every generator, against an independently written oracle. This file proves
 * everything else, and it is the only place holding:
 *
 *   - per-skill difficulty ceilings — `add-10`/`add-20`/`add-100` sum caps, `sub-*` caps and
 *     non-negative results, `mul`/`div` fact limits with `a % b === 0`, `integer-ops`
 *     magnitude limits and its plus/minus-only rule below level 3, `place-value` digit counts,
 *     `percent-of` wholeness and its level-0 constraints, `one-step-eq`'s level-0 form.
 *     Nothing in the verifier harness bounds difficulty: a generator handing a kindergartener
 *     `97 + 84` passes it clean.
 *   - `fractions-compare` offering four distinct VALUES, not merely four distinct strings —
 *     `1/2` and `2/4` together would pass the harness and make "the largest" ambiguous.
 *   - unit tests for `seededRng`, `numericDistractors` and `shuffle`. The entire harness's
 *     determinism rests on `seededRng` and nothing else tests it.
 *   - that `q.id` carries its parameters.
 *
 * A review mutation confirmed the split: with the harness's choice assertions weakened, a
 * `place-value` generator emitting a duplicate choice is caught HERE and nowhere else.
 */
import { describe, it, expect } from "vitest";
import { GENERATORS, seededRng, numericDistractors, shuffle, type Question } from "./drill-generators";
import { SKILLS } from "./skills";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

function evalArith(prompt: string): number | null {
  const m = prompt.match(/^What is (-?\d+) ([+\-×÷]) (-?\d+)\?$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  switch (m[2]) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return a / b;
  }
  return null;
}

function expectWellFormed(q: Question) {
  expect(q.choices).toHaveLength(4);
  expect(new Set(q.choices).size).toBe(4);
  expect(q.choices).toContain(q.answer);
  expect(q.id).toContain(":");
}

describe("seededRng", () => {
  it("is deterministic and in [0,1)", () => {
    const a = seededRng(7), b = seededRng(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});

describe("helpers", () => {
  it("numericDistractors gives three distinct values that are not the answer and respect min", () => {
    for (const seed of SEEDS) {
      const d = numericDistractors(12, seededRng(seed), 0);
      expect(d).toHaveLength(3);
      expect(new Set(d).size).toBe(3);
      expect(d).not.toContain("12");
      for (const x of d) expect(Number(x)).toBeGreaterThanOrEqual(0);
    }
  });
  it("shuffle keeps the multiset", () => {
    expect([...shuffle([1, 2, 3, 4], seededRng(3))].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("arithmetic generators", () => {
  const cases: [string, string, (a: number, b: number, lvl: number) => void][] = [
    ["add", "add-10", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([5, 6, 8, 9, 10][lvl])],
    ["add", "add-20", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([10, 12, 15, 18, 20][lvl])],
    ["add", "add-100", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([20, 40, 60, 80, 100][lvl])],
    ["sub", "sub-10", (a, b, lvl) => { expect(a).toBeLessThanOrEqual([5, 6, 8, 9, 10][lvl]); expect(a - b).toBeGreaterThanOrEqual(0); }],
    ["sub", "sub-20", (a, b, lvl) => { expect(a).toBeLessThanOrEqual([10, 12, 15, 18, 20][lvl]); expect(a - b).toBeGreaterThanOrEqual(0); }],
    ["mul", "mul-facts", (a, b, lvl) => { expect(Math.max(a, b)).toBeLessThanOrEqual([2, 4, 6, 9, 12][lvl]); }],
    ["div", "div-facts", (a, b, lvl) => { expect(b).toBeLessThanOrEqual([2, 4, 6, 9, 12][lvl]); expect(a % b).toBe(0); }],
    ["integer-ops", "integer-ops", (a, b, lvl) => { expect(Math.abs(a)).toBeLessThanOrEqual([10, 20, 30, 40, 50][lvl]); expect(Math.abs(b)).toBeLessThanOrEqual([10, 20, 30, 40, 50][lvl]); }],
  ];
  for (const [gen, skillId, check] of cases) {
    it(`${gen} for ${skillId} is correct and in range at every level`, () => {
      for (const lvl of LEVELS) for (const seed of SEEDS) {
        const q = GENERATORS[gen](lvl, seededRng(seed), skillId);
        expectWellFormed(q);
        const m = q.prompt.match(/^What is (-?\d+) [+\-×÷] (-?\d+)\?$/);
        expect(m).not.toBeNull();
        expect(Number(q.answer)).toBe(evalArith(q.prompt));
        check(Number(m![1]), Number(m![2]), lvl);
      }
    });
  }
  it("integer-ops uses only + and - below level 3", () => {
    for (const lvl of [0, 1, 2]) for (const seed of SEEDS) {
      expect(GENERATORS["integer-ops"](lvl, seededRng(seed), "integer-ops").prompt).not.toContain("×");
    }
  });
});

describe("place-value", () => {
  it("asks about a real digit and widens with level", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["place-value"](lvl, seededRng(seed), "place-value");
      expectWellFormed(q);
      const m = q.prompt.match(/^What digit is in the (ones|tens|hundreds|thousands|ten-thousands|hundred-thousands) place of ([\d,]+)\?$/);
      expect(m).not.toBeNull();
      const digits = m![2].replace(/,/g, "");
      expect(digits.length).toBe([2, 3, 4, 5, 6][lvl]);
      const idx = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"].indexOf(m![1]);
      expect(q.answer).toBe(digits[digits.length - 1 - idx]);
    }
  });
});

describe("fractions-compare", () => {
  it("answers with the largest of four distinct fractions", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["fractions-compare"](lvl, seededRng(seed), "fractions-compare");
      expectWellFormed(q);
      const vals = q.choices.map((c) => { const [n, d] = c.split("/").map(Number); return n / d; });
      expect(new Set(vals).size).toBe(4);
      const [an, ad] = q.answer.split("/").map(Number);
      expect(an / ad).toBe(Math.max(...vals));
    }
  });
});

describe("percent-of", () => {
  it("has whole-number answers and honors level ranges", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["percent-of"](lvl, seededRng(seed), "percent-of");
      expectWellFormed(q);
      const m = q.prompt.match(/^What is (\d+)% of (\d+)\?$/);
      expect(m).not.toBeNull();
      const p = Number(m![1]), n = Number(m![2]);
      expect((p * n) % 100).toBe(0);
      expect(Number(q.answer)).toBe((p * n) / 100);
      if (lvl === 0) { expect([10, 50]).toContain(p); expect(n % 10).toBe(0); expect(n).toBeLessThanOrEqual(100); }
      expect(n).toBeLessThanOrEqual([100, 200, 300, 400, 500][lvl]);
    }
  });
});

describe("read-aloud", () => {
  /**
   * Driven by the SKILLS table, not by `Object.entries(GENERATORS)`. A generator is handed a
   * SKILL id, and several of them serve more than one skill off different parameter rows —
   * `add` serves three, `mul-multi` serves two grades. Passing the generator's own id, as
   * this used to, exercised a fallback branch instead of any real row, and one generator
   * does not have a fallback to exercise at all. Every generator still has at least one
   * skill pointing at it, which `drill-verify.test.ts` asserts, so nothing loses coverage.
   */
  it("never speaks raw math symbols, across every skill and level", () => {
    for (const skill of SKILLS) {
      if (skill.source.kind !== "generator") continue;
      const generator = GENERATORS[skill.source.generatorId];
      for (const lvl of LEVELS) {
        for (let seed = 1; seed <= 10; seed++) {
          const q = generator(lvl, seededRng(seed), skill.id);
          if (!q.readAloud) continue;
          for (const bad of ["×", "÷", "%", "- -"]) expect(q.readAloud).not.toContain(bad);
        }
      }
    }
  });
});

describe("one-step-eq", () => {
  it("has an integer solution that satisfies the equation", () => {
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["one-step-eq"](lvl, seededRng(seed), "one-step-eq");
      expectWellFormed(q);
      const x = Number(q.answer);
      const add = q.prompt.match(/^Solve for x: x \+ (-?\d+) = (-?\d+)$/);
      const sub = q.prompt.match(/^Solve for x: x - (-?\d+) = (-?\d+)$/);
      const mul = q.prompt.match(/^Solve for x: (-?\d+)x = (-?\d+)$/);
      // There are four one-step equations, not three. Dividing by a constant is the fourth,
      // and it is what separates the top rung from the one below, which used to draw from
      // exactly the same 1047 equations.
      const div = q.prompt.match(/^Solve for x: x \/ (-?\d+) = (-?\d+)$/);
      expect(add || sub || mul || div, q.prompt).toBeTruthy();
      if (add) expect(x + Number(add[1])).toBe(Number(add[2]));
      if (sub) expect(x - Number(sub[1])).toBe(Number(sub[2]));
      if (mul) expect(Number(mul[1]) * x).toBe(Number(mul[2]));
      if (div) expect(x / Number(div[1])).toBe(Number(div[2]));
      if (lvl === 0) expect(add).toBeTruthy();
      if (lvl <= 3) expect(div, `level ${lvl} divided: ${q.prompt}`).toBeNull();
    }
    // And division is genuinely reachable at level 4, or the rung is decoration.
    const divided = SEEDS
      .map((seed) => GENERATORS["one-step-eq"](4, seededRng(seed), "one-step-eq"))
      .filter((q) => / \/ /.test(q.prompt));
    expect(divided.length, "level 4 never divides").toBeGreaterThan(0);
    // `/` is fine on screen and unspeakable: read-aloud says "divided by".
    for (const q of divided) expect(q.readAloud, q.readAloud).toContain("divided by");
  });
});
