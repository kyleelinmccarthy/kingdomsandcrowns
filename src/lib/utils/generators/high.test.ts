/**
 * Range and ladder checks for grades 9, 10, 11 and 12.
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
import {
  anglePairs,
  distMidpoint,
  factorQuad,
  fnCompose,
  inequalities,
  logEq,
  logRules,
  multiStepEq,
  polyOps,
  probability,
  quadFormula,
  radicalOps,
  rationalExpr,
  sequences,
  similarTri,
  slopeIntercept,
  solidMeasure,
  systemsEq,
  trigRatios,
  unitCircle,
} from "./high";
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
  // Was [6, 6, 8, 9, 9] and flat at both ends: levels 0 and 1 shared all fifteen positive
  // pairs, levels 3 and 4 all the signed ones.
  const SPAN = [6, 7, 8, 9, 10];

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
    // The span is the only axis this skill has beside the sign, so every rung has to actually
    // use the reach it was given — a ceiling nothing touches leaves the rung where it was.
    for (const lvl of [1, 2, 3, 4]) {
      const reached = draws(factorQuad, lvl, "factor-quad")
        .some((q) => parseFactors(q.answer).some((v) => Math.abs(v) > SPAN[lvl - 1]));
      expect(reached, `level ${lvl} never reaches past ${SPAN[lvl - 1]}`).toBe(true);
    }
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
  // Was [5, 5, 7, 9, 9]: levels 0 and 1 shared 1302 inequalities, and so did 3 and 4.
  const COEF_MAX = [4, 6, 7, 9, 12];

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

  /**
   * "Or equal to" is the second axis, and the better half of the fix: whether the boundary is
   * itself a solution is a real thing to get wrong, and a strict-only rung never asks it. It
   * has to be absent from the first two rungs and present after, or it separates nothing.
   */
  it("asks only strict inequalities until level 2, and both kinds after", () => {
    for (const lvl of [0, 1]) {
      for (const q of draws(inequalities, lvl, "inequalities")) {
        expect(["<", ">"], `level ${lvl}: ${q.prompt}`).toContain(parse(q).relation);
      }
    }
    for (const lvl of [2, 3, 4]) {
      const used = new Set(draws(inequalities, lvl, "inequalities").map((q) => parse(q).relation));
      expect([...used].sort(), `level ${lvl}`).toEqual(["<", ">", "≤", "≥"].sort());
    }
  });

  /** Each rung reaches a coefficient the rung below could not, or its ceiling is decoration. */
  it("reaches past the rung below's coefficient on the rungs where the ceiling moves", () => {
    for (const lvl of [1, 2, 3, 4]) {
      const reached = draws(inequalities, lvl, "inequalities").some((q) => Math.abs(parse(q).a) > COEF_MAX[lvl - 1]);
      expect(reached, `level ${lvl} never reaches past ${COEF_MAX[lvl - 1]}`).toBe(true);
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

// ---------------------------------------------------------------------------
// Grade 10 — Geometry
// ---------------------------------------------------------------------------

describe("angle-pairs", () => {
  const KINDS = [
    ["complementary"],
    ["complementary", "supplementary"],
    ["complementary", "supplementary"],
    ["complementary", "supplementary", "vertical", "same-side"],
    ["complementary", "supplementary", "vertical", "same-side"],
  ];

  const parse = (q: Question) => {
    const named = /^Two angles are (complementary|supplementary)\. One is (\d+)°\. What is the other\?$/.exec(q.prompt);
    if (named) return { kind: named[1], given: Number(named[2]) };
    const vertical = /^Two lines cross\. One of a pair of vertical angles is (\d+)°\. What is the other\?$/.exec(q.prompt);
    if (vertical) return { kind: "vertical", given: Number(vertical[1]) };
    const sameSide = /^Parallel lines are cut by a transversal\. One same-side interior angle is (\d+)°\. What is the other\?$/.exec(q.prompt);
    expect(sameSide, `angle-pairs wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return { kind: "same-side", given: Number(sameSide![1]) };
  };

  it("asks only the relationships its level has reached, in that level's degrees", () => {
    for (const lvl of LEVELS) {
      const used = new Set<string>();
      for (const q of draws(anglePairs, lvl, "angle-pairs")) {
        const { kind, given } = parse(q);
        used.add(kind);
        expect(KINDS[lvl], `level ${lvl} asked ${kind}`).toContain(kind);
        expect(given, q.prompt).toBeGreaterThanOrEqual(1);
        expect(given, q.prompt).toBeLessThanOrEqual(179);
        // 90° is neither: it has no supplement worth asking and its complement is zero.
        expect(given, q.prompt).not.toBe(90);
        // 45° is its own complement, which would make "the angle you were given" the answer.
        if (kind === "complementary") expect(given, q.prompt).not.toBe(45);
        // Multiples of five only at the first two rungs — the whole difference between 1 and 2.
        if (lvl <= 1) expect(given % 5, `level ${lvl} left the five-degree grid: ${q.prompt}`).toBe(0);
        // Only a vertical pair may be obtuse, and only at level 4: everywhere else the
        // complement has to stay a real angle, because it is the mandatory wrong reading.
        if (!(kind === "vertical" && lvl === 4)) expect(given, q.prompt).toBeLessThan(90);
      }
      expect([...used].sort(), `level ${lvl} never asked everything it allows`).toEqual([...KINDS[lvl]].sort());
    }
  });

  it("gives the angle the relationship the prompt actually names", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(anglePairs, lvl, "angle-pairs")) {
        const { kind, given } = parse(q);
        const answer = Number(q.answer);
        expect(Number.isInteger(answer), q.answer).toBe(true);
        expect(answer, q.prompt).toBeGreaterThan(0);
        if (kind === "complementary") expect(given + answer, q.prompt).toBe(90);
        else if (kind === "vertical") expect(answer, q.prompt).toBe(given);
        else expect(given + answer, q.prompt).toBe(180);
      }
    }
  });

  it("offers the other relationship, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      let offered = 0;
      for (const q of draws(anglePairs, lvl, "angle-pairs")) {
        const { kind, given } = parse(q);
        if (kind === "vertical") continue;
        const other = String(kind === "complementary" ? 180 - given : 90 - given);
        // Distinct first: complement and supplement differ by exactly 90, so this holds for
        // every angle — but a level that let an obtuse angle through would have no complement
        // to offer at all, and `pickDistinct` would fill the slot with an off-by-one instead.
        expect(other, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the other relationship`).toContain(other);
        // A vertical pair is the one relationship whose answer IS the angle given, so the
        // "given angle back again" reading belongs to every other kind and to no vertical one.
        expect(q.choices, `${q.prompt} does not offer the angle it was given`).toContain(String(given));
        offered += 1;
      }
      expect(offered, `level ${lvl} never asked a complement or a supplement`).toBeGreaterThan(0);
    }
    // A vertical pair's own mistake is reading the ADJACENT angle, which is the supplement.
    let vertical = 0;
    for (const q of draws(anglePairs, 4, "angle-pairs")) {
      const { kind, given } = parse(q);
      if (kind !== "vertical") continue;
      expect(String(180 - given), `${q.prompt} has two right answers`).not.toBe(q.answer);
      expect(q.choices, `${q.prompt} does not offer the adjacent angle`).toContain(String(180 - given));
      vertical += 1;
    }
    expect(vertical, "level 4 never drew a vertical pair").toBeGreaterThan(0);
  });

  it("says the degrees rather than printing the sign", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(anglePairs, lvl, "angle-pairs")) {
        expect(q.readAloud, q.readAloud).toContain("degrees");
        expect(q.readAloud, q.readAloud).not.toMatch(/[°-]/);
      }
    }
  });
});

