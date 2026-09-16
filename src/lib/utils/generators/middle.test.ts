/**
 * Range and ladder checks for grades 6 and 7.
 *
 * `drill-verify.test.ts` proves the ANSWER KEY against an independent reading of the
 * prompt; nothing there bounds difficulty, so a generator handing a sixth-grader a circle
 * of radius 400 passes it clean. This file holds the per-level ceilings, the collision
 * guards each generator depends on, and the mistakes each one must actually offer.
 */
import { describe, it, expect } from "vitest";
import {
  circleMeasure,
  evalExpr,
  fracDiv,
  percentChange,
  proportion,
  rationalOps,
  ratioRate,
  twoStepEq,
} from "./middle";
import { seededRng, type Question, type Rng } from "../drill-generators";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 31 + 5);

function draws(gen: (l: number, r: Rng, s: string) => Question, level: number, skillId: string): Question[] {
  return SEEDS.flatMap((seed) => {
    const rng = seededRng(seed);
    return Array.from({ length: 5 }, () => gen(level, rng, skillId));
  });
}

/** "3/4" or "-3/4" or "2" as a number, so two choices are compared by VALUE not spelling. */
const value = (f: string) => {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(f);
  if (!m) throw new Error(`not a fraction: ${f}`);
  return Number(m[1]) / (m[2] === undefined ? 1 : Number(m[2]));
};

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

describe("ratio-rate", () => {
  it("divides exactly, inside the level's ceiling, and never at a speed of one", () => {
    const max = [60, 120, 240, 360, 500];
    for (const lvl of LEVELS) {
      for (const q of draws(ratioRate, lvl, "ratio-rate")) {
        const [miles, hours] = /travels (\d+) miles in (\d+) hours/.exec(q.prompt)!.slice(1).map(Number);
        expect(miles, q.prompt).toBeLessThanOrEqual(max[lvl]);
        expect(hours, q.prompt).toBeGreaterThanOrEqual(2);
        expect(hours, q.prompt).toBeLessThanOrEqual(12);
        expect(miles % hours, q.prompt).toBe(0);
        // A speed of 1 makes the distance and the time the same number, and the question
        // answers itself without dividing anything.
        expect(Number(q.answer), q.prompt).toBeGreaterThanOrEqual(2);
        expect(Number(q.answer), q.prompt).toBe(miles / hours);
      }
    }
  });

  it("offers multiplying instead of dividing, and the distance left alone", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(ratioRate, lvl, "ratio-rate")) {
        const [miles, hours] = /travels (\d+) miles in (\d+) hours/.exec(q.prompt)!.slice(1).map(Number);
        // Asserted distinct first: `toContain` would pass vacuously if a "mistake" were the
        // answer, which is the shape every silent two-right-answer bug takes.
        expect(new Set([miles / hours, miles * hours, miles]).size, q.prompt).toBe(3);
        expect(q.choices, q.prompt).toContain(String(miles * hours));
        expect(q.choices, q.prompt).toContain(String(miles));
      }
    }
  });
});

describe("frac-div", () => {
  const parse = (q: Question) => /What is (\d+)\/(\d+) ÷ (\d+)\/(\d+)\?/.exec(q.prompt)!.slice(1).map(Number);

  it("divides two proper fractions in lowest terms, inside the level's denominator", () => {
    const dmax = [4, 5, 6, 8, 10];
    for (const lvl of LEVELS) {
      for (const q of draws(fracDiv, lvl, "frac-div")) {
        const [n1, d1, n2, d2] = parse(q);
        for (const [n, d] of [[n1, d1], [n2, d2]]) {
          expect(d, q.prompt).toBeLessThanOrEqual(dmax[lvl]);
          expect(n, q.prompt).toBeGreaterThanOrEqual(1);
          expect(n, q.prompt).toBeLessThan(d);
          expect(gcd(n, d), q.prompt).toBe(1);
        }
      }
    }
  });

  it("never lands on a whole number, so no choice gives itself away", () => {
    // "1" standing among three fractions is pickable without dividing anything — and it is
    // also the one answer that collides with its own reciprocal, which is a distractor.
    for (const lvl of LEVELS) {
      for (const q of draws(fracDiv, lvl, "frac-div")) {
        expect(q.answer, q.prompt).toMatch(/^\d+\/\d+$/);
        for (const c of q.choices) expect(c, q.prompt).toMatch(/^\d+\/\d+$/);
      }
    }
  });

  it("offers four different NUMBERS, and always the multiply-without-inverting mistake", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fracDiv, lvl, "frac-div")) {
        const [n1, d1, n2, d2] = parse(q);
        expect(new Set(q.choices.map(value)).size, `${q.prompt}: ${q.choices.join(", ")}`).toBe(4);
        expect(value(q.answer), q.prompt).toBe((n1 * d2) / (d1 * n2));
        expect((n1 * n2) / (d1 * d2), `${q.prompt} multiplies to its own answer`).not.toBe(value(q.answer));
        expect(q.choices.map(value), q.prompt).toContain((n1 * n2) / (d1 * d2));
      }
    }
  });
});

