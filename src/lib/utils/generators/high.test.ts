/**
 * Range and ladder checks for grade 9 — Algebra I.
 *
 * `drill-verify.test.ts` proves the ANSWER KEY against an independent reading of the prompt;
 * nothing there bounds difficulty, and nothing there knows which mistakes a skill is supposed
 * to put on screen. This file holds the per-level ceilings, the collision guards each
 * generator depends on, and the characteristic errors each one must actually offer.
 *
 * Every "offers the mistake" check asserts the mistake is DIFFERENT from the answer before it
 * asserts it is among the choices. `pickDistinct` skips a candidate equal to the answer and
 * backfills the slot, so a bare `toContain` would keep passing while the question quietly
 * stopped testing anything.
 */
import { describe, it, expect } from "vitest";
import { factorQuad, inequalities, multiStepEq, slopeIntercept, systemsEq } from "./high";
import { seededRng, type Question, type Rng } from "../drill-generators";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 31 + 5);

function draws(gen: (l: number, r: Rng, s: string) => Question, level: number, skillId: string): Question[] {
  return SEEDS.flatMap((seed) => {
    const rng = seededRng(seed);
    return Array.from({ length: 5 }, () => gen(level, rng, skillId));
  });
}

describe("multi-step-eq", () => {
  const A_MAX = [3, 4, 5, 5, 5];
  const C_MAX = [3, 4, 5, 6, 6];
  const B_MAX = [5, 6, 8, 9, 9];

  const parse = (q: Question) => {
    const m = /^Solve for x: (\d+)\(x ([+\-]) (\d+)\) = (?:(\d+)x|x\/(\d+)) ([+\-]) (\d+)$/.exec(q.prompt);
    expect(m, `multi-step-eq wrote an equation a child cannot read: ${q.prompt}`).not.toBeNull();
    return {
      a: Number(m![1]),
      b: m![2] === "+" ? Number(m![3]) : -Number(m![3]),
      c: m![4] === undefined ? 0 : Number(m![4]),
      e: m![5] === undefined ? 0 : Number(m![5]),
      d: m![6] === "+" ? Number(m![7]) : -Number(m![7]),
      overDivisor: m![5] !== undefined,
    };
  };

  it("distributes at every level and keeps both sides inside the level's numbers", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(multiStepEq, lvl, "multi-step-eq")) {
        const { a, b, c, d, e, overDivisor } = parse(q);
        expect(a, q.prompt).toBeGreaterThanOrEqual(2);
        expect(a, q.prompt).toBeLessThanOrEqual(A_MAX[lvl]);
        expect(Math.abs(b), q.prompt).toBeGreaterThanOrEqual(1);
        expect(Math.abs(b), q.prompt).toBeLessThanOrEqual(B_MAX[lvl]);
        expect(d, `${q.prompt} prints a constant of zero`).not.toBe(0);
        const x = Number(q.answer);
        expect(Number.isInteger(x), q.prompt).toBe(true);
        expect(x, `${q.prompt} is solved by zero`).not.toBe(0);
        if (overDivisor) {
          expect(e, q.prompt).toBeGreaterThanOrEqual(2);
          // `Math.abs`, because -6 % 2 is -0 in JavaScript and -0 is not 0 to `toBe`.
          expect(Math.abs(x % e), `${q.prompt} does not divide evenly`).toBe(0);
          expect(a * (x + b), `${q.prompt} is not solved by ${x}`).toBe(x / e + d);
        } else {
          expect(c, q.prompt).toBeGreaterThanOrEqual(2);
          expect(c, q.prompt).toBeLessThanOrEqual(C_MAX[lvl]);
          // Equal coefficients cancel the x away and leave nothing to solve.
          expect(a, `${q.prompt} has no x left to solve for`).not.toBe(c);
          expect(a * (x + b), `${q.prompt} is not solved by ${x}`).toBe(c * x + d);
        }
        if (lvl <= 1) expect(x, q.prompt).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("holds the fraction form back to level 4", () => {
    for (const lvl of [0, 1, 2, 3]) {
      for (const q of draws(multiStepEq, lvl, "multi-step-eq")) {
        expect(parse(q).overDivisor, `level ${lvl} wrote a fraction: ${q.prompt}`).toBe(false);
      }
    }
    const shapes = new Set(draws(multiStepEq, 4, "multi-step-eq").map((q) => parse(q).overDivisor));
    expect([...shapes].sort(), "level 4 must ask both shapes").toEqual([false, true]);
  });

  it("offers the bracket distributed to the first term only, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      let offered = 0;
      for (const q of draws(multiStepEq, lvl, "multi-step-eq")) {
        const { a, b, c, d, e, overDivisor } = parse(q);
        const numerator = overDivisor ? e * (d - b) : d - b;
        const denominator = overDivisor ? a * e - 1 : a - c;
        if (numerator % denominator !== 0) continue;
        const half = numerator / denominator;
        // Distinct first: this and the answer differ by b(a - 1) over the same denominator,
        // which is zero exactly when b is — so `b !== 0` is what this assertion rests on.
        expect(String(half), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, q.prompt).toContain(String(half));
        offered += 1;
      }
      expect(offered, `level ${lvl} never offered the half-distributed reading`).toBeGreaterThan(0);
    }
  });
});