describe("similar-tri", () => {
  const SCALE_MAX = [3, 4, 5, 6, 8];
  const SIDE_MAX = [6, 7, 8, 9, 9];

  const parse = (q: Question) => {
    const m = /^Two triangles are similar: the first has sides (\d+) and (\d+), and the second's side matching the (\d+) is (\d+)\. What is the second's side matching the (\d+)\?$/.exec(q.prompt);
    expect(m, `similar-tri wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return { first: Number(m![1]), second: Number(m![2]), matched: Number(m![3]), image: Number(m![4]), wanted: Number(m![5]) };
  };

  it("keeps the two triangles in proportion, inside the level's sides and scales", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(similarTri, lvl, "similar-tri")) {
        const { first, second, matched, image, wanted } = parse(q);
        // The prompt must point at the sides it named, or "the side matching the 3" is a riddle.
        expect(matched, q.prompt).toBe(first);
        expect(wanted, q.prompt).toBe(second);
        expect(first, `${q.prompt} names the same side twice`).not.toBe(second);
        // Cross-multiplied, never divided: first : second = image : answer.
        expect(first * Number(q.answer), `${q.answer} is not in proportion with ${q.prompt}`).toBe(second * image);
        expect(image % first, `${q.prompt} does not scale by a whole number`).toBe(0);
        const scale = image / first;
        expect(scale, q.prompt).toBeGreaterThanOrEqual(2);
        expect(scale, q.prompt).toBeLessThanOrEqual(SCALE_MAX[lvl]);
        for (const side of [first, second]) {
          expect(side, q.prompt).toBeGreaterThanOrEqual(2);
          expect(side, q.prompt).toBeLessThanOrEqual(SIDE_MAX[lvl]);
        }
        // A match that IS the first triangle's other side reads like a trick.
        expect(image, q.prompt).not.toBe(second);
      }
    }
  });

  it("offers the scale added instead of multiplied, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(similarTri, lvl, "similar-tri")) {
        const { first, second, image } = parse(q);
        const scale = image / first;
        // Distinct first. `b + k` and `b × k` agree exactly once, at b = k = 2, and that draw
        // is thrown away — without the throw `pickDistinct` would swap in an off-by-one and
        // the `toContain` below would pass on the answer itself.
        expect(String(second + scale), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the scale added`).toContain(String(second + scale));
        expect(String(second), `${q.prompt} answers with the unscaled side`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the unscaled side`).toContain(String(second));
      }
    }
  });
});

describe("trig-ratios", () => {
  const RATIOS = [["sin"], ["sin", "cos"], ["sin", "cos"], ["sin", "cos", "tan"], ["sin", "cos", "tan"]];
  const HYP_MAX = [25, 29, 40, 60, 90];

  const parse = (q: Question) => {
    const m = /^In a right triangle, angle A has an opposite side of (\d+), an adjacent side of (\d+), and a hypotenuse of (\d+)\. What is (sin|cos|tan) A\?$/.exec(q.prompt);
    expect(m, `trig-ratios wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return { opposite: Number(m![1]), adjacent: Number(m![2]), hypotenuse: Number(m![3]), ratio: m![4] };
  };
  /** A fraction as the generators spell one: reduced, and a whole number written as one. */
  const ratioOf = (n: number, d: number) => {
    const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
    const k = g(n, d) || 1;
    return d / k === 1 ? String(n / k) : `${n / k}/${d / k}`;
  };

  it("names a real right triangle and the ratio the prompt asks for", () => {
    for (const lvl of LEVELS) {
      const used = new Set<string>();
      for (const q of draws(trigRatios, lvl, "trig-ratios")) {
        const { opposite, adjacent, hypotenuse, ratio } = parse(q);
        used.add(ratio);
        expect(RATIOS[lvl], `level ${lvl} asked ${ratio}`).toContain(ratio);
        // The sides come from the triple table, so this holds — and holds without this file
        // ever seeing the table. An irrational ratio could not be one of four choices.
        expect(opposite * opposite + adjacent * adjacent, `${q.prompt} is not a right triangle`).toBe(hypotenuse * hypotenuse);
        expect(hypotenuse, q.prompt).toBeLessThanOrEqual(HYP_MAX[lvl]);
        const expected = ratio === "sin" ? ratioOf(opposite, hypotenuse) : ratio === "cos" ? ratioOf(adjacent, hypotenuse) : ratioOf(opposite, adjacent);
        expect(q.answer, `${q.prompt} answered ${q.answer}`).toBe(expected);
        // No triple has two equal legs, so no ratio here is ever 1 and none is ever whole.
        expect(q.answer, q.prompt).toMatch(/^\d+\/\d+$/);
      }
      expect([...used].sort(), `level ${lvl} never asked everything it allows`).toEqual([...RATIOS[lvl]].sort());
    }
  });

  it("offers the cosine where the sine was asked, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(trigRatios, lvl, "trig-ratios")) {
        const { opposite, adjacent, hypotenuse, ratio } = parse(q);
        const wrong = ratio === "sin" ? ratioOf(adjacent, hypotenuse)
          : ratio === "cos" ? ratioOf(opposite, hypotenuse)
            : ratioOf(adjacent, opposite);
        // Distinct first: sine equals cosine only when the two legs are equal, and no
        // Pythagorean triple has that. The same holds for the tangent and its reciprocal.
        expect(wrong, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the other ratio`).toContain(wrong);
      }
    }
  });

  it("speaks the ratio's name rather than its abbreviation", () => {
    for (const q of draws(trigRatios, 4, "trig-ratios")) {
      expect(q.readAloud, q.readAloud).toMatch(/the (sine|cosine|tangent) of angle A/);
      expect(q.readAloud, q.readAloud).not.toMatch(/[-\/]/);
    }
  });
});

describe("solid-measure", () => {
  const SHAPES = [
    ["prism"],
    ["prism", "cylinder"],
    ["prism", "cylinder"],
    ["prism", "cylinder"],
    ["prism", "cylinder", "sphere", "cone"],
  ];
  const DIM_MAX = [4, 5, 6, 8, 10];

  type Read = { shape: string; measure: string; dims: number[]; pi: number };
  const parse = (q: Question): Read => {
    const prism = /^A rectangular prism is (\d+) by (\d+) by (\d+)\. What is its (volume|surface area)\?$/.exec(q.prompt);
    if (prism) return { shape: "prism", measure: prism[4], dims: [1, 2, 3].map((i) => Number(prism[i])), pi: 0 };
    const cylinder = /^A cylinder has radius (\d+) and height (\d+)\. What is its (volume|surface area)\? Use (3\.14) for pi\.$/.exec(q.prompt);
    if (cylinder) return { shape: "cylinder", measure: cylinder[3], dims: [Number(cylinder[1]), Number(cylinder[2])], pi: Number(cylinder[4]) };
    const sphere = /^A sphere has radius (\d+)\. What is its (volume|surface area)\? Use (3\.14) for pi\.$/.exec(q.prompt);
    if (sphere) return { shape: "sphere", measure: sphere[2], dims: [Number(sphere[1])], pi: Number(sphere[3]) };
    const cone = /^A cone has radius (\d+) and height (\d+)\. What is its volume\? Use (3\.14) for pi\.$/.exec(q.prompt);
    expect(cone, `solid-measure wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return { shape: "cone", measure: "volume", dims: [Number(cone![1]), Number(cone![2])], pi: Number(cone![3]) };
  };

  /** Volume and surface area of the solid the prompt describes, worked here from the prompt. */
  const measures = ({ shape, dims, pi }: Read): { volume: number; surface: number } => {
    if (shape === "prism") {
      const [l, w, h] = dims;
      return { volume: l * w * h, surface: 2 * (l * w + l * h + w * h) };
    }
    if (shape === "cylinder") {
      const [r, h] = dims;
      return { volume: pi * r * r * h, surface: 2 * pi * r * r + 2 * pi * r * h };
    }
    if (shape === "sphere") {
      const [r] = dims;
      return { volume: (4 * pi * r * r * r) / 3, surface: 4 * pi * r * r };
    }
    const [r, h] = dims;
    // A cone is only ever asked for its volume — its surface needs a slant height, and
    // `√(r² + h²)` is irrational for nearly every pair. `surface` here holds the mistake that
    // stands in for the other measure: the one third dropped.
    return { volume: (pi * r * r * h) / 3, surface: pi * r * r * h };
  };
  const tenths = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

  it("measures the solid the prompt names, to one decimal place, inside the level's sizes", () => {
    for (const lvl of LEVELS) {
      const used = new Set<string>();
      for (const q of draws(solidMeasure, lvl, "solid-measure")) {
        const read = parse(q);
        used.add(read.shape);
        expect(SHAPES[lvl], `level ${lvl} drew a ${read.shape}`).toContain(read.shape);
        // One spelling for one number: `24` and `24.0` are the same measure written two ways.
        expect(q.answer, `${q.prompt} answered ${q.answer}`).toMatch(/^\d+\.\d$/);
        const { volume, surface } = measures(read);
        expect(q.answer, `${q.prompt} answered ${q.answer}`).toBe(tenths(read.measure === "volume" ? volume : surface));
        for (const d of read.dims) {
          expect(d, q.prompt).toBeGreaterThanOrEqual(2);
          expect(d, q.prompt).toBeLessThanOrEqual(Math.max(DIM_MAX[lvl], 8));
        }
        // Surface area is a wrong reading from the start and a QUESTION only from level 2.
        if (lvl <= 1) expect(read.measure, `level ${lvl} asked for a surface area`).toBe("volume");
        if (read.shape === "cone") expect(read.measure, "a cone is only ever asked for its volume").toBe("volume");
      }
      expect([...used].sort(), `level ${lvl} never drew everything it allows`).toEqual([...SHAPES[lvl]].sort());
    }
    const asked = new Set(draws(solidMeasure, 2, "solid-measure").map((q) => parse(q).measure));
    expect([...asked].sort(), "level 2 must ask both measures").toEqual(["surface area", "volume"]);
  });

  it("offers the other measure of the same solid, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(solidMeasure, lvl, "solid-measure")) {
        const read = parse(q);
        const { volume, surface } = measures(read);
        // For a cone this is the one third dropped rather than a surface area; either way it
        // is the reading the skill exists to catch, and the draw is thrown away when it rounds
        // to the answer rather than being quietly backfilled with an off-by-a-tenth.
        const other = tenths(read.measure === "volume" ? surface : volume);
        expect(other, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the other measure`).toContain(other);
      }
    }
  });

  it("speaks pi as a word and never prints the symbol", () => {
    for (const q of draws(solidMeasure, 4, "solid-measure")) {
      expect(q.readAloud, q.readAloud).not.toContain("π");
      expect(q.readAloud, q.readAloud).not.toContain("3.14");
      if (q.prompt.includes("pi")) expect(q.readAloud, q.readAloud).toContain("three point one four for pi");
    }
  });
});

describe("dist-midpoint", () => {
  const ORIGIN_MAX = [5, 6, 8, 10, 12];
  const HYP_MAX = [13, 17, 25, 29, 60];

  const parse = (q: Question) => {
    const m = /^What is the (distance between|midpoint of) \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)\?$/.exec(q.prompt);
    expect(m, `dist-midpoint wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return {
      wantDistance: m![1] === "distance between",
      x1: Number(m![2]), y1: Number(m![3]), x2: Number(m![4]), y2: Number(m![5]),
    };
  };

  it("keeps the distance whole and the midpoint halfway, inside the level's grid", () => {
    for (const lvl of LEVELS) {
      const asked = new Set<boolean>();
      for (const q of draws(distMidpoint, lvl, "dist-midpoint")) {
        const { wantDistance, x1, y1, x2, y2 } = parse(q);
        asked.add(wantDistance);
        expect(Math.abs(x1), q.prompt).toBeLessThanOrEqual(ORIGIN_MAX[lvl]);
        expect(Math.abs(y1), q.prompt).toBeLessThanOrEqual(ORIGIN_MAX[lvl]);
        // Negative coordinates join at level 3, and only there.
        if (lvl <= 2) for (const v of [x1, y1, x2, y2]) expect(v, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThanOrEqual(0);
        if (wantDistance) {
          const squared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
          // Squared back rather than rooted: the answer is the whole number whose square is
          // the sum of the two squares, which is the only reason it can be a choice at all.
          expect(Number(q.answer) * Number(q.answer), `${q.prompt} is not ${q.answer} apart`).toBe(squared);
          expect(Number(q.answer), q.prompt).toBeLessThanOrEqual(HYP_MAX[lvl]);
        } else {
          const m = /^\((-?\d+(?:\.5)?), (-?\d+(?:\.5)?)\)$/.exec(q.answer);
          expect(m, `dist-midpoint wrote an answer that is not a point: ${q.answer}`).not.toBeNull();
          expect(2 * Number(m![1]), q.prompt).toBe(x1 + x2);
          expect(2 * Number(m![2]), q.prompt).toBe(y1 + y2);
          // Two points summing to the origin make "the halving forgotten" the answer; a
          // midpoint with two equal coordinates makes "the coordinates swapped" the answer.
          expect(x1 + x2 === 0 && y1 + y2 === 0, q.prompt).toBe(false);
          expect(x1 + x2, `${q.prompt} swaps to itself`).not.toBe(y1 + y2);
        }
      }
      // The midpoint is a question from level 1 and a wrong answer from level 0.
      expect([...asked].sort(), `level ${lvl} asked the wrong mix`).toEqual(lvl === 0 ? [true] : [false, true]);
    }
  });

  it("offers the midpoint against every distance question, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      let offered = 0;
      for (const q of draws(distMidpoint, lvl, "dist-midpoint")) {
        const { wantDistance, x1, y1, x2, y2 } = parse(q);
        if (!wantDistance) continue;
        const midpoint = `(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`;
        // Distinct by shape rather than by luck — a point is never a whole number — but
        // asserted anyway, because the day the distance answer is rendered as a point is the
        // day this distractor quietly becomes the answer and nothing else would say so.
        expect(midpoint, `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the midpoint`).toContain(midpoint);
        offered += 1;
      }
      expect(offered, `level ${lvl} never asked for a distance`).toBeGreaterThan(0);
    }
  });

  it("speaks the points without brackets or a bare minus sign", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(distMidpoint, lvl, "dist-midpoint")) {
        expect(q.readAloud, q.readAloud).toContain("the point ");
        expect(q.readAloud, q.readAloud).not.toMatch(/[()-]/);
      }
    }
  });
});