describe("eval-expr", () => {
  const parse = (q: Question) => {
    const m = /^If x = (-?\d+), what is (\d+)x \+ (\d+)\?$/.exec(q.prompt);
    expect(m, `eval-expr wrote an expression a child cannot read: ${q.prompt}`).not.toBeNull();
    return m!.slice(1).map(Number) as [number, number, number];
  };

  it("never substitutes x into the printed expression", () => {
    // `3x + 5` at x = -3 printed as `3-3 + 5` is a different question, and a child who
    // answered 5 would be right. The letter stays; the value is named once, on its own.
    for (const lvl of LEVELS) {
      for (const q of draws(evalExpr, lvl, "eval-expr")) {
        parse(q);
        expect(q.prompt, q.prompt).not.toMatch(/what is \d+-/);
      }
    }
  });

  it("keeps the coefficient inside the level's ceiling and holds negatives back to level 4", () => {
    const amax = [5, 8, 10, 12, 12];
    for (const lvl of LEVELS) {
      let sawNegative = false;
      for (const q of draws(evalExpr, lvl, "eval-expr")) {
        const [x, a] = parse(q);
        expect(a, q.prompt).toBeGreaterThanOrEqual(2);
        expect(a, q.prompt).toBeLessThanOrEqual(amax[lvl]);
        expect(Math.abs(x), q.prompt).toBeLessThanOrEqual(10);
        if (lvl < 4) expect(x, q.prompt).toBeGreaterThanOrEqual(0);
        if (x < 0) sawNegative = true;
      }
      expect(sawNegative, `level ${lvl}`).toBe(lvl === 4);
    }
  });

  it("answers with the substitution and offers the two readings that are not it", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(evalExpr, lvl, "eval-expr")) {
        const [x, a, b] = parse(q);
        expect(Number(q.answer), q.prompt).toBe(a * x + b);
        // The three readings must be three different NUMBERS, and this is the assertion that
        // says so. When two of them agree the question still has exactly one right answer, so
        // nothing else in the harness notices — but `pickDistinct` has dropped the colliding
        // candidate and filled its slot with an off-by-one, and the question has quietly
        // stopped offering the mistake it exists to catch. A mutation confirmed it: with the
        // generator's guard removed, every other check in this file and in the two harnesses
        // stayed green.
        expect(new Set([a * x + b, a + x + b, a * b + x]).size, q.prompt).toBe(3);
        expect(q.choices, `${q.prompt} does not offer "3 + x + 5"`).toContain(String(a + x + b));
        expect(q.choices, `${q.prompt} does not offer x in the constant's slot`).toContain(String(a * b + x));
      }
    }
  });
});