describe("systems-eq", () => {
  const COEF_MAX = [1, 1, 2, 3, 4];

  const parse = (q: Question) => {
    const m = /^Solve: (-?\d*)x ([+\-]) (\d*)y = (-?\d+) and (-?\d*)x ([+\-]) (\d*)y = (-?\d+)\. What is (x|y)\?$/.exec(q.prompt);
    expect(m, `systems-eq wrote a system a child cannot read: ${q.prompt}`).not.toBeNull();
    const coef = (t: string) => (t === "" ? 1 : t === "-" ? -1 : Number(t));
    return {
      a: coef(m![1]), b: coef(m![3]) * (m![2] === "+" ? 1 : -1), e: Number(m![4]),
      c: coef(m![5]), d: coef(m![7]) * (m![6] === "+" ? 1 : -1), f: Number(m![8]),
      wanted: m![9],
    };
  };

  /** The pair the system actually has, by elimination — not by asking the generator. */
  const solve = (p: ReturnType<typeof parse>) => {
    const det = p.a * p.d - p.b * p.c;
    return { x: (p.e * p.d - p.b * p.f) / det, y: (p.a * p.f - p.e * p.c) / det, det };
  };

  it("asks x at even levels and y at odd ones, with coefficients inside the level", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(systemsEq, lvl, "systems-eq")) {
        const p = parse(q);
        expect(p.wanted, `level ${lvl}: ${q.prompt}`).toBe(lvl % 2 === 0 ? "x" : "y");
        for (const coefficient of [p.a, p.b, p.c, p.d]) {
          expect(Math.abs(coefficient), q.prompt).toBeGreaterThanOrEqual(1);
          expect(Math.abs(coefficient), q.prompt).toBeLessThanOrEqual(COEF_MAX[lvl]);
        }
        // Parallel lines have no single solution to ask about.
        expect(solve(p).det, `${q.prompt} has no single solution`).not.toBe(0);
      }
    }
  });

  it("has a whole-number pair that satisfies both equations", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(systemsEq, lvl, "systems-eq")) {
        const p = parse(q);
        const { x, y } = solve(p);
        expect(Number.isInteger(x) && Number.isInteger(y), q.prompt).toBe(true);
        expect(p.a * x + p.b * y, q.prompt).toBe(p.e);
        expect(p.c * x + p.d * y, q.prompt).toBe(p.f);
        expect(Number(q.answer), q.prompt).toBe(p.wanted === "x" ? x : y);
        expect(Math.abs(x), q.prompt).toBeLessThanOrEqual(10);
        expect(Math.abs(y), q.prompt).toBeLessThanOrEqual(10);
      }
    }
  });

  it("always offers the other variable, the sum and the flipped sign, none of them the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(systemsEq, lvl, "systems-eq")) {
        const p = parse(q);
        const { x, y } = solve(p);
        const answer = p.wanted === "x" ? x : y;
        const other = p.wanted === "x" ? y : x;
        // Distinct first. `x === y` is redrawn precisely so the mandatory distractor cannot
        // be the answer; without that redraw this line fires and `toContain` below would not.
        expect(new Set([answer, other, x + y, -answer]).size, `${q.prompt} has two right answers`).toBe(4);
        expect(q.choices, `${q.prompt} does not offer the other variable`).toContain(String(other));
        expect(q.choices, q.prompt).toContain(String(x + y));
        expect(q.choices, q.prompt).toContain(String(-answer));
      }
    }
  });
});