/**
 * Every rung must be a different rung.
 *
 * `two-step-eq` shipped with levels 0 and 1 producing literally the same 480 equations: a
 * child masters a rung, is promoted, and is handed the pool they just left while their mastery
 * number climbs. What this asserts is the weakest honest form — level N must be able to ask
 * something no earlier level can — because a harder rung should still revisit easier work.
 */
describe("every grade 10 level offers something no earlier level can ask", () => {
  const LADDERS: [string, (l: number, r: Rng, s: string) => Question][] = [
    ["angle-pairs", anglePairs],
    ["similar-tri", similarTri],
    ["trig-ratios", trigRatios],
    ["solid-measure", solidMeasure],
    ["dist-midpoint", distMidpoint],
  ];

  it.each(LADDERS)("%s climbs", (skillId, gen) => {
    const seen = new Set<string>();
    for (const lvl of LEVELS) {
      const here = new Set(draws(gen, lvl, skillId).map((q) => q.prompt));
      if (lvl > 0) {
        const fresh = [...here].filter((p) => !seen.has(p));
        expect(
          fresh.length,
          `${skillId} level ${lvl} can ask nothing level ${lvl - 1} could not — ${here.size} questions, all already reachable`,
        ).toBeGreaterThan(0);
      }
      for (const p of here) seen.add(p);
    }
  });
});

// ---------------------------------------------------------------------------
// Grade 11 — Algebra II
// ---------------------------------------------------------------------------