describe("proportion", () => {
  const parse = (q: Question) =>
    /^If (\d+) [a-z]+ cost \$(\d+), how much do (\d+) [a-z]+ cost\?$/.exec(q.prompt)!.slice(1).map(Number);

  it("scales by a whole unit price of at least 2, with counts inside the level's ceiling", () => {
    const cmax = [6, 8, 10, 12, 12];
    const umax = [5, 6, 8, 10, 12];
    for (const lvl of LEVELS) {
      for (const q of draws(proportion, lvl, "proportion")) {
        const [n1, cost, n2] = parse(q);
        expect(cost % n1, q.prompt).toBe(0);
        const unit = cost / n1;
        expect(unit, q.prompt).toBeGreaterThanOrEqual(2);
        expect(unit, q.prompt).toBeLessThanOrEqual(umax[lvl]);
        for (const n of [n1, n2]) {
          expect(n, q.prompt).toBeGreaterThanOrEqual(2);
          expect(n, q.prompt).toBeLessThanOrEqual(cmax[lvl]);
        }
        // Equal counts, like a unit price of 1, would make "added the difference" right.
        expect(n1, q.prompt).not.toBe(n2);
        expect(q.answer, q.prompt).toBe(`$${n2 * unit}`);
      }
    }
  });

  it("offers adding the difference and the unit price alone", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(proportion, lvl, "proportion")) {
        const [n1, cost, n2] = parse(q);
        const answer = (cost / n1) * n2;
        expect(cost + (n2 - n1), `${q.prompt} adds the difference to the right answer`).not.toBe(answer);
        expect(cost / n1, `${q.prompt} costs one item the right answer`).not.toBe(answer);
        expect(q.choices, q.prompt).toContain(`$${cost + (n2 - n1)}`);
        expect(q.choices, q.prompt).toContain(`$${cost / n1}`);
      }
    }
  });

  it("names the same item in both halves of the question", () => {
    for (const q of draws(proportion, 3, "proportion")) {
      const m = /^If \d+ ([a-z]+) cost \$\d+, how much do \d+ ([a-z]+) cost\?$/.exec(q.prompt)!;
      expect(m[1], q.prompt).toBe(m[2]);
    }
  });
});

describe("rational-ops", () => {
  const parse = (q: Question) => {
    const m = /^What is (-?)(\d+)\/(\d+) ([+\-]) (\(-)?(\d+)\/(\d+)\)?\?$/.exec(q.prompt);
    expect(m, `rational-ops prompt does not parse: ${q.prompt}`).not.toBeNull();
    return {
      firstNeg: m![1] === "-",
      n1: Number(m![2]), d1: Number(m![3]),
      plus: m![4] === "+",
      secondNeg: m![5] !== undefined,
      n2: Number(m![6]), d2: Number(m![7]),
    };
  };

  it("always puts a sign in the question — that is the whole skill", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(rationalOps, lvl, "rational-ops")) {
        const p = parse(q);
        expect(p.firstNeg || p.secondNeg, `${q.prompt} has no negative operand`).toBe(true);
      }
    }
  });

  it("draws proper fractions in lowest terms inside the level's denominator", () => {
    const dmax = [4, 6, 8, 10, 12];
    for (const lvl of LEVELS) {
      for (const q of draws(rationalOps, lvl, "rational-ops")) {
        const p = parse(q);
        for (const [n, d] of [[p.n1, p.d1], [p.n2, p.d2]]) {
          expect(d, q.prompt).toBeLessThanOrEqual(dmax[lvl]);
          expect(n, q.prompt).toBeLessThan(d);
          expect(gcd(n, d), q.prompt).toBe(1);
        }
      }
    }
  });

  it("answers with a signed fraction, never 0 and never a whole number", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(rationalOps, lvl, "rational-ops")) {
        expect(q.answer, q.prompt).toMatch(/^-?\d+\/\d+$/);
        for (const c of q.choices) expect(c, `${q.prompt}: ${q.choices.join(", ")}`).toMatch(/^-?\d+\/\d+$/);
        expect(new Set(q.choices.map(value)).size, `${q.prompt}: ${q.choices.join(", ")}`).toBe(4);
        const [n, d] = q.answer.split("/").map(Number);
        expect(gcd(Math.abs(n), d), `${q.answer} is not in lowest terms`).toBe(1);
        // Every minus sign ignored must give a DIFFERENT number, or the signs the question
        // is about make no difference to it.
        const p = parse(q);
        const dropped = (p.plus ? p.n1 * p.d2 + p.n2 * p.d1 : p.n1 * p.d2 - p.n2 * p.d1) / (p.d1 * p.d2);
        expect(dropped, `${q.prompt} answers the same with its signs thrown away`).not.toBe(value(q.answer));
      }
    }
  });

  it("speaks a minus sign as the word 'negative'", () => {
    for (const q of draws(rationalOps, 4, "rational-ops")) {
      expect(q.readAloud, q.readAloud).toContain("negative");
      expect(q.readAloud, q.readAloud).not.toMatch(/[-/()]/);
    }
  });
});