describe("factor-quad", () => {
  const SPAN = [6, 6, 8, 9, 9];

  const parsePrompt = (q: Question) => {
    const m = /^Factor: x² ([+\-]) (\d*)x ([+\-]) (\d+)$/.exec(q.prompt);
    expect(m, `factor-quad wrote a quadratic a child cannot read: ${q.prompt}`).not.toBeNull();
    return {
      middle: (m![2] === "" ? 1 : Number(m![2])) * (m![1] === "+" ? 1 : -1),
      constant: Number(m![4]) * (m![3] === "+" ? 1 : -1),
    };
  };
  const parseFactors = (text: string): [number, number] => {
    const m = /^\(x ([+\-]) (\d+)\)\(x ([+\-]) (\d+)\)$/.exec(text);
    expect(m, `not a factorisation: ${text}`).not.toBeNull();
    return [Number(m![2]) * (m![1] === "+" ? 1 : -1), Number(m![4]) * (m![3] === "+" ? 1 : -1)];
  };

  it("factors the prompt's own quadratic, canonically and in the level's range", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(factorQuad, lvl, "factor-quad")) {
        const { middle, constant } = parsePrompt(q);
        const [p, r] = parseFactors(q.answer);
        expect(p + r, `${q.answer} does not add to the middle term of ${q.prompt}`).toBe(middle);
        expect(p * r, `${q.answer} does not multiply to the constant of ${q.prompt}`).toBe(constant);
        // Smaller number first, always: `(x + 4)(x + 3)` is the same answer spelled otherwise.
        expect(p, `${q.answer} is written the wrong way round`).toBeLessThanOrEqual(r);
        // A repeated root makes "signs flipped" the only other reading and leaves the
        // canonical ordering saying nothing; zero and cancelling pairs are other questions.
        expect(p, `${q.prompt} has a repeated root`).not.toBe(r);
        expect(p * r, q.prompt).not.toBe(0);
        expect(p + r, `${q.prompt} lost its middle term`).not.toBe(0);
        for (const v of [p, r]) expect(Math.abs(v), q.prompt).toBeLessThanOrEqual(SPAN[lvl]);
        if (lvl <= 2) for (const v of [p, r]) expect(v, `level ${lvl} went negative: ${q.answer}`).toBeGreaterThan(0);
      }
    }
    const negatives = draws(factorQuad, 4, "factor-quad").filter((q) => parseFactors(q.answer)[0] < 0);
    expect(negatives.length, "level 4 never drew a negative factor").toBeGreaterThan(0);
  });

  it("offers the signs flipped, and only one choice is a real factorisation", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(factorQuad, lvl, "factor-quad")) {
        const { middle, constant } = parsePrompt(q);
        const [p, r] = parseFactors(q.answer);
        const flipped = `(x ${-r < 0 ? "-" : "+"} ${Math.abs(r)})(x ${-p < 0 ? "-" : "+"} ${Math.abs(p)})`;
        const canonicalFlipped = -r <= -p ? flipped : `(x ${-p < 0 ? "-" : "+"} ${Math.abs(p)})(x ${-r < 0 ? "-" : "+"} ${Math.abs(r)})`;
        expect(canonicalFlipped, `${q.prompt} reads the same with both signs flipped`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the signs flipped`).toContain(canonicalFlipped);
        // No second correct factorisation on screen. A monic quadratic factors one way, so
        // this holds for a reason — but a distractor built from the wrong pair would break it.
        const correct = q.choices.filter((choice) => {
          const [u, v] = parseFactors(choice);
          return u + v === middle && u * v === constant;
        });
        expect(correct, `${q.prompt} has two right answers: ${q.choices.join(", ")}`).toEqual([q.answer]);
      }
    }
  });

  it("speaks the square rather than printing it", () => {
    for (const q of draws(factorQuad, 4, "factor-quad")) {
      expect(q.readAloud, q.readAloud).toContain("x squared");
      expect(q.readAloud, q.readAloud).not.toContain("²");
    }
  });
});

describe("slope-intercept", () => {
  const SLOPE_MAX = [3, 4, 5, 5, 5];
  const INTERCEPT_MAX = [5, 6, 8, 8, 8];
  const POINT_MAX = [0, 0, 4, 5, 6];

  const parse = (q: Question) => {
    const m = /^A line has slope (-?\d+) and passes through \((-?\d+), (-?\d+)\)\. Write it in slope-intercept form\.$/.exec(q.prompt);
    expect(m, `slope-intercept wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const a = /^y = (-?\d*)x ([+\-]) (\d+)$/.exec(q.answer);
    expect(a, `slope-intercept wrote an answer that is not a line: ${q.answer}`).not.toBeNull();
    return {
      slope: Number(m![1]), px: Number(m![2]), py: Number(m![3]),
      writtenSlope: a![1] === "" ? 1 : a![1] === "-" ? -1 : Number(a![1]),
      intercept: Number(a![3]) * (a![2] === "+" ? 1 : -1),
    };
  };

  it("names a line that really does pass through the point, inside the level's ranges", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(slopeIntercept, lvl, "slope-intercept")) {
        const { slope, px, py, writtenSlope, intercept } = parse(q);
        expect(writtenSlope, `${q.answer} does not carry the prompt's slope`).toBe(slope);
        expect(slope * px + intercept, `${q.answer} misses the point in ${q.prompt}`).toBe(py);
        // A slope of zero prints `y = 0x - 2`; an intercept of zero makes the flipped-sign
        // distractor the answer; equal slope and intercept make the swapped one the answer.
        expect(slope, q.prompt).not.toBe(0);
        expect(intercept, q.answer).not.toBe(0);
        expect(slope, `${q.answer} swaps to itself`).not.toBe(intercept);
        expect(Math.abs(slope), q.prompt).toBeLessThanOrEqual(SLOPE_MAX[lvl]);
        expect(Math.abs(intercept), q.answer).toBeLessThanOrEqual(INTERCEPT_MAX[lvl]);
        expect(Math.abs(px), q.prompt).toBeLessThanOrEqual(POINT_MAX[lvl]);
        // At levels 0 and 1 the point IS the intercept and can be read straight off.
        if (lvl <= 1) expect(px, `level ${lvl} moved off the axis: ${q.prompt}`).toBe(0);
        else expect(px, `level ${lvl} put the point back on the axis: ${q.prompt}`).not.toBe(0);
      }
    }
  });

  it("offers the slope and intercept swapped, the intercept's sign flipped, and x for y", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(slopeIntercept, lvl, "slope-intercept")) {
        const { slope, intercept } = parse(q);
        const write = (left: string, m: number, letter: string, b: number) =>
          `${left} = ${m === 1 ? "" : m === -1 ? "-" : m}${letter} ${b < 0 ? "-" : "+"} ${Math.abs(b)}`;
        for (const wrong of [write("y", intercept, "x", slope), write("y", slope, "x", -intercept), write("x", slope, "y", intercept)]) {
          expect(wrong, `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${wrong}`).toContain(wrong);
        }
      }
    }
  });

  it("never speaks the hyphen in slope-intercept", () => {
    for (const q of draws(slopeIntercept, 4, "slope-intercept")) {
      expect(q.readAloud, q.readAloud).toContain("slope intercept form");
      expect(q.readAloud, q.readAloud).not.toMatch(/[-()]/);
    }
  });
});