describe("quad-formula", () => {
  const ROOT_LOW = [1, 1, -3, -6, -9];
  const ROOT_HIGH = [5, 7, 7, 9, 9];

  const parse = (q: Question) => {
    const m = /^Solve: (\d*)x² ([+\-]) (\d*)x ([+\-]) (\d+) = 0\. What is the larger root\?$/.exec(q.prompt);
    expect(m, `quad-formula wrote an equation a child cannot read: ${q.prompt}`).not.toBeNull();
    return {
      a: m![1] === "" ? 1 : Number(m![1]),
      b: (m![2] === "+" ? 1 : -1) * (m![3] === "" ? 1 : Number(m![3])),
      c: (m![4] === "+" ? 1 : -1) * Number(m![5]),
    };
  };
  /** The two roots, from the coefficients — not by asking the generator what it started with. */
  const roots = ({ a, b, c }: { a: number; b: number; c: number }) => {
    const gap = Math.round(Math.sqrt(b * b - 4 * a * c));
    return { larger: (-b + gap) / (2 * a), smaller: (-b - gap) / (2 * a), gap };
  };

  it("has two different whole roots that really solve the equation", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(quadFormula, lvl, "quad-formula")) {
        const { a, b, c } = parse(q);
        const { larger, smaller, gap } = roots({ a, b, c });
        expect(gap * gap, `${q.prompt} has no whole roots`).toBe(b * b - 4 * a * c);
        for (const root of [larger, smaller]) {
          expect(Number.isInteger(root), `${q.prompt} has a root of ${root}`).toBe(true);
          expect(a * root * root + b * root + c, `${root} does not solve ${q.prompt}`).toBe(0);
          expect(root, q.prompt).toBeGreaterThanOrEqual(ROOT_LOW[lvl]);
          expect(root, q.prompt).toBeLessThanOrEqual(ROOT_HIGH[lvl]);
          // A root of zero prints `+ 0` and is a factored question written the long way.
          expect(root, `${q.prompt} has a root of zero`).not.toBe(0);
        }
        // A repeated root makes "the larger root" meaningless and makes the smaller root — the
        // mandatory distractor — the answer. Roots that cancel print no middle term at all.
        expect(larger, `${q.prompt} has a repeated root`).not.toBe(smaller);
        expect(larger + smaller, `${q.prompt} lost its middle term`).not.toBe(0);
        expect(Number(q.answer), `${q.prompt} answered ${q.answer}`).toBe(larger);
        expect(a, q.prompt).toBe(lvl >= 4 ? a : 1);
        if (lvl >= 4) {
          expect(a, q.prompt).toBeGreaterThanOrEqual(2);
          expect(a, q.prompt).toBeLessThanOrEqual(3);
        }
        if (lvl <= 1) expect(smaller, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThan(0);
      }
    }
    const negatives = draws(quadFormula, 4, "quad-formula").filter((q) => roots(parse(q)).smaller < 0);
    expect(negatives.length, "level 4 never drew a negative root").toBeGreaterThan(0);
  });

  it("always offers the smaller root, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(quadFormula, lvl, "quad-formula")) {
        const { larger, smaller } = roots(parse(q));
        // Distinct first: a repeated root is thrown away at the draw precisely so that this
        // holds. Without that throw `pickDistinct` would backfill an off-by-one and the
        // `toContain` below would pass on the answer itself.
        expect(String(smaller), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the smaller root`).toContain(String(smaller));
        expect(String(-smaller), `${q.prompt} flips to its own answer`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the roots with flipped signs`).toContain(String(-smaller));
        expect(String(larger + smaller), q.prompt).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the sum of the roots`).toContain(String(larger + smaller));
      }
    }
  });

  it("speaks the square rather than printing it", () => {
    for (const q of draws(quadFormula, 4, "quad-formula")) {
      expect(q.readAloud, q.readAloud).toContain("x squared");
      expect(q.readAloud, q.readAloud).not.toMatch(/[²-]/);
    }
  });
});

describe("poly-ops", () => {
  /** A polynomial string to a coefficient per power, strictly: descending, no zero terms. */
  const parsePoly = (text: string): Map<number, number> | null => {
    const out = new Map<number, number>();
    let previous = Infinity;
    const terms = text.split(/ (?=[+-] )/);
    for (let i = 0; i < terms.length; i++) {
      const m = /^(?:([+-]) )?(\d*)(x[²³]?)?$/.exec(terms[i]);
      if (!m) return null;
      if ((i === 0) !== (m[1] === undefined)) return null;
      if (m[2] === "" && m[3] === undefined) return null;
      const power = m[3] === undefined ? 0 : m[3] === "x" ? 1 : m[3] === "x²" ? 2 : 3;
      if (power >= previous) return null;
      previous = power;
      out.set(power, (m[1] === "-" ? -1 : 1) * (m[2] === "" ? 1 : Number(m[2])));
    }
    return out;
  };
  const at = (terms: Map<number, number>, x: number) => {
    let total = 0;
    for (const [power, coefficient] of terms) total += coefficient * x ** power;
    return total;
  };
  /** The generator's own spelling, written out here so the SPELLING is what gets pinned. */
  const write = (coefficients: number[]): string => {
    const degree = coefficients.length - 1;
    let out = "";
    for (let i = 0; i < coefficients.length; i++) {
      const v = coefficients[i];
      if (v === 0) continue;
      const power = degree - i;
      const size = Math.abs(v);
      const body = power === 0 ? String(size) : `${size === 1 ? "" : size}x${power === 2 ? "²" : power === 3 ? "³" : ""}`;
      out = out === "" ? `${v < 0 ? "-" : ""}${body}` : `${out} ${v < 0 ? "-" : "+"} ${body}`;
    }
    return out;
  };
  const parse = (q: Question) => {
    const m = /^Expand: \(([^()]+)\)\(([^()]+)\)$/.exec(q.prompt);
    expect(m, `poly-ops wrote a product a child cannot read: ${q.prompt}`).not.toBeNull();
    const first = parsePoly(m![1]), second = parsePoly(m![2]);
    expect(first, `not a polynomial: ${m![1]}`).not.toBeNull();
    expect(second, `not a polynomial: ${m![2]}`).not.toBeNull();
    return { first: first!, second: second! };
  };
  /** The answer as a coefficient array, highest power first. */
  const answerCoefficients = (q: Question, degree: number): number[] => {
    const terms = parsePoly(q.answer);
    expect(terms, `poly-ops wrote an answer that is not a polynomial: ${q.answer}`).not.toBeNull();
    return Array.from({ length: degree + 1 }, (_, i) => terms!.get(degree - i) ?? 0);
  };

  it("expands the prompt's own factors, with no term missing, at the level's degree", () => {
    for (const lvl of LEVELS) {
      const SPAN = [5, 5, 8, 5, 8][lvl];
      for (const q of draws(polyOps, lvl, "poly-ops")) {
        const { first, second } = parse(q);
        const degree = Math.max(...first.keys()) + Math.max(...second.keys());
        // A trinomial factor joins at level 3 and never before.
        expect(degree, `level ${lvl} expanded to degree ${degree}`).toBe(lvl >= 3 ? 3 : 2);
        const terms = parsePoly(q.answer);
        expect(terms, q.answer).not.toBeNull();
        // Compared by VALUE at seven points, not by multiplying the constants out — nothing
        // here knows the FOIL identity, so a generator with its own idea of it disagrees.
        for (const x of [-3, -2, -1, 0, 1, 2, 3]) {
          // Subtracted rather than compared: a factor of zero times a negative is `-0`, and
          // `-0` is not `0` to `toBe`. The difference is plain zero either way.
          expect(at(terms!, x) - at(first, x) * at(second, x), `${q.answer} is not ${q.prompt} at x = ${x}`).toBe(0);
        }
        // Every coefficient is present: each of this skill's three mistakes changes exactly
        // one of them, and each is the answer again the moment the one it changes is zero.
        expect(terms!.size, `${q.answer} is missing a term`).toBe(degree + 1);
        expect(terms!.get(degree), `${q.answer} is not monic`).toBe(1);
        for (const [, coefficient] of terms!) expect(Math.abs(coefficient), q.answer).toBeLessThanOrEqual(SPAN * SPAN * 2);
        if (lvl === 0) {
          for (const factor of [first, second]) {
            expect(factor.get(0), `level 0 went negative: ${q.prompt}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("offers the middle term's sign flipped, the middle term dropped and the constant flipped", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(polyOps, lvl, "poly-ops")) {
        const degree = lvl >= 3 ? 3 : 2;
        const product = answerCoefficients(q, degree);
        const last = product.length - 1;
        const wrong = [
          write(product.map((v, i) => (i === last - 1 ? -v : v))),   // the middle term's sign
          write(product.map((v, i) => (i === last - 1 ? 0 : v))),    // the middle term forgotten
          write(product.map((v, i) => (i === last ? -v : v))),       // the constant's sign
        ];
        for (const mistake of wrong) {
          // Distinct first: each of these differs from the answer only while the coefficient it
          // touches is non-zero, which is exactly what the generator redraws to guarantee.
          expect(mistake, `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${mistake}`).toContain(mistake);
        }
      }
    }
  });

  it("speaks the powers rather than printing them", () => {
    for (const lvl of [0, 4]) {
      for (const q of draws(polyOps, lvl, "poly-ops")) {
        expect(q.readAloud, q.readAloud).toContain("the quantity");
        expect(q.readAloud, q.readAloud).not.toMatch(/[²³()-]/);
      }
    }
  });
});

describe("radical-ops", () => {
  const FACTORS = [4, 9, 16, 25, 36];
  const squareFree = (n: number) => {
    for (let d = 2; d * d <= n; d++) if (n % (d * d) === 0) return false;
    return true;
  };
  const parse = (q: Question) => {
    const m = /^Simplify: √(\d+)$/.exec(q.prompt);
    expect(m, `radical-ops wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    return Number(m![1]);
  };
  const readSurd = (text: string) => {
    const surd = /^(\d*)√(\d+)$/.exec(text);
    if (surd) return { outside: surd[1] === "" ? 1 : Number(surd[1]), inside: Number(surd[2]) };
    expect(text, `not a simplified radical: ${text}`).toMatch(/^\d+$/);
    return { outside: Number(text), inside: 1 };
  };

  it("simplifies fully: the answer squares back to the radicand and leaves nothing square", () => {
    for (const lvl of LEVELS) {
      const pulled = new Set<number>();
      for (const q of draws(radicalOps, lvl, "radical-ops")) {
        const radicand = parse(q);
        const { outside, inside } = readSurd(q.answer);
        // Squared back, never factored: `a² × b` must be the radicand the prompt names.
        expect(outside * outside * inside, `${q.answer} is not √${radicand}`).toBe(radicand);
        // And `b` square-free, which is the other half. `2√18` also squares back to 72.
        expect(squareFree(inside), `${q.answer} can still be simplified`).toBe(true);
        expect(outside, `${q.answer} pulled nothing out`).toBeGreaterThanOrEqual(2);
        pulled.add(outside * outside);
        expect(FACTORS.slice(0, lvl + 1), `level ${lvl} pulled ${outside * outside} out of ${radicand}`).toContain(outside * outside);
      }
      expect([...pulled].sort((x, y) => x - y), `level ${lvl} never used every factor it allows`).toEqual(FACTORS.slice(0, lvl + 1));
    }
  });

  it("offers the un-simplified root and the wrong factor pulled out, neither of them the answer", () => {
    for (const lvl of LEVELS) {
      let underSimplified = 0;
      for (const q of draws(radicalOps, lvl, "radical-ops")) {
        const radicand = parse(q);
        const { outside } = readSurd(q.answer);
        // `√72` squares back to 72 exactly as `6√2` does — the two are told apart only by
        // whether what is left under the root is square-free. This choice is on screen so that
        // a verifier missing that assertion would be caught rather than quietly passing.
        expect(`√${radicand}`, `${q.prompt} answers with its own radicand`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer the un-simplified root`).toContain(`√${radicand}`);
        for (let d = 2; d * d < outside * outside; d++) {
          if (radicand % (d * d) !== 0) continue;
          const wrong = `${d}√${radicand / (d * d)}`;
          expect(wrong, `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${wrong}`).toContain(wrong);
          underSimplified += 1;
          break;
        }
      }
      // Only 16 and 36 have a proper square divisor to pull out by mistake: a square-free
      // radicand part can contribute none, so 4, 9 and 25 never have a smaller one. That puts
      // the first under-simplified reading at level 2, where 16 joins.
      if (lvl >= 2) expect(underSimplified, `level ${lvl} never offered a smaller square factor`).toBeGreaterThan(0);
    }
  });

  it("spells the radical rather than printing it", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(radicalOps, lvl, "radical-ops")) {
        expect(q.readAloud, q.readAloud).toContain("the square root of");
        expect(q.readAloud, q.readAloud).not.toMatch(/[√-]/);
      }
    }
  });
});