describe("percent-change", () => {
  const parse = (q: Question) => {
    const m = /^A price (rises|falls) from \$(\d+) to \$(\d+)\. What is the percent (increase|decrease)\?$/.exec(q.prompt);
    expect(m, `percent-change prompt does not parse: ${q.prompt}`).not.toBeNull();
    return { rises: m![1] === "rises", before: Number(m![2]), after: Number(m![3]), named: m![4] };
  };

  it("moves a round starting price by a whole percent that is never 0", () => {
    const max = [50, 100, 200, 400, 500];
    for (const lvl of LEVELS) {
      for (const q of draws(percentChange, lvl, "percent-change")) {
        const { before, after } = parse(q);
        expect(before % 10, q.prompt).toBe(0);
        expect(before, q.prompt).toBeLessThanOrEqual(max[lvl]);
        expect(before, q.prompt).not.toBe(after);
        expect(after, q.prompt).toBeGreaterThan(0);
        const percent = (Math.abs(after - before) * 100) / before;
        expect(Number.isInteger(percent), q.prompt).toBe(true);
        expect(percent, q.prompt).toBeGreaterThanOrEqual(5);
        expect(q.answer, q.prompt).toBe(`${percent}%`);
      }
    }
  });

  it("never starts from $100, where the difference IS the percent", () => {
    // `p = 100d/b` equals `d` exactly when `b` is 100, and the raw difference is one of the
    // three distractors — so a base of 100 puts the right answer in a wrong answer's slot.
    for (const lvl of LEVELS) {
      for (const q of draws(percentChange, lvl, "percent-change")) {
        const { before, after } = parse(q);
        expect(before, q.prompt).not.toBe(100);
        expect(q.choices, q.prompt).toContain(`${Math.abs(after - before)}%`);
        expect(q.answer, q.prompt).not.toBe(`${Math.abs(after - before)}%`);
      }
    }
  });

  it("offers the change measured against the NEW price — the defining error", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(percentChange, lvl, "percent-change")) {
        const { before, after } = parse(q);
        const wrongBase = Math.round((Math.abs(after - before) * 100) / after);
        expect(q.choices, `${q.prompt} does not offer ${wrongBase}%`).toContain(`${wrongBase}%`);
        expect(q.answer, q.prompt).not.toBe(`${wrongBase}%`);
      }
    }
  });

  it("holds decreases back to level 1, and matches its direction words to the prices", () => {
    for (const lvl of LEVELS) {
      let sawFall = false;
      for (const q of draws(percentChange, lvl, "percent-change")) {
        const { rises, before, after, named } = parse(q);
        expect(rises, q.prompt).toBe(after > before);
        expect(named, q.prompt).toBe(rises ? "increase" : "decrease");
        if (!rises) sawFall = true;
      }
      expect(sawFall, `level ${lvl}`).toBe(lvl >= 1);
    }
  });
});

describe("two-step-eq", () => {
  const parse = (q: Question) => {
    const m = /^Solve for x: (-?\d+)x ([+\-]) (\d+) = (-?\d+)$/.exec(q.prompt);
    expect(m, `two-step-eq prompt does not parse: ${q.prompt}`).not.toBeNull();
    return { a: Number(m![1]), b: m![2] === "+" ? Number(m![3]) : -Number(m![3]), c: Number(m![4]) };
  };

  it("keeps the coefficient inside the level's ceiling and never uses 1 or 0", () => {
    const amax = [5, 5, 9, 9, 9];
    for (const lvl of LEVELS) {
      for (const q of draws(twoStepEq, lvl, "two-step-eq")) {
        const { a, b } = parse(q);
        expect(Math.abs(a), q.prompt).toBeGreaterThanOrEqual(2);
        expect(Math.abs(a), q.prompt).toBeLessThanOrEqual(amax[lvl]);
        // b === 0 and a === 1 are both exactly when "divided before subtracting" comes out
        // right; neither may ever be drawn.
        expect(b, q.prompt).not.toBe(0);
      }
    }
  });

  it("has an integer solution that is never 0, with negatives held back to level 3", () => {
    for (const lvl of LEVELS) {
      let sawNegative = false;
      for (const q of draws(twoStepEq, lvl, "two-step-eq")) {
        const { a, b, c } = parse(q);
        const x = Number(q.answer);
        expect(a * x + b, q.prompt).toBe(c);
        // -0 is 0, so a solution of zero would offer the "sign flipped" distractor twice.
        expect(x, q.prompt).not.toBe(0);
        if (x < 0 || a < 0) sawNegative = true;
      }
      expect(sawNegative, `level ${lvl}`).toBe(lvl >= 3);
    }
  });

  it("offers the sign flipped, and the wrong order whenever a child could reach it", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(twoStepEq, lvl, "two-step-eq")) {
        const { a, b, c } = parse(q);
        const x = Number(q.answer);
        expect(q.choices, q.prompt).toContain(String(-x));
        // Divided before subtracting. Only offered when it lands on a whole number: a child
        // who divides first and gets a fraction notices and starts over.
        if (c % a === 0) {
          expect(c / a - b, `${q.prompt} solves the same either order`).not.toBe(x);
          expect(q.choices, q.prompt).toContain(String(c / a - b));
        }
      }
    }
  });
});

