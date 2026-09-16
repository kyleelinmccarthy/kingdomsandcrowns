import { describe, it, expect } from "vitest";
import { GENERATORS, seededRng, type Question } from "./drill-generators";
import { SKILLS } from "./skills";

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

/**
 * **The class is wider than the three skills above, and this is how wide.**
 *
 * The three fixes at the top of this file were each found by a person reading questions.
 * Sweeping the same measurement across every generated skill turned up more of the same: at
 * nineteen rungs the answer sat at ONE position among the four in every single draw, so "pick
 * the second smallest" or "pick the second biggest" was worth 100% without any arithmetic.
 * All nineteen were closed — `circle-measure` and `pythagorean` at every rung, `sequences` at
 * three, `dec-ops` and `quad-formula` at two, `money-coins` and `frac-equiv` at one each — and
 * the cause was the same in all of them: the wrong answers were built at fixed offsets around
 * the right one, so the same number of them landed above it and below it on every question.
 *
 * **What stood here until now was a hand-kept list of the rungs at exactly 100%, and it had
 * two faults.**
 *
 *  - **It only saw 100%.** The same sweep that found the nineteen also found `probability`
 *    level 4 at 298 of 300, `div-2digit` level 4 at 298, `volume-prism` level 3 at 295 and
 *    `frac-mul` level 4 at 294, with more rungs of all four in the high eighties and nineties.
 *    A child who learns a 99% tell scores 99%. A list that fires only at 100% is blind to the
 *    entire tier below it, and "never varies" versus "varies twice in three hundred" is not a
 *    difference a child can see.
 *  - **A named list rots.** It needs a person to maintain it, and it cannot fire for a skill
 *    nobody thought to name.
 *
 * So the list is gone and a THRESHOLD stands in its place: every generated skill at every
 * level is measured, and no position among the four may carry more than `ONE_POSITION_CEILING`
 * of the draws. Nothing has to be named for it to be caught.
 */

/**
 * **Three fifths, and here is the argument for it.**
 *
 * Four choices, so blind guessing is 25%, and the rungs fixed in the last wave sit near a
 * third each. Anything a child could learn as a rule is too high — but "too high" has to be a
 * number, and the number wants a reason that is not this file's own taste.
 *
 * The reason is the ladder in `mastery.ts`, which is what a tell actually has to beat. Seven
 * of the last eight right climbs a rung; **three of the last six wrong steps back down one.**
 * So take a child who has stopped doing the mathematics and answers a rung by its position
 * alone, right a fraction `p` of the time, and ask whether the ladder finds them out:
 *
 *   | p     | survives a six-question window | climbs a rung on an eight |
 *   | 0.25  | 0.04                           | 0.00                      |
 *   | 0.50  | 0.34                           | 0.03                      |
 *   | 0.55  | 0.44                           | 0.06                      |
 *   | 0.60  | 0.54                           | 0.11                      |
 *   | 0.70  | 0.74                           | 0.26                      |
 *
 * Below about 0.58 the ladder wins: the child is stepped down more often than not and handed
 * easier work, which is the system working. At 0.5786 it turns over, and from there the tell
 * holds the rung more often than it loses it — a child can sit on a rung indefinitely, passing
 * side quests, without ever forming a ratio or squaring a radius. That turning point is the
 * honest line, and it is where this bound is set, rounded up to a number a person can hold:
 * **no position may carry three fifths of the draws.** The two points of slack between 0.578
 * and 0.600 are worth at most a coin toss in a single window, and are the price of a bound
 * that reads as a number rather than as false precision.
 *
 * It is deliberately not a number chosen to let today's code pass: when it was written it
 * failed 41 of the 290 rungs it measures, across fourteen skills, four of them above 98%.
 */
const ONE_POSITION_CEILING = 0.6;

/**
 * **The rungs that cannot reach it, each with its reason.**
 *
 * An exemption here is a decision about the mathematics, not a way to quiet the check. The
 * test below asserts that every one of these is STILL over the ceiling, so an exemption that
 * has stopped being true is reported and must be deleted: the list can only shrink by itself,
 * never grow by itself.
 *
 * Keys are `skillId` for a whole skill or `skillId level N` for one rung.
 */
const CANNOT_BE_SPREAD = new Map<string, string>([
  [
    "compare-num",
    "the question IS the order — 'which number is the greatest?' is answered by the largest " +
    "choice because that is what it asks, and nothing is given away that the prompt does not say",
  ],
  ["compare-num-100", "the same question with larger numbers: the prompt asks for the greatest and the greatest is the answer"],
  ["fractions-compare", "same question in fractions; retired — served at no grade — and kept here so the sweep does not have to know that"],
  [
    "sub-10 level 0",
    "the whole rung lives in [0, 5] and two fifths of its answers are 0 or 1: a difference of " +
    "zero has no believable wrong answer below it, because a negative number of anything is not " +
    "a mistake a five-year-old makes, it is a number that does not belong on the screen. " +
    "The rung sits at 60.3% for that reason and cannot be moved without changing what it asks",
  ],
]);