describe("log-rules", () => {
  const BASES = [[2, 3, 5], [2, 3, 5], [2, 3, 5, 10], [2, 3, 5, 10], [2, 3, 5, 10]];
  const SUBSCRIPTS: Record<string, number> = { "₂": 2, "₃": 3, "₅": 5, "": 10 };

  const parse = (q: Question) => {
    const m = /^What is log([₂₃₅]?)\((\d+|1\/\d+)\)\?$/.exec(q.prompt);
    expect(m, `log-rules wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const fraction = /^1\/(\d+)$/.exec(m![2]);
    return { base: SUBSCRIPTS[m![1]], power: Number(fraction ? fraction[1] : m![2]), negative: fraction !== null };
  };

  it("names an exponent that really does raise the base to the argument", () => {
    for (const lvl of LEVELS) {
      const used = new Set<number>();
      for (const q of draws(logRules, lvl, "log-rules")) {
        const { base, power, negative } = parse(q);
        used.add(base);
        expect(BASES[lvl], `level ${lvl} drew base ${base}`).toContain(base);
        const exponent = Number(q.answer);
        expect(Number.isInteger(exponent), q.answer).toBe(true);
        expect(negative ? -exponent : exponent, q.prompt).toBeGreaterThanOrEqual(1);
        // Raised back up rather than divided down: base to the answer must be the argument.
        expect(base ** Math.abs(exponent), `${q.answer} is not the log of ${power}`).toBe(power);
        expect(exponent < 0, `${q.prompt} answered ${q.answer}`).toBe(negative);
        expect(power, `${q.prompt} counts zeros rather than testing logarithms`).toBeLessThanOrEqual(100000);
        expect(Math.abs(exponent), q.prompt).toBeLessThanOrEqual([4, 6, 6, 6, 6][lvl]);
        // The base is the mandatory wrong answer, so it may never BE the answer.
        expect(exponent, `${q.prompt} answers with its own base`).not.toBe(base);
        // A unit fraction for an argument joins at level 3 and never before.
        if (lvl <= 2) expect(negative, `level ${lvl} asked ${q.prompt}`).toBe(false);
      }
      expect([...used].sort((x, y) => x - y), `level ${lvl} never used every base it allows`).toEqual(BASES[lvl]);
    }
    for (const lvl of [3, 4]) {
      const negatives = draws(logRules, lvl, "log-rules").filter((q) => parse(q).negative);
      expect(negatives.length, `level ${lvl} never asked a negative exponent`).toBeGreaterThan(0);
    }
  });

  it("always offers the base, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(logRules, lvl, "log-rules")) {
        const { base } = parse(q);
        // Distinct first: `base === exponent` is thrown away at the draw, which is the only
        // thing standing between this assertion and a silently backfilled off-by-one.
        expect(String(base), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer its base`).toContain(String(base));
      }
    }
  });

  it("says the base aloud even where the page leaves it implicit", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(logRules, lvl, "log-rules")) {
        const { base } = parse(q);
        expect(q.readAloud, q.readAloud).toContain(`log base ${base} of`);
        expect(q.readAloud, q.readAloud).not.toMatch(/[₂₃₅()\/-]/);
      }
    }
    // `log(1000)`, not `log₁₀(1000)` — but the spoken form says "log base 10" anyway.
    const commonLogs = draws(logRules, 4, "log-rules").filter((q) => parse(q).base === 10);
    expect(commonLogs.length, "level 4 never drew a common log").toBeGreaterThan(0);
    for (const q of commonLogs) expect(q.prompt, q.prompt).toMatch(/^What is log\(/);
  });
});

describe("fn-compose", () => {
  const COEF_MAX = [3, 4, 5, 5, 5];
  const CONST_MAX = [5, 6, 8, 8, 8];
  const INPUT_MAX = [5, 8, 10, 10, 10];

  const parse = (q: Question) => {
    const m = /^If f\(x\) = (-?\d*)x ([+\-]) (\d+) and g\(x\) = (-?\d*)x ([+\-]) (\d+), what is f\(g\((-?\d+)\)\)\?$/.exec(q.prompt);
    expect(m, `fn-compose wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const coef = (t: string) => (t === "" ? 1 : t === "-" ? -1 : Number(t));
    return {
      a: coef(m![1]), b: (m![2] === "+" ? 1 : -1) * Number(m![3]),
      c: coef(m![4]), d: (m![5] === "+" ? 1 : -1) * Number(m![6]),
      at: Number(m![7]),
    };
  };

  it("composes inner function first, inside the level's coefficients and inputs", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fnCompose, lvl, "fn-compose")) {
        const { a, b, c, d, at } = parse(q);
        expect(Number(q.answer), `${q.prompt} answered ${q.answer}`).toBe(a * (c * at + d) + b);
        for (const coefficient of [a, c]) {
          expect(Math.abs(coefficient), q.prompt).toBeGreaterThanOrEqual(1);
          expect(Math.abs(coefficient), q.prompt).toBeLessThanOrEqual(COEF_MAX[lvl]);
        }
        for (const constant of [b, d]) {
          expect(Math.abs(constant), q.prompt).toBeGreaterThanOrEqual(1);
          expect(Math.abs(constant), q.prompt).toBeLessThanOrEqual(CONST_MAX[lvl]);
        }
        expect(Math.abs(at), q.prompt).toBeLessThanOrEqual(INPUT_MAX[lvl]);
        // Negative constants join at level 3; negative coefficients and inputs at level 4.
        if (lvl <= 2) for (const v of [b, d]) expect(v, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThan(0);
        if (lvl <= 3) {
          for (const v of [a, c]) expect(v, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThan(0);
          expect(at, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
    for (const [lvl, check] of [[3, (p: ReturnType<typeof parse>) => p.b < 0 || p.d < 0], [4, (p: ReturnType<typeof parse>) => p.a < 0 || p.c < 0 || p.at < 0]] as const) {
      expect(draws(fnCompose, lvl, "fn-compose").filter((q) => check(parse(q))).length, `level ${lvl} never went negative`).toBeGreaterThan(0);
    }
  });

  it("always offers the order reversed, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fnCompose, lvl, "fn-compose")) {
        const { a, b, c, d, at } = parse(q);
        // Distinct first. The two compositions agree when d(a - 1) = b(c - 1) — at a = c = 1,
        // for one — and that draw is thrown away precisely so this holds; without the throw
        // `pickDistinct` backfills a near-miss and the `toContain` passes on the answer.
        expect(String(c * (a * at + b) + d), `${q.prompt} composes the same both ways`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer g(f(x))`).toContain(String(c * (a * at + b) + d));
        expect(String(a * at + b), `${q.prompt} answers with f alone`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer f alone`).toContain(String(a * at + b));
        expect(String(c * at + d), `${q.prompt} answers with g alone`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer g alone`).toContain(String(c * at + d));
      }
    }
  });

  it("speaks the functions rather than reading out brackets", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(fnCompose, lvl, "fn-compose")) {
        expect(q.readAloud, q.readAloud).toContain("f of g of");
        expect(q.readAloud, q.readAloud).not.toMatch(/[()-]/);
      }
    }
  });
});

describe("every grade 11 level offers something no earlier level can ask", () => {
  const LADDERS: [string, (l: number, r: Rng, s: string) => Question][] = [
    ["quad-formula", quadFormula],
    ["poly-ops", polyOps],
    ["radical-ops", radicalOps],
    ["log-rules", logRules],
    ["fn-compose", fnCompose],
  ];

  it.each(LADDERS)("%s climbs", (skillId, gen) => {
    const seen = new Set<string>();
    for (const lvl of LEVELS) {
      const here = new Set(draws(gen, lvl, skillId).map((q) => q.prompt));
      if (lvl > 0) {
        const fresh = [...here].filter((p) => !seen.has(p));
        expect(
          fresh.length,
          `${skillId} level ${lvl} can ask nothing level ${lvl - 1} could not — ${here.size} questions, all already reachable`,
        ).toBeGreaterThan(0);
      }
      for (const p of here) seen.add(p);
    }
  });
});

