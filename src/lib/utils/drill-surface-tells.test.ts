import { describe, it, expect } from "vitest";
import { GENERATORS, seededRng, type Question } from "./drill-generators";

/**
 * **A question a child can pass by looking is not a question.**
 *
 * Every other check in this bank asks whether the answer is RIGHT. Nothing asked whether it
 * could be found without doing the mathematics, and six times in this plan it could be —
 * number-line fractions answerable by "it must be under 1", an exponent question whose
 * mandatory wrong answer equalled the right one, radical simplification where every answer
 * began `2√`, and then the three this file was written for:
 *
 *  - **`mul-multi` and `mul-standard`**: one wrong answer was always the right one with a
 *    zero on the end, and it was always the only pair of choices related by a factor of ten.
 *    2,998 of 3,000 draws. Simpler still, and simpler than anyone noticed: the answer was
 *    the SECOND LARGEST of the four in 2,980 of 3,000.
 *  - **`percent-change`**: at the rung every grade-7 child starts on, the answer was
 *    provably the largest choice — 299 of 300 — and the decimal-slip distractor was on
 *    screen in 284 of 300 and never right, a free elimination down to three.
 *  - **`rational-expr`**: at three of five rungs the answer was exactly the denominator with
 *    its sign flipped, 900 of 900, and only two of the four choices were ever linear, so the
 *    other two rungs were a coin toss.
 *
 * Every one of those was found by a person reading questions. This file is the check that
 * would have found them instead, and the shape of it is: sample a skill across its levels,
 * and assert the answer is **not identifiable by a surface feature** — not always the
 * largest, not always at one position in the order, not always the only choice of its
 * shape, not always related to another choice by a factor of ten.
 *
 * It is a SAMPLING check, like the ladder census in `drill-verify.test.ts`, and it is honest
 * about that: it can prove a tell is there and can only fail to find one that is not. The
 * bounds below are written as rates rather than absolutes for the same reason — a wrong
 * answer that happens to be ten times another once in three hundred draws is a coincidence,
 * and one that does it three hundred times is a rule a child will learn.
 */

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 31 + 5);

function draws(genId: string, skillId: string, level: number): Question[] {
  return SEEDS.flatMap((seed) => {
    const rng = seededRng(seed);
    return Array.from({ length: 5 }, () => GENERATORS[genId](level, rng, skillId));
  });
}

/** A choice read as a number, with the units a screen shows stripped off. `null` if it is not one. */
function value(choice: string): number | null {
  const bare = choice.replace(/[$%¢,\s]/g, "");
  const fraction = /^(-?\d+)\/(\d+)$/.exec(bare);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return /^-?\d+(\.\d+)?$/.test(bare) ? Number(bare) : null;
}

/**
 * Where the answer sits among the four choices in order, 1 for the smallest and 4 for the
 * largest. Choices are distinct by the time they reach a child, so there are no ties.
 */
function rank(q: Question): number {
  const values = q.choices.map(value);
  expect(values.every((v) => v !== null), `a choice of "${q.prompt}" is not a number`).toBe(true);
  return (values as number[]).sort((a, b) => a - b).indexOf(value(q.answer)!) + 1;
}

/** The fraction of a sample for which something holds, printed as `n/total` on failure. */
function rateOf<T>(items: T[], holds: (item: T) => boolean): { rate: number; text: string } {
  const n = items.filter(holds).length;
  return { rate: n / items.length, text: `${n}/${items.length}` };
}