describe("inequalities", () => {
  const COEF_MAX = [5, 5, 7, 9, 9];

  const parse = (q: Question) => {
    const m = /^Solve: (-?\d+)x ([+\-]) (\d+) ([<>≤≥]) (-?\d+)$/.exec(q.prompt);
    expect(m, `inequalities wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const a = /^x ([<>≤≥]) (-?\d+)$/.exec(q.answer);
    expect(a, `inequalities wrote an answer that is not a solution set: ${q.answer}`).not.toBeNull();
    return {
      a: Number(m![1]), b: m![2] === "+" ? Number(m![3]) : -Number(m![3]),
      relation: m![4], c: Number(m![5]),
      solved: a![1], boundary: Number(a![2]),
    };
  };

  it("names the solution set the inequality really has, tested by substitution", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(inequalities, lvl, "inequalities")) {
        const { a, b, relation, c, solved, boundary } = parse(q);
        const holds = (at: number) => {
          const left = a * at + b;
          return relation === "<" ? left < c : relation === ">" ? left > c : relation === "≤" ? left <= c : left >= c;
        };
        // No flip rule here: the answer is checked against numbers put back into the
        // inequality as printed, three of them, which is the only way to catch a generator
        // and a verifier that share the same wrong belief about turning the sign around.
        const satisfies = (at: number) =>
          solved === "<" ? at < boundary : solved === ">" ? at > boundary : solved === "≤" ? at <= boundary : at >= boundary;
        for (const at of [boundary - 2, boundary - 1, boundary, boundary + 1, boundary + 2]) {
          expect(satisfies(at), `${q.prompt} answered ${q.answer} but ${at} reads the other way`).toBe(holds(at));
        }
        expect(Math.abs(a), q.prompt).toBeGreaterThanOrEqual(2);
        expect(Math.abs(a), q.prompt).toBeLessThanOrEqual(COEF_MAX[lvl]);
        expect(Math.abs(b), q.prompt).toBeGreaterThanOrEqual(1);
        expect(Math.abs(b), q.prompt).toBeLessThanOrEqual(12);
        // A boundary of zero makes `x > -0` the same string as `x > 0`, so the sign-error
        // distractor would be the answer.
        expect(boundary, q.answer).not.toBe(0);
      }
    }
  });

  it("actually divides by a negative from level 3, and never before", () => {
    // Without this the skill never exercises the rule it exists for, and every level is
    // two-step equations wearing an inequality sign.
    for (const lvl of [0, 1, 2]) {
      for (const q of draws(inequalities, lvl, "inequalities")) {
        expect(parse(q).a, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThan(0);
      }
    }
    for (const lvl of [3, 4]) {
      const signs = new Set(draws(inequalities, lvl, "inequalities").map((q) => parse(q).a > 0));
      expect([...signs].sort(), `level ${lvl} must ask both signs`).toEqual([false, true]);
      const flipped = draws(inequalities, lvl, "inequalities").filter((q) => {
        const { a, relation, solved } = parse(q);
        return a < 0 && relation !== solved;
      });
      expect(flipped.length, `level ${lvl} never turned an inequality around`).toBeGreaterThan(0);
    }
  });

  it("always offers the inequality left un-turned, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(inequalities, lvl, "inequalities")) {
        const { solved, boundary } = parse(q);
        const other = solved === "<" ? ">" : solved === ">" ? "<" : solved === "≤" ? "≥" : "≤";
        const loose = solved === "<" ? "≤" : solved === "≤" ? "<" : solved === ">" ? "≥" : ">";
        for (const wrong of [`x ${other} ${boundary}`, `x ${solved} ${-boundary}`, `x ${loose} ${boundary}`]) {
          expect(wrong, `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${wrong}`).toContain(wrong);
        }
      }
    }
  });

  it("says the relation in words, so read-aloud never reads a bare sign", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(inequalities, lvl, "inequalities")) {
        expect(q.readAloud, q.readAloud).toMatch(/is (less|greater) than/);
        expect(q.readAloud, q.readAloud).not.toMatch(/[<>≤≥-]/);
      }
    }
  });
});
