/**
 * Range and ladder checks for grades 9, 10 and 11.
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
  inequalities,
  multiStepEq,
  similarTri,
  slopeIntercept,
  solidMeasure,
  systemsEq,
  trigRatios,
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