describe("circle-measure", () => {
  const parse = (q: Question) => {
    const m = /^A circle has a (radius|diameter) of (\d+)\. What is its (area|circumference)\? Use 3\.14 for pi\.$/.exec(q.prompt);
    expect(m, `circle prompt does not parse: ${q.prompt}`).not.toBeNull();
    const given = Number(m![2]);
    return { radius: m![1] === "diameter" ? given / 2 : given, area: m![3] === "area", byDiameter: m![1] === "diameter" };
  };

  it("keeps the radius inside the level's ceiling and asks circumference only from level 1", () => {
    const rmax = [7, 8, 9, 10, 12];
    for (const lvl of LEVELS) {
      const asked = new Set<string>();
      for (const q of draws(circleMeasure, lvl, "circle-measure")) {
        const { radius, area } = parse(q);
        expect(Number.isInteger(radius), q.prompt).toBe(true);
        expect(radius, q.prompt).toBeGreaterThanOrEqual(2);
        expect(radius, q.prompt).toBeLessThanOrEqual(rmax[lvl]);
        asked.add(area ? "area" : "circumference");
      }
      expect([...asked].sort(), `level ${lvl}`).toEqual(lvl >= 1 ? ["area", "circumference"] : ["area"]);
    }
  });

  it("gives both a radius and a diameter, so halving is part of the skill", () => {
    for (const lvl of LEVELS) {
      const shapes = new Set(draws(circleMeasure, lvl, "circle-measure").map((q) => (parse(q).byDiameter ? "d" : "r")));
      expect([...shapes].sort(), `level ${lvl}`).toEqual(["d", "r"]);
    }
  });

  it("never draws the two radii where two of the four choices are the same number", () => {
    // r = 2: the area and the circumference are both 12.56, and the other measure is always
    // a distractor. r = 4, circumference: the area (50.24) equals the circumference of a
    // circle of twice the radius (50.24), so two distractors collide.
    for (const lvl of LEVELS) {
      for (const q of draws(circleMeasure, lvl, "circle-measure")) {
        const { radius, area } = parse(q);
        expect(radius, q.prompt).not.toBe(2);
        if (!area) expect(radius, q.prompt).not.toBe(4);
        expect(new Set(q.choices).size, `${q.prompt}: ${q.choices.join(", ")}`).toBe(4);
      }
    }
  });

  it("answers to exactly one decimal place, every choice the same shape", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(circleMeasure, lvl, "circle-measure")) {
        for (const c of q.choices) expect(c, q.prompt).toMatch(/^\d+\.\d$/);
      }
    }
  });

  it("always offers the other measure and the diameter used as the radius", () => {
    // Re-derived here from the radius in the prompt, in hundredths, so the expected values
    // are not the generator's own.
    const tenth = (h: number) => (Math.round(h / 10) / 10).toFixed(1);
    for (const lvl of LEVELS) {
      for (const q of draws(circleMeasure, lvl, "circle-measure")) {
        const { radius, area } = parse(q);
        expect(q.answer, q.prompt).toBe(tenth(area ? 314 * radius * radius : 628 * radius));
        expect(q.choices, q.prompt).toContain(tenth(area ? 628 * radius : 314 * radius * radius));
        expect(q.choices, q.prompt).toContain(tenth(area ? 4 * 314 * radius * radius : 2 * 628 * radius));
      }
    }
  });

  it("speaks pi as a word and never reads out a symbol", () => {
    for (const q of draws(circleMeasure, 4, "circle-measure")) {
      expect(q.readAloud, q.readAloud).toContain("for pi");
      expect(q.readAloud, q.readAloud).toContain("three point one four");
      expect(q.readAloud, q.readAloud).not.toMatch(/[π²^]/);
      expect(q.readAloud, q.readAloud).not.toContain("3.14");
    }
  });
});