describe("unit-circle", () => {
  /** How far round the circle each level may reach, in degrees and in radians. */
  const ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
  const REACH = [5, 9, 16, 16, 16];
  const RADIAN_REACH = [0, 0, 0, 9, 16];

  /**
   * A canonical answer as a NUMBER. Useless as an answer — `Math.cos(Math.PI / 3)` is
   * `0.5000000000000001` and no child could pick it — and exactly right as an audit, because
   * it compares two choices by VALUE rather than by spelling, and because it lets this file
   * check the generator's table against `Math.cos` without ever holding a table of its own.
   */
  const value = (text: string): number => {
    const m = /^(-)?(√)?(\d+)(?:\/(\d+))?$/.exec(text);
    expect(m, `not a value the unit circle takes: ${text}`).not.toBeNull();
    const top = m![2] === "√" ? Math.sqrt(Number(m![3])) : Number(m![3]);
    return ((m![1] === "-" ? -1 : 1) * top) / (m![4] === undefined ? 1 : Number(m![4]));
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  const parse = (q: Question) => {
    const m = /^What is (sin|cos)\((\d+°|\d*π(?:\/\d+)?)\)\?$/.exec(q.prompt);
    expect(m, `unit-circle wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const radians = !m![2].endsWith("°");
    let degrees: number;
    if (radians) {
      const r = /^(\d*)π(?:\/(\d+))?$/.exec(m![2])!;
      degrees = (180 * (r[1] === "" ? 1 : Number(r[1]))) / (r[2] === undefined ? 1 : Number(r[2]));
    } else {
      degrees = Number(m![2].slice(0, -1));
    }
    return { cosine: m![1] === "cos", degrees, radians };
  };

  it("names the value the circle really takes, inside the level's reach", () => {
    for (const lvl of LEVELS) {
      const used = new Set<number>();
      for (const q of draws(unitCircle, lvl, "unit-circle")) {
        const { cosine, degrees, radians } = parse(q);
        used.add(degrees);
        const reach = ANGLES.slice(0, radians ? RADIAN_REACH[lvl] : REACH[lvl]);
        expect(reach, `level ${lvl} reached ${degrees}°`).toContain(degrees);
        // Checked against the real trigonometric function, to a tolerance. The generator may
        // not compute this value and this file may not print it; comparing them is the point.
        const truth = cosine ? Math.cos((degrees * Math.PI) / 180) : Math.sin((degrees * Math.PI) / 180);
        expect(near(value(q.answer), truth), `${q.prompt} answered ${q.answer}`).toBe(true);
        // No two choices may be the same number differently spelled: that is a question with
        // two right answers, and no `toContain` below would notice it.
        expect(new Set(q.choices.map((c) => value(c).toFixed(9))).size, `${q.prompt} offers one value twice`).toBe(4);
        // Radians join at level 3 and never before.
        if (lvl <= 2) expect(radians, `level ${lvl} asked ${q.prompt}`).toBe(false);
      }
      expect([...used].sort((a, b) => a - b), `level ${lvl} never used every angle it allows`).toEqual(ANGLES.slice(0, REACH[lvl]));
    }
    for (const lvl of [3, 4]) {
      const inRadians = draws(unitCircle, lvl, "unit-circle").filter((q) => parse(q).radians);
      expect(inRadians.length, `level ${lvl} never asked in radians`).toBeGreaterThan(0);
      for (const q of inRadians) expect(parse(q).degrees, `level ${lvl} asked ${q.prompt}`).toBeLessThanOrEqual(ANGLES[RADIAN_REACH[lvl] - 1]);
    }
  });

  it("offers the other function and the sign flipped, and the only gaps are the angles that have none", () => {
    for (const lvl of LEVELS) {
      const sameBoth = new Set<number>();
      const noSign = new Set<number>();
      for (const q of draws(unitCircle, lvl, "unit-circle")) {
        const { cosine, degrees } = parse(q);
        const radians = (degrees * Math.PI) / 180;
        const other = cosine ? Math.sin(radians) : Math.cos(radians);
        const answer = value(q.answer);
        const values = q.choices.map(value);
        // Distinct first, by value rather than by spelling: at 45° the sine and the cosine ARE
        // the same number, and `pickDistinct` backfills a near-miss rather than reporting that
        // the mandatory wrong reading is the right one.
        if (near(other, answer)) sameBoth.add(degrees);
        else expect(values.some((v) => near(v, other)), `${q.prompt} does not offer the other function`).toBe(true);
        if (near(answer, 0)) noSign.add(degrees);
        else expect(values.some((v) => near(v, -answer)), `${q.prompt} does not offer the sign flipped`).toBe(true);
      }
      // The exceptions are named, not open-ended: the sine and the cosine meet only on the
      // diagonal, and only zero has no other sign.
      expect([...sameBoth].sort((a, b) => a - b).filter((d) => d !== 45 && d !== 225), `level ${lvl}`).toEqual([]);
      expect([...noSign].sort((a, b) => a - b).filter((d) => ![0, 90, 180, 270].includes(d)), `level ${lvl}`).toEqual([]);
      // And both exceptions really happen, so the branches above are not decoration.
      expect(sameBoth.has(45), `level ${lvl} never met the diagonal`).toBe(true);
      expect(noSign.size, `level ${lvl} never answered zero`).toBeGreaterThan(0);
    }
  });

  it("speaks the angle rather than printing a degree sign or a pi", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(unitCircle, lvl, "unit-circle")) {
        const { cosine, degrees, radians } = parse(q);
        expect(q.readAloud, q.readAloud).toContain(cosine ? "the cosine of" : "the sine of");
        expect(q.readAloud, q.readAloud).toContain(radians ? "pi" : `${degrees} degrees`);
        expect(q.readAloud, q.readAloud).not.toMatch(/[°π\/-]/);
      }
    }
  });
});

describe("sequences", () => {
  const START_MAX = [9, 12, 15, 6, 9];
  const DIFF_MAX = [5, 8, 9, 3, 3];
  const TERM_MAX = [8, 10, 12, 8, 8];

  const parse = (q: Question) => {
    const m = /^An (arithmetic|geometric) sequence starts at (-?\d+) with common (difference|ratio) (-?\d+)\. What is the (\d+)(?:st|nd|rd|th) term\?$/.exec(q.prompt);
    expect(m, `sequences wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const geometric = m![1] === "geometric";
    expect(m![3], `an ${m![1]} sequence has no common ${m![3]}: ${q.prompt}`).toBe(geometric ? "ratio" : "difference");
    return { geometric, start: Number(m![2]), step: Number(m![4]), index: Number(m![5]) };
  };

  it("names the term the sequence really has, inside the level's start, step and index", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(sequences, lvl, "sequences")) {
        const { geometric, start, step, index } = parse(q);
        // The closed form here; `drill-verify.ts` counts the sequence out instead. The two
        // agree only if neither of them is off by a term, which is the mistake this skill is for.
        const term = geometric ? start * step ** (index - 1) : start + (index - 1) * step;
        expect(Number(q.answer), `${q.prompt} answered ${q.answer}`).toBe(term);
        expect(Math.abs(term), `${q.prompt} is an exercise in copying digits`).toBeLessThanOrEqual(6000);
        expect(start, q.prompt).toBeGreaterThanOrEqual(geometric ? 2 : 1);
        expect(start, q.prompt).toBeLessThanOrEqual(START_MAX[lvl]);
        expect(Math.abs(step), q.prompt).toBeGreaterThanOrEqual(2);
        expect(Math.abs(step), q.prompt).toBeLessThanOrEqual(DIFF_MAX[lvl]);
        expect(index, q.prompt).toBeGreaterThanOrEqual(5);
        expect(index, q.prompt).toBeLessThanOrEqual(TERM_MAX[lvl]);
        // Geometric from level 3; a negative difference from 2; a negative ratio at 4.
        expect(geometric, `level ${lvl} asked ${q.prompt}`).toBe(lvl >= 3);
        if (lvl <= 1 || lvl === 3) expect(step, `level ${lvl} went negative: ${q.prompt}`).toBeGreaterThan(0);
      }
    }
    for (const [lvl, wanted] of [[2, "a negative common difference"], [4, "a negative common ratio"]] as const) {
      expect(draws(sequences, lvl, "sequences").filter((q) => parse(q).step < 0).length, `level ${lvl} never drew ${wanted}`).toBeGreaterThan(0);
    }
  });

  it("offers the term one step further on, the sum and the step applied once, none of them the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(sequences, lvl, "sequences")) {
        const { geometric, start, step, index } = parse(q);
        const wrong = geometric
          ? [start * step ** index, (start * (step ** index - 1)) / (step - 1), start * step]
          : [start + index * step, (index * (2 * start + (index - 1) * step)) / 2, start + step];
        for (const mistake of wrong) {
          // Distinct first. The off-by-one term differs from the answer by a whole step, which
          // is never zero; the sum can land on a later term when the difference is negative,
          // and that draw is thrown away precisely so this holds rather than being backfilled.
          expect(String(mistake), `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${mistake}`).toContain(String(mistake));
        }
      }
    }
  });

  it("says the ordinal as a word, so read-aloud never reads out a suffix", () => {
    const WORDS = ["fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
    for (const lvl of LEVELS) {
      for (const q of draws(sequences, lvl, "sequences")) {
        const { index } = parse(q);
        expect(q.readAloud, q.readAloud).toContain(`the ${WORDS[index - 5]} term`);
        expect(q.readAloud, q.readAloud).not.toMatch(/\d(?:st|nd|rd|th)|[-\/]/);
      }
    }
  });
});