describe("the answer cannot be picked out by where it sits in the order", () => {
  /**
   * Both multiplication skills, every rung. The old construction offered
   * `[(a % 10) × b, carryDropped(a, b), answer × 10]` — two below the product and one above
   * it, in that order, forever — so the answer was the second largest of four every time.
   *
   * The bound is a rate and not "every position is reached", because the ones-digit reading
   * is deliberately kept on every question: it is the wrong answer that says what a child
   * actually did, and it is always far below the product, so the answer is never the
   * smallest of the four. That is a one-in-four elimination and it is the price of keeping
   * the one distractor this skill exists to offer. What must not survive is a position a
   * child can simply pick, so no position may carry more than half the draws.
   */
  it.each([["mul-multi"], ["mul-standard"]])("%s spreads the answer across the order", (skillId) => {
    for (const level of LEVELS) {
      const sample = draws("mul-multi", skillId, level);
      for (const position of [2, 3, 4]) {
        const { rate, text } = rateOf(sample, (q) => rank(q) === position);
        expect(rate, `${skillId} level ${level} puts the answer in position ${position} of four in ${text} draws`).toBeLessThan(0.5);
        expect(rate, `${skillId} level ${level} almost never puts the answer in position ${position} of four — ${text}`).toBeGreaterThan(0.15);
      }
    }
  });

  /**
   * `answer * 10` was a fixed member of every question's choices and nothing else was ever a
   * power of ten from anything, so "the smaller of the two that differ by a zero" was the
   * answer 2,998 times in 3,000. Written as "no choice is singled out by a factor-of-ten
   * relationship", which is the property rather than the one distractor that broke it: a
   * replacement that reintroduced `answer / 10` would fail this exactly as loudly.
   */
  it.each([["mul-multi"], ["mul-standard"]])("%s never singles the answer out by a factor of ten", (skillId) => {
    for (const level of LEVELS) {
      const sample = draws("mul-multi", skillId, level);
      const { rate, text } = rateOf(sample, (q) => {
        const values = q.choices.map((c) => value(c)!);
        const pairs = values.flatMap((x) => values.filter((y) => y === x * 10 && y !== x).map((y) => [x, y]));
        const answer = value(q.answer)!;
        return pairs.length === 1 && pairs[0].includes(answer);
      });
      expect(rate, `${skillId} level ${level} makes the answer the only choice a zero from another in ${text} draws`).toBeLessThan(0.02);
    }
  });

  /**
   * The ones-digit reading is the mistake this skill is about, so unlike everything else in
   * the pool it is offered every time — and it must never BE the answer. A `toContain` alone
   * would pass either way: when a characteristic wrong answer equals the right one the choice
   * builder quietly backfills a near miss rather than offering a duplicate, so nothing fires.
   */
  it.each([["mul-multi"], ["mul-standard"]])("%s always offers the ones digit multiplied, and it is never right", (skillId) => {
    for (const level of LEVELS) {
      for (const q of draws("mul-multi", skillId, level)) {
        const [a, b] = /^What is (\d+) × (\d+)\?$/.exec(q.prompt)!.slice(1).map(Number);
        expect(String((a % 10) * b), `${q.prompt} has two right answers`).not.toBe(q.answer);
        expect(q.choices, `${q.prompt} drops the ones-digit reading`).toContain(String((a % 10) * b));
      }
    }
  });

  /**
   * Level 0 of `percent-change` forces a rise and caps the starting price at $50, so the base
   * is always under 100 — and with a base under 100 every one of the three wrong answers was
   * PROVABLY smaller than the right one. The raw difference is less than the percent, the
   * change measured against the new price is less than the percent for any rise, and the
   * decimal slip is a hundredth of it. The entry rung of percent change was eight out of
   * eight by picking the biggest number, and mastery promoted the child to level 2 without
   * their ever having formed a ratio.
   *
   * Something always beats the answer now, so the answer is never the largest — a
   * one-in-four elimination, deliberately traded for the one-in-one it replaces, and asserted
   * below as the invariant it is rather than left to be noticed. Of the three places left,
   * none may carry more than half.
   */
  it("percent-change never lets the biggest number be the answer, and moves it about", () => {
    for (const level of LEVELS) {
      const sample = draws("percent-change", "percent-change", level);
      const beaten = rateOf(sample, (q) => q.choices.some((c) => value(c)! > value(q.answer)!));
      expect(beaten.rate, `level ${level} leaves the answer the largest choice in ${sample.length - sample.length * beaten.rate} draws`).toBe(1);
      for (const position of [1, 2, 3]) {
        const { rate, text } = rateOf(sample, (q) => rank(q) === position);
        expect(rate, `level ${level} puts the answer in position ${position} of four in ${text} draws`).toBeLessThan(0.5);
        expect(rate, `level ${level} almost never puts the answer in position ${position} of four — ${text}`).toBeGreaterThan(0.15);
      }
    }
  });

  /**
   * The ratio never multiplied by 100 — `0.02%` for 2% — stood in 284 draws of 300 at every
   * level and was never once right. A choice that is always on screen and never correct is
   * not a distractor, it is a free elimination: four choices become three before a child
   * reads the question. It is a real slip, so it stays; it may not be near-universal.
   */
  it("percent-change offers the decimal slip sometimes, not on nearly every question", () => {
    for (const level of LEVELS) {
      const sample = draws("percent-change", "percent-change", level);
      const { rate, text } = rateOf(sample, (q) => q.choices.some((c) => /^0\.\d+%$/.test(c)));
      expect(rate, `level ${level} shows the decimal slip in ${text} draws`).toBeLessThan(0.5);
      expect(rate, `level ${level} has stopped offering the decimal slip at all — ${text}`).toBeGreaterThan(0.05);
    }
  });
});

describe("the answer cannot be copied off the prompt or picked out by its shape", () => {
  /**
   * `rational-expr` levels 0, 1 and 2 were difference-of-squares only, and the quotient of a
   * difference of squares by one of its factors is the OTHER factor — which is the denominator
   * with its sign reversed, every time. 900 draws of 900. Three of five rungs were two
   * characters of pattern matching.
   *
   * The rule must be right sometimes, or "never the conjugate" becomes the new rule and a
   * child passes by refusing to apply the one thing this skill teaches. So this is a band and
   * not a ceiling: the reading has to be worth something and has to be worth losing.
   */
  it("rational-expr does not let the denominator be read for the answer", () => {
    for (const level of LEVELS) {
      const sample = draws("rational-expr", "rational-expr", level);
      const { rate, text } = rateOf(sample, (q) => {
        const denominator = /^Simplify: \([^()]+\) \/ \(x ([+-]) (\d+)\)$/.exec(q.prompt)!;
        return q.answer === `x ${denominator[1] === "+" ? "-" : "+"} ${denominator[2]}`;
      });
      expect(rate, `level ${level} answers with the denominator's sign flipped in ${text} draws`).toBeLessThan(0.6);
      expect(rate, `level ${level} has stopped asking a difference of squares at all — ${text}`).toBeGreaterThan(0.15);
    }
  });

  /**
   * Two of the four choices used to be quadratics, and a quadratic cannot be the quotient of a
   * quadratic by a linear factor — so half the screen was eliminable without reading the
   * question, and the rungs where the sign flip did not settle it were a coin toss between the
   * two survivors. Said as "every choice has the same shape", which is the property; the
   * grade-12 file pins the shape itself.
   */
  it("rational-expr gives all four choices the same shape", () => {
    for (const level of LEVELS) {
      for (const q of draws("rational-expr", "rational-expr", level)) {
        // Numbers and signs blanked out, so `x + 3` and `x - 40` are one shape and
        // `x² + 5x + 6` is another. Shape is what a child eliminates on without reading.
        const shapes = new Set(q.choices.map((c) => c.replace(/\d+/g, "n").replace(/[+-]/g, "±")));
        expect(shapes.size, `${q.prompt} offers choices of ${shapes.size} different shapes: ${q.choices.join(", ")}`).toBe(1);
      }
    }
  });
});
