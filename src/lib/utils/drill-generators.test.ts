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
import { GENERATORS, reading, seededRng, numericDistractors, shuffle, spreadDistractors, type Question } from "./drill-generators";
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

  /**
   * `spreadDistractors` is the one piece the whole position census rests on, so it is checked
   * here rather than inferred from the generators that call it.
   */
  describe("spreadDistractors", () => {
    const pool = [-3, -2, -1, 1, 2, 3].map((offset) => reading(10 + offset));

    it("gives three distinct wrong answers, never the right one", () => {
      for (const seed of SEEDS) {
        const out = spreadDistractors(reading(10), pool, seededRng(seed));
        expect(out).toHaveLength(3);
        expect(new Set(out).size).toBe(3);
        expect(out).not.toContain("10");
      }
    });

    /**
     * The point of the helper. With three believable readings either side the answer reaches
     * all four positions, and nothing like the 298-of-300 the named-list census could not see.
     */
    it("puts the answer at every one of the four positions", () => {
      const counts = [0, 0, 0, 0];
      for (const seed of SEEDS) {
        const out = spreadDistractors(reading(10), pool, seededRng(seed));
        counts[out.filter((c) => Number(c) < 10).length] += 1;
      }
      for (const [position, n] of counts.entries()) {
        expect(n, `position ${position + 1} of four came up ${n} times in ${SEEDS.length}: ${counts.join("/")}`).toBeGreaterThan(0);
      }
    });

    /** A reading equal to the answer by value or by spelling is dropped, not offered. */
    it("drops a reading that is the answer under another spelling", () => {
      const out = spreadDistractors(
        { text: "1/2", value: 0.5 },
        [{ text: "2/4", value: 0.5 }, { text: "1/3", value: 1 / 3 }, { text: "2/3", value: 2 / 3 }, { text: "3/4", value: 0.75 }],
        seededRng(7),
      );
      expect(out).not.toContain("2/4");
      expect(out).toHaveLength(3);
    });

    /** A pool that cannot fill three slots says so rather than shipping a repeated choice. */
    it("returns nothing when the pool is too thin", () => {
      expect(spreadDistractors(reading(10), [reading(9), reading(11)], seededRng(1))).toEqual([]);
    });

    /**
     * A thin side never forces a repeated choice or a silent short list: with only one reading
     * below the answer, the draw simply never puts more than one there.
     */
    it("draws only as far as a thin side allows", () => {
      const thin = [reading(9), reading(11), reading(12), reading(13), reading(14)];
      for (const seed of SEEDS) {
        const out = spreadDistractors(reading(10), thin, seededRng(seed));
        expect(out).toHaveLength(3);
        expect(out.filter((c) => Number(c) < 10).length).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe("arithmetic generators", () => {
  const cases: [string, string, (a: number, b: number, lvl: number) => void][] = [
    ["add", "add-10", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([5, 6, 8, 9, 10][lvl])],
    ["add", "add-20", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([10, 12, 15, 18, 20][lvl])],
    ["add", "add-100", (a, b, lvl) => expect(a + b).toBeLessThanOrEqual([20, 40, 60, 80, 100][lvl])],
    ["sub", "sub-10", (a, b, lvl) => { expect(a).toBeLessThanOrEqual([5, 6, 8, 9, 10][lvl]); expect(a - b).toBeGreaterThanOrEqual(0); }],
    ["sub", "sub-20", (a, b, lvl) => { expect(a).toBeLessThanOrEqual([10, 12, 15, 18, 20][lvl]); expect(a - b).toBeGreaterThanOrEqual(0); }],
    // Two ceilings, not one: the TABLE the fact comes from climbs with the level, and the
    // other factor runs to ten from the start. Written out by hand here, as every ceiling in
    // this file is, so widening `mul` has to be a deliberate edit in two places.
    ["mul", "mul-facts", (a, b, lvl) => {
      expect(Math.min(a, b)).toBeLessThanOrEqual([2, 4, 6, 9, 12][lvl]);
      expect(Math.max(a, b)).toBeLessThanOrEqual([10, 10, 12, 12, 12][lvl]);
    }],
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

  /**
   * It was the one live skill with nothing to say. A grade-4 child on the read-aloud profile
   * heard every other skill in their quest and silence on this one. The number is said in
   * words rather than handed over as "276,596", and the words are checked against the digits
   * here — the place name and the numeral both — so a spoken form that drifted from its own
   * prompt is caught rather than merely present.
   */
  it("says its place and its number in words, with nothing a screen reader would mangle", () => {
    const said: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
      fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
      forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
    /** The spoken words read back to a number, so the check never borrows the generator's own. */
    const readBack = (words: string[]): number => {
      let total = 0, group = 0;
      for (const word of words) {
        if (word === "hundred") group *= 100;
        else if (word === "thousand") { total += group * 1000; group = 0; }
        else {
          expect(said[word], `place-value said "${word}", which is not a number`).toBeDefined();
          group += said[word];
        }
      }
      return total + group;
    };
    for (const lvl of LEVELS) for (const seed of SEEDS) {
      const q = GENERATORS["place-value"](lvl, seededRng(seed), "place-value");
      expect(q.readAloud, `level ${lvl} seed ${seed} says nothing`).toBeDefined();
      expect(q.readAloud, q.readAloud).not.toMatch(/[-×÷%²³√π^/¢$,\d]/);
      const spoken = /^What digit is in the ([a-z ]+) place of ([a-z ]+)\?$/.exec(q.readAloud!);
      expect(spoken, `place-value said something a child cannot follow: ${q.readAloud}`).not.toBeNull();
      const printed = q.prompt.match(/^What digit is in the ([a-z-]+) place of ([\d,]+)\?$/)!;
      expect(spoken![1], q.readAloud).toBe(printed[1].replace("-", " "));
      expect(readBack(spoken![2].split(" ")), `${q.readAloud} does not say ${printed[2]}`).toBe(Number(printed[2].replace(/,/g, "")));
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