describe("probability", () => {
  const COLORS = [2, 2, 3, 2, 3];
  const COUNT_MAX = [5, 9, 9, 6, 6];
  const DRAWS = [1, 1, 1, 2, 2];

  const factor = (a: number, b: number): number => (b === 0 ? a : factor(b, a % b));
  const reduce = (n: number, d: number): string => {
    const g = factor(n, d) || 1;
    return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
  };

  const parse = (q: Question) => {
    const m = /^A bag has (.+?) marbles\.(.*) What is the probability (of drawing|that both are) ([a-z]+)\?$/.exec(q.prompt);
    expect(m, `probability wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const twoDraws = m![2] === " One marble is drawn and put back, then another is drawn.";
    expect(m![2] === "" || twoDraws, `a drawing this cannot read: ${q.prompt}`).toBe(true);
    expect(m![3], `${q.prompt} draws and asks about different things`).toBe(twoDraws ? "that both are" : "of drawing");
    const bag = new Map<string, number>();
    for (const part of m![1].split(/, | and /)) {
      const counted = /^(\d+) ([a-z]+)$/.exec(part);
      expect(counted, `a colour this cannot read, "${part}", in: ${q.prompt}`).not.toBeNull();
      bag.set(counted![2], Number(counted![1]));
    }
    return { bag, asked: m![4], twoDraws };
  };

  it("gives the bag the probability it really has, inside the level's colours and counts", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(probability, lvl, "probability")) {
        const { bag, asked, twoDraws } = parse(q);
        expect(bag.size, `level ${lvl} drew ${bag.size} colours`).toBe(COLORS[lvl]);
        expect(twoDraws, `level ${lvl} asked ${q.prompt}`).toBe(DRAWS[lvl] === 2);
        for (const [, count] of bag) {
          expect(count, q.prompt).toBeGreaterThanOrEqual(1);
          expect(count, q.prompt).toBeLessThanOrEqual(COUNT_MAX[lvl]);
        }
        const total = [...bag.values()].reduce((sum, c) => sum + c, 0);
        const favourable = bag.get(asked) ?? 0;
        expect(favourable, `${q.prompt} asks for a colour the bag does not hold`).toBeGreaterThan(0);
        expect(q.answer, `${q.prompt} answered ${q.answer}`)
          .toBe(twoDraws ? reduce(favourable * favourable, total * total) : reduce(favourable, total));
        // An even split makes the complement the answer, so the bag never holds one.
        expect(favourable, `${q.prompt} splits the bag in half`).not.toBe(total - favourable);
      }
    }
  });

  it("offers the complement and the part over the other part, neither of them the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(probability, lvl, "probability")) {
        const { bag, asked, twoDraws } = parse(q);
        const total = [...bag.values()].reduce((sum, c) => sum + c, 0);
        const favourable = bag.get(asked)!;
        const other = total - favourable;
        const wrong = twoDraws
          ? [reduce(total * total - favourable * favourable, total * total), reduce(favourable * favourable, other * other)]
          : [reduce(other, total), reduce(favourable, other), String(favourable)];
        for (const mistake of wrong) {
          // Distinct first: the complement is the answer whenever the bag splits evenly, which
          // is the draw thrown away above. Without that throw `pickDistinct` would put a
          // near-miss here and this `toContain` would pass while testing nothing.
          expect(mistake, `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${mistake}`).toContain(mistake);
        }
      }
    }
  });

  it("is speakable as written, so the spoken form is the prompt itself", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(probability, lvl, "probability")) {
        expect(q.readAloud, q.readAloud).toBe(q.prompt);
        expect(q.readAloud, q.readAloud).not.toMatch(/[-×÷%²³√π^\/¢$]/);
      }
    }
  });
});

describe("rational-expr", () => {
  // Hand-written, not imported: the ladder used to be [15, 15, 20, 9, 9] because levels 0-2
  // were difference-of-squares only and had one number to move. Both shapes are drawn at
  // every rung now, so the span climbs.
  const SPAN = [10, 12, 15, 15, 20];

  /** A linear or quadratic factor to its constant term, strictly spelled. */
  const constantOf = (text: string): number => {
    const m = /^x ([+-]) (\d+)$/.exec(text);
    expect(m, `not a factor a child can read: ${text}`).not.toBeNull();
    return (m![1] === "+" ? 1 : -1) * Number(m![2]);
  };
  /** The generator's own spelling of `x + q`, written out here so the SPELLING is pinned. */
  const linearText = (constant: number): string => `x ${constant < 0 ? "-" : "+"} ${Math.abs(constant)}`;

  const parse = (q: Question) => {
    const m = /^Simplify: \(([^()]+)\) \/ \(([^()]+)\)$/.exec(q.prompt);
    expect(m, `rational-expr wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const p = constantOf(m![2]);
    // The numerator is read back as a polynomial and its constant divided by the denominator's,
    // which recovers the factor that stayed without this file ever seeing the generator's draw.
    // `(\d*)x`, not `(\d+)x`: a middle coefficient of one is left unwritten, so `x² - x - 2`
    // is a quadratic a child reads and a pattern this has to accept.
    const numerator = /^x²(?: ([+-]) (\d*)x)? ([+-]) (\d+)$/.exec(m![1]);
    expect(numerator, `not a quadratic a child can read: ${m![1]}`).not.toBeNull();
    const middle = numerator![1] === undefined ? 0 : (numerator![1] === "+" ? 1 : -1) * (numerator![2] === "" ? 1 : Number(numerator![2]));
    const constant = (numerator![3] === "+" ? 1 : -1) * Number(numerator![4]);
    // `=== 0` rather than `toBe(0)`: `-81 % 9` is `-0`, and `-0` is not `0` to `toBe`.
    expect(constant % p === 0, `${m![2]} does not divide ${m![1]}`).toBe(true);
    const q2 = constant / p;
    expect(middle, `${m![1]} does not factor through ${m![2]}`).toBe(p + q2);
    return { p, q: q2, middle, constant };
  };

  it("cancels a real factor, inside the level's span and shape", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(rationalExpr, lvl, "rational-expr")) {
        const { p, q: stays } = parse(q);
        expect(q.answer, `${q.prompt} answered ${q.answer}`).toBe(linearText(stays));
        for (const constant of [p, stays]) {
          expect(Math.abs(constant), q.prompt).toBeGreaterThanOrEqual(1);
          expect(Math.abs(constant), q.prompt).toBeLessThanOrEqual(SPAN[lvl]);
        }
        expect(p, `${q.prompt} cancels the factor it keeps`).not.toBe(stays);
        // `(x + 1)` on the bottom would make "the numerator's constant carried straight down"
        // the right answer, and it is one of the wrong ones.
        expect(Math.abs(p), `${q.prompt} divides by a factor of 1`).toBeGreaterThanOrEqual(2);
        // A plus in the denominator until level 1, and a quotient of `x - k` that is not the
        // denominator's conjugate only from level 3. A difference of squares gives a negative
        // quotient at every level, which is what a difference of squares is.
        if (lvl === 0) expect(p, `level 0 printed a minus in its denominator: ${q.prompt}`).toBeGreaterThan(0);
        if (lvl <= 2 && stays < 0) expect(stays, `level ${lvl} kept a negative that is not a conjugate: ${q.prompt}`).toBe(-p);
      }
    }

    /**
     * Every rung reaches a shape and a size the rung below it cannot, and both shapes are
     * reachable everywhere. This is the half that `toBeLessThanOrEqual` on a span cannot say:
     * a ceiling pins how far a level may go and nothing at all about whether it gets there,
     * and a rung that never uses what it was given is a rung that changed nothing.
     */
    for (const [lvl, what, reaches] of [
      [0, "a difference of squares", (r: ReturnType<typeof parse>) => r.q === -r.p],
      [0, "a general trinomial", (r: ReturnType<typeof parse>) => r.q !== -r.p],
      [1, "a minus in the denominator", (r: ReturnType<typeof parse>) => r.p < 0],
      [1, "a difference of squares", (r: ReturnType<typeof parse>) => r.q === -r.p],
      [2, "a constant past level 1's span", (r: ReturnType<typeof parse>) => Math.max(Math.abs(r.p), Math.abs(r.q)) > SPAN[1]],
      [3, "a negative quotient that is not a conjugate", (r: ReturnType<typeof parse>) => r.q < 0 && r.q !== -r.p],
      [4, "a constant past level 3's span", (r: ReturnType<typeof parse>) => Math.max(Math.abs(r.p), Math.abs(r.q)) > SPAN[3]],
    ] as const) {
      const reached = draws(rationalExpr, lvl, "rational-expr").filter((q) => reaches(parse(q))).length;
      expect(reached, `level ${lvl} never reached ${what}`).toBeGreaterThan(0);
    }
  });

  /**
   * **Every choice is linear.** Two of the four used to be quadratics — the numerator handed
   * back unfactored, and the constants cancelled where they stood — and a quadratic cannot be
   * the quotient of a quadratic by a linear factor, so both were free eliminations and the
   * question was a coin toss between the two that remained.
   */
  it("offers four expressions that could each be the quotient", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(rationalExpr, lvl, "rational-expr")) {
        for (const choice of q.choices) {
          expect(choice, `${q.prompt} offers ${choice}, which cannot be a quotient here`).toMatch(/^x [+-] \d+$/);
        }
      }
    }
  });

  /**
   * The conjugate of the denominator — `x - p` for a denominator of `(x + p)` — is the answer
   * when the numerator is a difference of squares and a mistake when it is not. This is the
   * whole fix: a child who has learned one rule and applies it everywhere finds their reading
   * on screen on a general draw and finds out it is wrong.
   *
   * `not.toBe(q.answer)` beside the `toContain` is not decoration. When a characteristic wrong
   * answer equals the right one the choice builder skips it and backfills a near miss, so a
   * `toContain` on its own would pass whether the reading was offered or was the answer.
   */
  it("offers the difference-of-squares reading as a mistake whenever it is one", () => {
    for (const lvl of LEVELS) {
      let squares = 0, general = 0;
      for (const q of draws(rationalExpr, lvl, "rational-expr")) {
        const { p, q: stays } = parse(q);
        if (stays === -p) {
          squares += 1;
          // On a difference of squares the conjugate IS the answer, and the denominator itself
          // — the factor that cancelled, kept instead of the one that stayed — is the mistake.
          expect(q.answer, q.prompt).toBe(linearText(-p));
          expect(q.choices, `${q.prompt} does not offer ${linearText(p)}`).toContain(linearText(p));
        } else {
          general += 1;
          expect(linearText(-p), `${q.prompt} offers its own answer as a mistake`).not.toBe(q.answer);
          expect(q.choices, `${q.prompt} does not offer ${linearText(-p)}`).toContain(linearText(-p));
        }
      }
      // Both shapes on every rung, in quantity: a rung that was 99% one of them would let
      // "flip the sign" or "never flip the sign" be a rule again.
      expect(squares / (squares + general), `level ${lvl} draws a difference of squares ${squares} times in ${squares + general}`).toBeGreaterThan(0.15);
      expect(squares / (squares + general), `level ${lvl} draws a difference of squares ${squares} times in ${squares + general}`).toBeLessThan(0.6);
    }
  });

  /**
   * The other two readings, each a real one and each impossible to be the answer: the sign of
   * the constant flipped (`q ≠ 0`), the numerator's constant carried straight down (`|p| ≥ 2`,
   * so `pq ≠ q`), the middle coefficient taken for the constant (`p ≠ 0`), and the factor that
   * cancelled kept instead of the one that stayed (`p ≠ q`). Which of them a question shows is
   * drawn, so this asserts each is BOTH reachable and never right, rather than pinning a set
   * that would put the answer's neighbours in the same place on every question.
   */
  it("draws its other mistakes from real readings, none of which can be the answer", () => {
    for (const lvl of LEVELS) {
      const seen = new Map<string, number>();
      for (const q of draws(rationalExpr, lvl, "rational-expr")) {
        const { p, q: stays, middle, constant } = parse(q);
        const readings: [string, number][] = [
          ["the sign flipped", -stays],
          ["the numerator's constant", constant],
          ["the middle coefficient", middle],
          ["the factor that cancelled", p],
        ];
        for (const [name, k] of readings) {
          if (k === 0) continue;                       // `x + 0` is never printed as a choice
          expect(linearText(k), `${q.prompt} offers ${name} as a mistake and it is the answer`).not.toBe(q.answer);
          if (q.choices.includes(linearText(k))) seen.set(name, (seen.get(name) ?? 0) + 1);
        }
      }
      for (const name of ["the sign flipped", "the numerator's constant", "the factor that cancelled"]) {
        expect(seen.get(name) ?? 0, `level ${lvl} never offers ${name}`).toBeGreaterThan(0);
      }
    }
  });

  it("speaks the fraction bar and the square rather than printing them", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(rationalExpr, lvl, "rational-expr")) {
        expect(q.readAloud, q.readAloud).toContain("all over");
        expect(q.readAloud, q.readAloud).toContain("x squared");
        expect(q.readAloud, q.readAloud).not.toMatch(/[²³()\/-]/);
      }
    }
  });
});