/** The reason for a rung, or `null` if it has none. Exemptions may be per-skill or per-rung. */
function exemption(skillId: string, level: number): string | null {
  return CANNOT_BE_SPREAD.get(`${skillId} level ${level}`) ?? CANNOT_BE_SPREAD.get(skillId) ?? null;
}

/**
 * The skills whose choices are not numbers at all — expressions, times of day, points on a
 * plane, surds. There is no order for the answer to sit at, so this measurement does not
 * apply to them. They are named rather than skipped quietly: a skill that stops rendering
 * numbers would otherwise drop out of the sweep without a word, and the census would go on
 * reporting that everything it measures is fine.
 */
const NOT_NUMBERS = [
  "time-clock", "exponent-rules", "sci-notation", "factor-quad", "slope-intercept",
  "inequalities", "dist-midpoint", "poly-ops", "radical-ops", "unit-circle", "rational-expr",
];

type Rung = { skillId: string; level: number; counts: number[]; total: number; worst: number };

/** Every generated skill at every level, with where the answer sat in the order. */
function census(): { measured: Rung[]; skipped: string[] } {
  const measured: Rung[] = [];
  const skipped = new Set<string>();
  for (const skill of SKILLS) {
    if (skill.source.kind !== "generator") continue;
    for (const level of LEVELS) {
      const sample = draws(skill.source.generatorId, skill.id, level);
      if (sample.some((q) => q.choices.some((c) => value(c) === null))) {
        skipped.add(skill.id);
        continue;
      }
      const counts = [0, 0, 0, 0];
      for (const q of sample) counts[rank(q) - 1] += 1;
      measured.push({
        skillId: skill.id,
        level,
        counts,
        total: sample.length,
        worst: Math.max(...counts) / sample.length,
      });
    }
  }
  return { measured: measured, skipped: [...skipped].sort() };
}

const CENSUS = census();

describe("no rung lets the answer be found by where it sits in the order", () => {
  /**
   * The whole point of the threshold: every rung is measured and every rung that fails is
   * named in one failure, so a person reading the output sees the shape of the problem rather
   * than the first rung of it.
   */
  it(`keeps every rung's worst position under ${ONE_POSITION_CEILING * 100}% of draws`, () => {
    const over = CENSUS.measured
      .filter((rung) => rung.worst > ONE_POSITION_CEILING && exemption(rung.skillId, rung.level) === null)
      .map((rung) => `${rung.skillId} level ${rung.level} sits at ${rung.counts.join("/")} of ${rung.total}`);
    expect(over).toEqual([]);
  });

  /**
   * And the exemptions are audited from the other side. A reason written down once stays
   * written down forever unless something makes it false, and the thing that makes it false —
   * the rung coming under the ceiling — is exactly what nobody would notice. So it fails here.
   */
  it("has no exemption that has stopped being needed", () => {
    const stale = CENSUS.measured
      .filter((rung) => rung.worst <= ONE_POSITION_CEILING && exemption(rung.skillId, rung.level) !== null)
      .map((rung) => `${rung.skillId} level ${rung.level} is spread now (${rung.counts.join("/")} of ${rung.total}) — delete its exemption`);
    expect(stale).toEqual([]);
  });

  /** Every exemption carries a reason a person can read, and not an empty string. */
  it("gives every exemption a reason", () => {
    for (const [key, reason] of CANNOT_BE_SPREAD) {
      expect(reason.length, `${key} is exempt with no reason written down`).toBeGreaterThan(30);
    }
  });

  /**
   * The sweep is only worth its ceiling if it actually reaches everything. Two ways it could
   * quietly stop: a generated skill stops rendering numbers and falls out of the measurement,
   * or a generator is added to the registry with no skill pointing at it.
   */
  it("measures every generated skill that has an order to measure", () => {
    expect(CENSUS.skipped).toEqual([...NOT_NUMBERS].sort());
    const generated = SKILLS.filter((s) => s.source.kind === "generator");
    expect(new Set(CENSUS.measured.map((r) => r.skillId)).size).toBe(generated.length - NOT_NUMBERS.length);
    expect(CENSUS.measured.length).toBe((generated.length - NOT_NUMBERS.length) * LEVELS.length);
    const pointedAt = new Set(generated.map((s) => (s.source.kind === "generator" ? s.source.generatorId : "")));
    expect([...Object.keys(GENERATORS)].filter((id) => !pointedAt.has(id))).toEqual([]);
  });
});