describe("log-eq", () => {
  const BASES = [[2, 3, 5], [2, 3, 5, 10], [2, 3, 5, 10], [2, 3, 5, 10], [2, 3, 5, 10]];
  const EXP_MAX = [5, 6, 6, 6, 6];
  const SUBSCRIPTS: Record<string, number> = { "₂": 2, "₃": 3, "₅": 5, "": 10 };

  const parse = (q: Question) => {
    const exponential = /^Solve: (\d+)\^(?:x|\(x ([+\-]) (\d+)\)) = (\d+|1\/\d+)$/.exec(q.prompt);
    if (exponential) {
      const fraction = /^1\/(\d+)$/.exec(exponential[4]);
      return {
        asksLog: false,
        base: Number(exponential[1]),
        shift: exponential[2] === undefined ? 0 : (exponential[2] === "+" ? 1 : -1) * Number(exponential[3]),
        power: Number(fraction ? fraction[1] : exponential[4]),
        negative: fraction !== null,
      };
    }
    const logarithmic = /^Solve: log([₂₃₅]?)\(x\) = (-?\d+)$/.exec(q.prompt);
    expect(logarithmic, `log-eq wrote a prompt a child cannot read: ${q.prompt}`).not.toBeNull();
    const exponent = Number(logarithmic![2]);
    return { asksLog: true, base: SUBSCRIPTS[logarithmic![1]], shift: 0, power: SUBSCRIPTS[logarithmic![1]] ** Math.abs(exponent), negative: exponent < 0 };
  };

  it("names a solution that really does satisfy the equation, inside the level's bases and exponents", () => {
    for (const lvl of LEVELS) {
      const used = new Set<number>();
      for (const q of draws(logEq, lvl, "log-eq")) {
        const { asksLog, base, shift, power, negative } = parse(q);
        used.add(base);
        expect(BASES[lvl], `level ${lvl} drew base ${base}`).toContain(base);
        expect(power, `${q.prompt} counts zeros rather than testing exponents`).toBeLessThanOrEqual(100000);
        // Raised back up rather than divided down: the base to the exponent must be the power.
        let exponent = 0;
        for (let value = power; value > 1; value /= base) {
          expect(value % base, `${power} is not a whole power of ${base}: ${q.prompt}`).toBe(0);
          exponent += 1;
        }
        expect(exponent, q.prompt).toBeGreaterThanOrEqual(1);
        expect(exponent, q.prompt).toBeLessThanOrEqual(EXP_MAX[lvl]);
        if (asksLog) {
          expect(q.answer, `${q.prompt} answered ${q.answer}`).toBe(negative ? `1/${power}` : String(power));
        } else {
          expect(Number(q.answer), `${q.prompt} answered ${q.answer}`).toBe((negative ? -exponent : exponent) - shift);
        }
        expect(Math.abs(shift), q.prompt).toBeLessThanOrEqual(3);
        // The logarithmic frame joins at level 2, a unit fraction at 3, a shifted exponent at 4.
        if (lvl <= 1) expect(asksLog, `level ${lvl} asked ${q.prompt}`).toBe(false);
        if (lvl <= 2) expect(negative, `level ${lvl} asked ${q.prompt}`).toBe(false);
        if (lvl <= 3) expect(shift, `level ${lvl} asked ${q.prompt}`).toBe(0);
      }
      expect([...used].sort((x, y) => x - y), `level ${lvl} never used every base it allows`).toEqual(BASES[lvl]);
    }
    for (const [lvl, check, wanted] of [
      [2, (p: ReturnType<typeof parse>) => p.asksLog, "the logarithmic frame"],
      [3, (p: ReturnType<typeof parse>) => p.negative, "a unit fraction"],
      [4, (p: ReturnType<typeof parse>) => p.shift !== 0, "a shifted exponent"],
    ] as const) {
      expect(draws(logEq, lvl, "log-eq").filter((q) => check(parse(q))).length, `level ${lvl} never asked ${wanted}`).toBeGreaterThan(0);
    }
  });

  it("always offers the base, and it is never the answer", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(logEq, lvl, "log-eq")) {
        const { base } = parse(q);
        // Distinct first: `3ˣ = 27` and `log₂(x) = 1` both answer with their own base, and both
        // are thrown away at the draw so that this holds rather than being backfilled away.
        expect(String(base), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} does not offer its base`).toContain(String(base));
      }
    }
  });

  it("says the base and the power aloud, and never reads out a caret", () => {
    for (const lvl of LEVELS) {
      for (const q of draws(logEq, lvl, "log-eq")) {
        const { asksLog, base, shift } = parse(q);
        expect(q.readAloud, q.readAloud).toContain(asksLog ? `log base ${base} of x` : `${base} to the power`);
        if (shift !== 0) expect(q.readAloud, q.readAloud).toContain("the quantity x");
        expect(q.readAloud, q.readAloud).not.toMatch(/[₂₃₅()\^\/-]/);
      }
    }
  });
});

describe("every grade 12 level offers something no earlier level can ask", () => {
  const LADDERS: [string, (l: number, r: Rng, s: string) => Question][] = [
    ["unit-circle", unitCircle],
    ["sequences", sequences],
    ["probability", probability],
    ["rational-expr", rationalExpr],
    ["log-eq", logEq],
  ];

  it.each(LADDERS)("%s climbs", (skillId, gen) => {
    const seen = new Set<string>();
    for (const lvl of LEVELS) {
      const here = new Set(draws(gen, lvl, skillId).map((q) => q.prompt));
      if (lvl > 0) {
        const fresh = [...here].filter((p) => !seen.has(p));
        expect(
          fresh.length,
          `${skillId} level ${lvl} can ask nothing level ${lvl - 1} could not — ${here.size} questions, all already reachable`,
        ).toBeGreaterThan(0);
      }
      for (const p of here) seen.add(p);
    }
  });
});

describe("radical-ops cannot be answered by looking at the coefficient", () => {
  /**
   * Found by reading the `/dev/content` page rather than by any test: at level 0 the only
   * square factor is 4, so every answer reads `2√something`, and the other three choices were
   * an integer, a bare root, and a different coefficient. A child who always picked the
   * option starting with 2 scored 100% without simplifying anything — ten of ten sampled
   * questions confirmed it.
   *
   * The same shape as the number-line question that was answerable by "the answer must be
   * under 1". A question a child can pass by looking is not a question.
   */
  it.each([0, 1, 2, 3, 4])("level %i always offers a wrong answer with the answer's coefficient", (lvl) => {
    for (const q of draws(radicalOps, lvl, "radical-ops")) {
      const answer = /^(\d+)√/.exec(q.answer);
      if (!answer) continue; // a perfect square answers as a bare integer; nothing to match
      const sameCoefficient = q.choices.filter((c) => c !== q.answer && c.startsWith(`${answer[1]}√`));
      expect(
        sameCoefficient.length,
        `${q.prompt} → ${q.answer}; choices ${q.choices.join(", ")} — the answer is the only one starting ${answer[1]}√`
      ).toBeGreaterThan(0);
    }
  });
});
