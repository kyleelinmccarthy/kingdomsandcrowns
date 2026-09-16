/**
 * Grades 6 and 7 math.
 *
 * Declared with `function` rather than `const`, for the same reason as the K-2 and 3-5
 * modules: `drill-generators.ts` imports this file and this file imports its helpers back,
 * so hoisted declarations are what keep the registry safe whichever module loads first.
 *
 * `frac` and `speakFrac` come from the grade 3-5 module rather than being written again
 * here. Reduction and the spoken form of a fraction are one rule for the whole app; a
 * second copy is a second thing to get wrong. The VERIFIERS never import either.
 */
import {
  gcd,
  makeQuestion,
  numericDistractors,
  randInt,
  speakInt,
  type Question,
  type Rng,
} from "../drill-generators";
import { frac, speakFrac } from "./intermediate";

/** Levels are 0-4, easiest to hardest within one grade; anything else clamps. */
const L = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));

/**
 * Exact value of a rendered fraction ("3/4", "-3/4", "2"), for comparing two choices BY
 * VALUE rather than by spelling: "2/4" and "1/2" are the same number written two ways and
 * a string comparison would offer both.
 */
function fracValue(rendered: string): number {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(rendered);
  if (!m) throw new Error(`not a fraction: ${rendered}`);
  const d = m[2] === undefined ? 1 : Number(m[2]);
  if (d === 0) throw new Error(`zero denominator: ${rendered}`);
  return Number(m[1]) / d;
}

/**
 * Take candidate choices in order until three survive, skipping anything that is not a
 * plain fraction, anything equal in VALUE to the answer, and anything equal in value to a
 * choice already taken.
 *
 * The fraction-only filter is deliberate and is the same rule the grade-5 fraction
 * generators use: a whole number sitting among three fractions gives itself away without
 * any arithmetic at all. A numerator of 0 is dropped for the same reason: "0/12" is not a
 * mistake anyone writes, it is a choice that announces itself.
 */
function pickFractionDistractors(candidates: string[], answer: string): string[] {
  const taken: string[] = [];
  for (const candidate of candidates) {
    if (taken.length === 3) break;
    if (!/^-?\d+\/\d+$/.test(candidate)) continue;
    if (fracValue(candidate) === 0) continue;
    if (fracValue(candidate) === fracValue(answer)) continue;
    if (taken.some((seen) => fracValue(seen) === fracValue(candidate))) continue;
    taken.push(candidate);
  }
  return taken;
}

/**
 * Take candidates in order, skipping the answer and anything already taken, to exactly three.
 *
 * Exported for the grade 9-12 module rather than written out a third time. The subtlety is
 * worth having in one place: a candidate equal to the answer is SKIPPED, not reported, so a
 * characteristic-error distractor that collides with the answer is silently replaced by
 * whatever comes next in the list. Every caller must therefore rule the collision out at the
 * draw, and every test must assert the mistake differs from the answer before asserting it is
 * offered — `toContain` alone passes vacuously when the mistake IS the answer.
 */
export function pickDistinct(candidates: string[], answer: string): string[] {
  const taken: string[] = [];
  for (const candidate of candidates) {
    if (taken.length === 3) break;
    if (candidate === answer || taken.includes(candidate)) continue;
    taken.push(candidate);
  }
  return taken;
}

// ---------------------------------------------------------------------------
// Grade 6
// ---------------------------------------------------------------------------

/** Largest distance in play per level. */
const RATE_TOTAL_MAX = [60, 120, 240, 360, 500];

/**
 * Unit rate (grade 6). The division is always exact, because a unit rate with a remainder
 * is a different skill.
 *
 * The speed is drawn first and the distance built from it, so `total ÷ hours` can never
 * fail to come out whole. Both the speed and the number of hours start at 2: a speed of 1
 * makes the distance and the time the same number, and the question answers itself.
 */
export function ratioRate(level: number, rng: Rng, skillId: string): Question {
  const max = RATE_TOTAL_MAX[L(level)];
  const hours = randInt(rng, 2, 12);
  const speed = randInt(rng, 2, Math.floor(max / hours));
  const total = hours * speed;

  // Multiplied instead of divided; answered with the distance itself; and one out.
  const distractors = pickDistinct(
    [String(total * hours), String(total), ...numericDistractors(speed, rng, 1)],
    String(speed),
  );
  const prompt = `A car travels ${total} miles in ${hours} hours. What is the speed in miles per hour?`;
  return makeQuestion(skillId, `${total}/${hours}`, prompt, String(speed), distractors, rng, prompt);
}

/** Largest denominator either operand may carry, per level. */
const FRACDIV_DENOM_MAX = [4, 5, 6, 8, 10];

/**
 * Dividing fractions (grade 6). Both operands are proper and in lowest terms.
 *
 * A draw whose answer is a whole number is thrown away. "1" standing among three fractions
 * is pickable without dividing anything, and it would also make the "flipped the wrong
 * fraction" distractor — which is the answer's reciprocal — collide with the answer.
 *
 * The headline distractor is the defining error: the two fractions multiplied straight
 * across without inverting anything. It can never equal the answer, since the two differ by
 * a factor of `(d2/n2)²` and the second fraction is proper.
 */
export function fracDiv(level: number, rng: Rng, skillId: string): Question {
  const dmax = FRACDIV_DENOM_MAX[L(level)];
  const draw = (): [number, number] => {
    let n = 0, d = 0;
    do {
      d = randInt(rng, 2, dmax);
      n = randInt(rng, 1, d - 1);
    } while (gcd(n, d) !== 1);
    return [n, d];
  };

  let n1 = 0, d1 = 0, n2 = 0, d2 = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 200 && !drawn; attempt++) {
    [n1, d1] = draw();
    [n2, d2] = draw();
    drawn = (n1 * d2) % (d1 * n2) !== 0;
  }
  if (!drawn) throw new Error(`could not draw a fraction division with a fraction answer at level ${level}`);

  const answer = frac(n1 * d2, d1 * n2);
  const distractors = pickFractionDistractors(
    [
      `${n1 * n2}/${d1 * d2}`,          // multiplied without inverting — the defining error
      `${d1 * n2}/${n1 * d2}`,          // inverted the FIRST fraction instead of the second
      `${n1 * d2}/${d1 * n2}`,          // the answer, left unreduced
      `${n1 * d2 + 1}/${d1 * n2}`,
      `${n1 * d2}/${d1 * n2 + 1}`,
      `${n1 * d2 + 2}/${d1 * n2}`,
      `${n1 * d2}/${d1 * n2 + 2}`,
    ],
    answer,
  );
  if (distractors.length !== 3) throw new Error(`could not build three wrong fractions for ${n1}/${d1} ÷ ${n2}/${d2}`);

  return makeQuestion(
    skillId,
    `${n1}/${d1}d${n2}/${d2}`,
    `What is ${n1}/${d1} ÷ ${n2}/${d2}?`,
    answer,
    distractors,
    rng,
    `What is ${speakFrac(`${n1}/${d1}`)} divided by ${speakFrac(`${n2}/${d2}`)}?`,
  );
}

/** Largest coefficient per level. */
const EVAL_COEF_MAX = [5, 8, 10, 12, 12];

/**
 * Evaluating an expression at a value of x (grade 6). Negative values of x join at level 4.
 *
 * **The substitution is never written into the prompt.** `3x + 5` at x = -3 rendered as
 * `3-3 + 5` is not the question anyone meant to ask, and a child reading it would be right
 * to answer 5. The prompt names x once, on its own, and the expression keeps its letter.
 *
 * Two draws are thrown away, each because it would put a second right answer on screen:
 * one where `3x` read as `3 + x` happens to give the same total, and one where x and the
 * constant are equal, which makes substituting into the wrong slot come out right.
 */
export function evalExpr(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const amax = EVAL_COEF_MAX[lvl];
  let a = 0, b = 0, x = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 200 && !drawn; attempt++) {
    a = randInt(rng, 2, amax);
    b = randInt(rng, 1, 10);
    x = lvl >= 4 ? randInt(rng, -10, 10) : randInt(rng, 0, 10);
    drawn = new Set([a * x + b, a + x + b, a * b + x]).size === 3;
  }
  if (!drawn) throw new Error(`could not draw an expression with three different readings at level ${level}`);

  const answer = a * x + b;
  const candidates = [
    String(a + x + b),                        // the coefficient read as a term: 3 + x + 5
    String(a * b + x),                        // x substituted into the constant's slot
    ...(x < 0 ? [String(a * Math.abs(x) + b)] : []), // the minus sign dropped
    ...numericDistractors(answer, rng),
  ];

  return makeQuestion(
    skillId,
    `${a}x+${b}@${x}`,
    `If x = ${x}, what is ${a}x + ${b}?`,
    String(answer),
    pickDistinct(candidates, String(answer)),
    rng,
    `If x is ${speakInt(x)}, what is ${a} x plus ${b}?`,
  );
}

// ---------------------------------------------------------------------------
// Grade 7
// ---------------------------------------------------------------------------

/** Largest count of items, and largest price per item, per level. */
const PROP_COUNT_MAX = [6, 8, 10, 12, 12];
const PROP_UNIT_MAX = [5, 6, 8, 10, 12];
const PROP_ITEMS = ["pencils", "apples", "notebooks", "markers", "stickers", "ribbons"];

/**
 * Proportional reasoning (grade 7).
 *
 * The unit price is an integer of at least 2 and the two counts always differ. Both are
 * guards, not decoration: at a price of 1 a dollar each, and at equal counts, "added the
 * difference instead of scaling" gives exactly the right answer — `(n₂ - n₁)(u - 1) = 0` is
 * precisely when the two agree — and the question would have two right answers.
 */
export function proportion(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const cmax = PROP_COUNT_MAX[lvl];
  const unit = randInt(rng, 2, PROP_UNIT_MAX[lvl]);
  let n1 = 0, n2 = 0;
  do {
    n1 = randInt(rng, 2, cmax);
    n2 = randInt(rng, 2, cmax);
  } while (n1 === n2);
  const item = PROP_ITEMS[randInt(rng, 0, PROP_ITEMS.length - 1)];

  const given = n1 * unit;
  const answer = n2 * unit;
  const money = (n: number) => `$${n}`;
  // The counts swapped — "if n₂ cost this much, what do n₁ cost" — is only offered when it
  // lands on a whole number of dollars; a price of $18/7 is not a mistake a child makes.
  const swapped = (n1 * given) % n2 === 0 ? [money((n1 * given) / n2)] : [];
  const distractors = pickDistinct(
    [
      money(given + (n2 - n1)),  // added the difference instead of scaling
      money(unit),               // the unit price alone
      ...swapped,
      money(given * n2),         // the total scaled instead of the price
      ...numericDistractors(answer, rng, 1).map((n) => money(Number(n))),
    ],
    money(answer),
  );

  const prompt = `If ${n1} ${item} cost $${given}, how much do ${n2} ${item} cost?`;
  return makeQuestion(
    skillId,
    `${item}:${n1}@${unit}:${n2}`,
    prompt,
    money(answer),
    distractors,
    rng,
    `If ${n1} ${item} cost ${given} dollars, how much do ${n2} ${item} cost?`,
  );
}

/** Largest denominator either operand may carry, per level. */
const RAT_DENOM_MAX = [4, 6, 8, 10, 12];

/**
 * Operations with rational numbers (grade 7). At least one operand is negative at every
 * level — that is the whole skill — and a negative second operand is written in brackets,
 * `3/4 - (-1/2)`, which is how it is written on paper and the case children most often lose.
 *
 * Whole-number and zero answers are redrawn, so every choice on screen is a signed
 * fraction. `-1/2 + 1/2 = 0` would otherwise leave "0" as the one choice that is not a
 * fraction at all.
 */
export function rationalOps(level: number, rng: Rng, skillId: string): Question {
  const dmax = RAT_DENOM_MAX[L(level)];
  const draw = (): [number, number] => {
    let n = 0, d = 0;
    do {
      d = randInt(rng, 2, dmax);
      n = randInt(rng, 1, d - 1);
    } while (gcd(n, d) !== 1);
    return [n, d];
  };

  let n1 = 0, d1 = 0, n2 = 0, d2 = 0, firstNeg = false, secondNeg = false, plus = false;
  let num = 0, den = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    [n1, d1] = draw();
    [n2, d2] = draw();
    plus = rng() < 0.5;
    const signs = randInt(rng, 0, 2);
    firstNeg = signs === 0 || signs === 2;
    secondNeg = signs === 1 || signs === 2;
    const left = (firstNeg ? -n1 : n1) * d2;
    const right = (secondNeg ? -n2 : n2) * d1;
    den = d1 * d2;
    num = plus ? left + right : left - right;
    drawn = num % den !== 0; // rules out 0 and every whole number in one test
  }
  if (!drawn) throw new Error(`could not draw a rational sum with a fraction answer at level ${level}`);

  const answer = frac(num, den);
  const signedLeft = firstNeg ? -n1 : n1;
  const signedRight = secondNeg ? -n2 : n2;
  // Every minus sign ignored and the same operation carried out.
  const dropped = plus ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1;
  // The other operation, on the signed operands.
  const flipped = plus ? signedLeft * d2 - signedRight * d1 : signedLeft * d2 + signedRight * d1;
  const combined = plus ? signedLeft + signedRight : signedLeft - signedRight;
  const distractors = pickFractionDistractors(
    [
      `${dropped}/${den}`,        // the signs dropped
      `${combined}/${d1}`,        // numerators combined over the first denominator
      `${flipped}/${den}`,        // the other operation
      `${num}/${den}`,            // the answer, left unreduced
      `${num + 1}/${den}`,
      `${num - 1}/${den}`,
      `${num}/${den + 1}`,
      `${num + 2}/${den}`,
    ],
    answer,
  );
  if (distractors.length !== 3) throw new Error(`could not build three wrong fractions for ${num}/${den}`);

  const leftText = `${firstNeg ? "-" : ""}${n1}/${d1}`;
  const rightText = secondNeg ? `(-${n2}/${d2})` : `${n2}/${d2}`;
  const op = plus ? "+" : "-";
  return makeQuestion(
    skillId,
    `${leftText}${op}${rightText}`,
    `What is ${leftText} ${op} ${rightText}?`,
    answer,
    distractors,
    rng,
    `What is ${firstNeg ? "negative " : ""}${speakFrac(`${n1}/${d1}`)} ${plus ? "plus" : "minus"} ${secondNeg ? "negative " : ""}${speakFrac(`${n2}/${d2}`)}?`,
  );
}

/** Largest starting price per level; every price is a multiple of 10. */
const PC_BASE_MAX = [50, 100, 200, 400, 500];

/**
 * Percent increase and decrease (grade 7). Decreases join at level 1.
 *
 * Three things are redrawn rather than patched, each because it would put a second right
 * answer among the four choices:
 *
 *  - **A starting price of 100.** At a base of 100 the raw difference and the percent are
 *    the same number — `p = 100d/b` is `d` exactly when `b` is 100 — and "the difference"
 *    is one of the three distractors.
 *  - **A change of 0%.** The question would be asking about a price that did not move.
 *    Guarded at the source: the change is at least one whole step, so `p` is never 0.
 *  - **A wrong-base distractor that rounds back onto the answer.** `d` over the NEW value
 *    is the defining error here, and at a small percent it is very close to the right one:
 *    a $1 rise on $50 is 2% the right way and 1.96% the wrong way.
 *
 * That last distractor is rounded to a whole percent so that every choice has the same
 * shape. Demanding it come out whole instead would be honest too, but it leaves level 0
 * with seven questions in existence and a deed asks eight.
 */
export function percentChange(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const baseMax = PC_BASE_MAX[lvl];
  let base = 0, diff = 0, percent = 0, rises = true, wrongBase = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    base = randInt(rng, 1, baseMax / 10) * 10;
    if (base === 100) continue;
    // The smallest change that leaves a whole-number percent, so every multiple of it does too.
    const step = base / gcd(base, 100);
    diff = randInt(rng, 1, Math.floor(base / step)) * step;
    percent = (100 * diff) / base;
    rises = lvl === 0 ? true : rng() < 0.5;
    if (percent < 5) continue;                 // 1% of a price is not a change a child can see
    if (!rises && percent > 90) continue;      // a price cannot fall by more than all of it
    if (rises && percent > 100) continue;
    const after = rises ? base + diff : base - diff;
    wrongBase = Math.round((100 * diff) / after);
    drawn = wrongBase >= 1 && wrongBase !== percent;
  }
  if (!drawn) throw new Error(`could not draw a percent change at level ${level}`);

  const after = rises ? base + diff : base - diff;
  const answer = `${percent}%`;
  const distractors = pickDistinct(
    [
      `${wrongBase}%`,                   // the change over the NEW value — the defining error
      `${diff}%`,                        // the raw difference in dollars, called a percent
      `${(percent / 100).toFixed(2)}%`,  // the ratio, never multiplied by 100
      ...numericDistractors(percent, rng, 1).map((p) => `${p}%`),
    ],
    answer,
  );

  const moved = rises ? "rises" : "falls";
  const named = rises ? "increase" : "decrease";
  return makeQuestion(
    skillId,
    `${base}${rises ? "up" : "down"}${after}`,
    `A price ${moved} from $${base} to $${after}. What is the percent ${named}?`,
    answer,
    distractors,
    rng,
    `A price ${moved} from ${base} dollars to ${after} dollars. What is the percent ${named}?`,
  );
}

/** Largest coefficient per level. */
const TWO_STEP_COEF_MAX = [5, 5, 9, 9, 9];

/**
 * Two-step equations (grade 7). A negative coefficient or a negative solution joins at
 * level 3; a negative constant, written as `3x - 4 = 11`, joins at level 2.
 *
 * `x = 0` is redrawn: "the sign flipped" is one of the three distractors and `-0` is `0`,
 * so a solution of zero would offer the right answer twice.
 *
 * Solving in the wrong order — dividing before subtracting — can never come out right
 * here, since `c/a - b = x` would need `b = 0` or `a = 1`, and neither is ever drawn. It is
 * offered only when `a` divides `c`, because a child who divides first and gets a fraction
 * notices and starts over.
 */
export function twoStepEq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const amax = TWO_STEP_COEF_MAX[lvl];
  let a = 0, b = 0, x = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 200 && !drawn; attempt++) {
    a = randInt(rng, 2, amax) * (lvl >= 3 && rng() < 0.35 ? -1 : 1);
    b = randInt(rng, 1, 12) * (lvl >= 2 && rng() < 0.4 ? -1 : 1);
    x = lvl >= 3 ? randInt(rng, -10, 10) : randInt(rng, 1, 10);
    drawn = x !== 0;
  }
  if (!drawn) throw new Error(`could not draw a two-step equation at level ${level}`);

  const c = a * x + b;
  const wrongOrder = c % a === 0 ? [String(c / a - b)] : [];
  const distractors = pickDistinct(
    [...wrongOrder, String(-x), ...numericDistractors(x, rng)],
    String(x),
  );

  const sign = b < 0 ? "-" : "+";
  const size = Math.abs(b);
  return makeQuestion(
    skillId,
    `${a}x${sign}${size}=${c}`,
    `Solve for x: ${a}x ${sign} ${size} = ${c}`,
    String(x),
    distractors,
    rng,
    `Solve for x: ${speakInt(a)} x ${b < 0 ? "minus" : "plus"} ${size} equals ${speakInt(c)}`,
  );
}

/** Largest radius per level; circumference joins at level 1. */
const CIRCLE_RADIUS_MAX = [7, 8, 9, 10, 12];

/**
 * **Every circle measure in here is held as an exact integer number of HUNDREDTHS**, and no
 * float touches one until it is rounded for display. 3.14 is 314 hundredths, so an area is
 * `314 × r × r` and a circumference is `628 × r`, both exact. The verifier works the other
 * way, in floating point, from the 3.14 printed in the prompt — two routes that can only
 * agree if both are right.
 *
 * They can never disagree on a rounding tie, either: every value here is an even number of
 * hundredths, and a tie needs a 5 in the hundredths place.
 */
function tenths(hundredths: number): string {
  return (Math.round(hundredths / 10) / 10).toFixed(1);
}

/**
 * Area and circumference of a circle (grade 7). Half the prompts give the diameter, so
 * halving it is part of the skill rather than an occasional trick.
 *
 * Every choice is a measure of the same circle, which is why the draw is thrown away unless
 * all four render differently. Two radii collide and both are found by that test rather
 * than by being listed: at r = 2 the area and the circumference are both 12.56, and at r = 4
 * the area (50.24) equals the circumference of a circle of twice the radius (50.24), so the
 * two distractors would be the same choice printed twice.
 */
export function circleMeasure(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const rmax = CIRCLE_RADIUS_MAX[lvl];
  let r = 0, wantArea = true, byDiameter = false, rendered: string[] = [];
  let drawn = false;
  for (let attempt = 0; attempt < 200 && !drawn; attempt++) {
    r = randInt(rng, 2, rmax);
    wantArea = lvl === 0 ? true : rng() < 0.5;
    byDiameter = rng() < 0.5;
    const area = 314 * r * r;
    const circumference = 628 * r;
    rendered = (wantArea
      ? [area, circumference, 4 * area, 2 * area]   // the other measure; the diameter used as the radius; 2πr²
      : [circumference, area, 2 * circumference, 314 * r] // the other measure; the diameter used as the radius; the 2 forgotten
    ).map(tenths);
    drawn = new Set(rendered).size === 4;
  }
  if (!drawn) throw new Error(`could not draw a circle with four different measures at level ${level}`);

  const measure = wantArea ? "area" : "circumference";
  const given = byDiameter ? `diameter of ${2 * r}` : `radius of ${r}`;
  return makeQuestion(
    skillId,
    `${byDiameter ? "d" : "r"}${r}${wantArea ? "a" : "c"}`,
    `A circle has a ${given}. What is its ${measure}? Use 3.14 for pi.`,
    rendered[0],
    rendered.slice(1),
    rng,
    // "pi" as a word and "three point one four" as words: a screen reader says "3.14" well
    // enough, but the symbol it stands for is never on screen and must never be spoken as one.
    `A circle has a ${given}. What is its ${measure}? Use three point one four for pi.`,
  );
}

// ---------------------------------------------------------------------------
// Grade 8
// ---------------------------------------------------------------------------

/** Largest coefficient on either side of the equals sign, per level. */
const LINEAR_COEF_MAX = [5, 6, 7, 8, 9];
/** Largest constant on the left, per level. */
const LINEAR_CONST_MAX = [8, 10, 12, 12, 12];

/**
 * Linear equations in one variable (grade 8). The variable sits on one side at levels 0-1
 * and on both sides from level 2, which is the whole difference between this skill and the
 * grade-7 two-step equation it grows out of.
 *
 * Three draws are thrown away, each because it would put a second right answer on screen or
 * an unreadable equation on the page:
 *
 *  - **Equal coefficients.** `4x + 1 = 4x + 5` has no solution at all, and `(d - b)/(a - c)`
 *    divides by zero reaching for one.
 *  - **`x = 0`.** Every distractor here is a division of `d - b` or `d + b` by something, and
 *    at `x = 0` several of them land on 0 together.
 *  - **A constant of zero on either side**, which would print `4x + 0`.
 *
 * `b` is never 0, and that is what keeps the headline distractor honest: "the constant moved
 * the wrong way" is `(d + b)/(a - c)` against an answer of `(d - b)/(a - c)`, and the two
 * differ by `2b/(a - c)`, which is zero exactly when `b` is.
 */
export function linearEq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const amax = LINEAR_COEF_MAX[lvl];
  const bmax = LINEAR_CONST_MAX[lvl];
  const bothSides = lvl >= 2;
  let a = 0, c = 0, b = 0, x = 0, d = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    a = randInt(rng, 2, amax);
    c = bothSides ? randInt(rng, 2, amax) : 0;
    b = randInt(rng, 1, bmax) * (rng() < 0.5 ? -1 : 1);
    x = lvl >= 2 ? randInt(rng, -10, 10) : randInt(rng, 1, 10);
    d = (a - c) * x + b;
    drawn = a !== c && x !== 0 && (!bothSides || d !== 0);
  }
  if (!drawn) throw new Error(`could not draw a linear equation at level ${level}`);

  /** A wrong reading is only offered when it comes out whole; a child who lands on a fraction starts over. */
  const whole = (numerator: number, denominator: number): string[] =>
    denominator !== 0 && numerator % denominator === 0 ? [String(numerator / denominator)] : [];

  const candidates = [
    ...whole(d + b, a - c),   // the constant moved the wrong way
    ...whole(d - b, a + c),   // the x terms collected by adding rather than subtracting
    ...whole(d - b, a),       // divided by the left coefficient alone
    ...whole(d, a),           // divided before moving the constant
    ...numericDistractors(x, rng),
  ];

  const left = `${a}x ${b < 0 ? "-" : "+"} ${Math.abs(b)}`;
  const right = bothSides ? `${c}x ${d < 0 ? "-" : "+"} ${Math.abs(d)}` : String(d);
  const prompt = `Solve for x: ${left} = ${right}`;
  const spokenRight = bothSides
    ? `${c} x ${d < 0 ? "minus" : "plus"} ${Math.abs(d)}`
    : speakInt(d);
  return makeQuestion(
    skillId,
    `${a}x${b < 0 ? "-" : "+"}${Math.abs(b)}=${bothSides ? `${c}x${d < 0 ? "-" : "+"}${Math.abs(d)}` : d}`,
    prompt,
    String(x),
    pickDistinct(candidates, String(x)),
    rng,
    `Solve for x: ${a} x ${b < 0 ? "minus" : "plus"} ${Math.abs(b)} equals ${spokenRight}`,
  );
}

/** How far a coordinate may sit from the origin, per level. */
const SLOPE_COORD_MAX = [5, 7, 9, 10, 12];
/** Largest size of the slope itself, per level. */
const SLOPE_MAG_MAX = [3, 3, 4, 5, 5];

/**
 * Slope from two points (grade 8). The slope is always a whole number: the run is drawn
 * first and the second point built from it, so `rise / run` can never come out ragged.
 *
 * **Equal x-coordinates are rejected before anything divides.** A vertical line has no slope
 * to ask about, and `rise / 0` is not a choice a child can be offered.
 *
 * **The guard that actually fires is the four-way distinctness check**: all four readings are
 * rendered and compared, and the draw is thrown away unless they differ. That is what catches
 * every collision here without anybody having to enumerate them — at `m = ±1` the inverted
 * reading `run/rise` IS the slope, and at `run = m` so is the plain difference of the
 * x-coordinates. Both were found by that test rather than by being listed.
 *
 * The floor of 2 on the size of the slope is a shortcut, not a second guard: it is the `m = ±1`
 * case ruled out at the source so the loop is not mostly rejections. Removing it changes
 * nothing a child would see, because the distinctness check rejects the same draws.
 */
export function slopeFromPoints(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const cmax = SLOPE_COORD_MAX[lvl];
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0, rendered: string[] = [];
  let drawn = false;
  for (let attempt = 0; attempt < 600 && !drawn; attempt++) {
    x1 = randInt(rng, -cmax, cmax);
    x2 = randInt(rng, -cmax, cmax);
    if (x1 === x2) continue;
    const m = randInt(rng, 2, SLOPE_MAG_MAX[lvl]) * (rng() < 0.5 ? -1 : 1);
    y1 = randInt(rng, -cmax, cmax);
    y2 = y1 + m * (x2 - x1);
    if (Math.abs(y2) > cmax) continue;
    const run = x2 - x1, rise = y2 - y1;
    rendered = [frac(rise, run), frac(run, rise), frac(-rise, run), String(run)];
    drawn = new Set(rendered).size === 4;
  }
  if (!drawn) throw new Error(`could not draw two points with a whole slope at level ${level}`);

  return makeQuestion(
    skillId,
    `${x1},${y1}:${x2},${y2}`,
    `What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})?`,
    rendered[0],
    rendered.slice(1),
    rng,
    `What is the slope of the line through the point ${speakInt(x1)}, ${speakInt(y1)} and the point ${speakInt(x2)}, ${speakInt(y2)}?`,
  );
}

/** Largest exponent that may appear in the question, per level. */
const EXPONENT_MAX = [5, 5, 6, 6, 7];

/**
 * An exponent spoken as an ordinal. `^` is banned from read-aloud — a child on speech
 * support would hear "x caret three" — so `x^3` is said as "x to the third power".
 */
const POWER_WORDS = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth",
];

const speakPower = (e: number): string => {
  const word = POWER_WORDS[e];
  if (!word) throw new Error(`no spoken form for an exponent of ${e}`);
  return `x to the ${word} power`;
};

/**
 * Properties of exponents (grade 8). Products at every level, quotients from level 2, and a
 * power of a power at level 4.
 *
 * Every answer has an exponent of at least 2. `x^1` and `x^0` are a different lesson — and
 * `x^1` among three `x^n` choices is the one that looks unlike the others.
 *
 * The headline distractor is the defining error: the exponents MULTIPLIED where they should
 * be added, and it is checked against the answer before the draw is kept. `x^2 · x^2` is the
 * one case where the two agree — 2 + 2 and 2 × 2 are both 4 — and it is thrown away rather
 * than patched. Without that redraw nothing would look wrong: `pickDistinct` drops a
 * candidate equal to the answer and quietly backfills an off-by-one, so the question stops
 * offering the mistake it exists to catch, no duplicate choice is ever emitted, and a test
 * asserting the mistake is among the choices still passes because the answer is.
 *
 * "Bases multiplied" is offered as `2x^n`, which is what that mistake actually looks like on
 * paper: a child who reads `x · x` as `2x` writes the coefficient down. There is no way to
 * render "the bases multiplied" as another power of x alone, and pretending otherwise would
 * be a distractor nobody has ever written.
 */
export function exponentRules(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const emax = EXPONENT_MAX[lvl];
  const kinds = lvl >= 4 ? (["product", "quotient", "power"] as const)
    : lvl >= 2 ? (["product", "quotient"] as const)
      : (["product"] as const);

  let kind: "product" | "quotient" | "power" = "product";
  let a = 0, b = 0, answer = 0;
  let candidates: string[] = [];
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    kind = kinds[randInt(rng, 0, kinds.length - 1)];
    a = randInt(rng, 2, emax);
    b = kind === "power" ? randInt(rng, 2, 3) : randInt(rng, 2, emax);
    if (kind === "product") {
      answer = a + b;
      candidates = [`x^${a * b}`, `2x^${a + b}`, `x^${Math.abs(a - b)}`, `x^${a + b + 1}`, `x^${a + b - 1}`];
    } else if (kind === "quotient") {
      if (a - b < 2) continue;
      answer = a - b;
      candidates = [`x^${a + b}`, `x^${a * b}`, `x^${a - b + 1}`, `x^${a - b - 1}`, `x^${b - a + emax}`];
    } else {
      answer = a * b;
      candidates = [`x^${a + b}`, `x^${a * b + 1}`, `x^${a * b - 1}`, `x^${a + b + 1}`];
    }
    if (answer < 2) continue;
    // The headline mistake must survive as a mistake; see the note above.
    if (candidates[0] === `x^${answer}`) continue;
    const taken = pickDistinct(candidates.filter((c) => !/x\^(0|-\d+)$/.test(c)), `x^${answer}`);
    drawn = taken.length === 3;
    if (drawn) candidates = taken;
  }
  if (!drawn) throw new Error(`could not draw an exponent question at level ${level}`);

  const key = kind === "product" ? `x${a}*x${b}` : kind === "quotient" ? `x${a}/x${b}` : `(x${a})^${b}`;
  const prompt = kind === "product" ? `Simplify: x^${a} · x^${b}`
    : kind === "quotient" ? `Simplify: x^${a} ÷ x^${b}`
      : `Simplify: (x^${a})^${b}`;
  const spoken = kind === "product" ? `Simplify: ${speakPower(a)} times ${speakPower(b)}`
    : kind === "quotient" ? `Simplify: ${speakPower(a)} divided by ${speakPower(b)}`
      : `Simplify: ${speakPower(a)}, all to the ${POWER_WORDS[b]} power`;

  return makeQuestion(skillId, key, prompt, `x^${answer}`, candidates, rng, spoken);
}

/**
 * The only legs this app will ever ask about. Exported because `pythagorean` here and the
 * grade-10 `trig-ratios` and `dist-midpoint` all need whole-number answers, and a triple
 * table copied three times is three things to get wrong.
 *
 * Arbitrary legs are not an option: `√(3² + 5²)` is irrational, and a multiple-choice
 * question cannot offer it.
 */
export const PYTHAGOREAN_TRIPLES: readonly (readonly [number, number, number])[] = [
  [3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15], [20, 21, 29],
];

/** How far a triple may be scaled up, per level. Three is the ceiling everywhere. */
const TRIPLE_SCALE_MAX = [1, 1, 2, 2, 3];
/** Largest hypotenuse in play, per level, so a scaled triple cannot run away. */
const TRIPLE_HYP_MAX = [17, 25, 29, 60, 90];

/**
 * The Pythagorean theorem (grade 8). Legs come from the triple table above, scaled by the
 * level and never past 3x, so the hypotenuse is always a whole number a child can pick.
 *
 * The two legs are printed in either order, which is a real part of the skill — the shorter
 * leg is not always named first on a diagram — and the order is part of the id, because it
 * is part of the prompt.
 *
 * Four readings are offered and none of them can be the answer, for reasons that hold for
 * every triple rather than by luck: the legs added is `a + b`, which is strictly greater
 * than `c` in any triangle; either leg alone is strictly less than `c`; and `c²` is at least
 * `5c`. The generator test asserts all four are distinct rather than trusting this note.
 */
export function pythagorean(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  let a = 0, b = 0, c = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    const [p, q, r] = PYTHAGOREAN_TRIPLES[randInt(rng, 0, PYTHAGOREAN_TRIPLES.length - 1)];
    const scale = randInt(rng, 1, TRIPLE_SCALE_MAX[lvl]);
    if (r * scale > TRIPLE_HYP_MAX[lvl]) continue;
    const flip = rng() < 0.5;
    a = (flip ? q : p) * scale;
    b = (flip ? p : q) * scale;
    c = r * scale;
    drawn = true;
  }
  if (!drawn) throw new Error(`could not draw a Pythagorean triple at level ${level}`);

  const distractors = pickDistinct(
    [String(a + b), String(a), String(c * c), String(b), ...numericDistractors(c, rng, 1)],
    String(c),
  );
  const prompt = `A right triangle has legs ${a} and ${b}. How long is the hypotenuse?`;
  return makeQuestion(skillId, `${a},${b}`, prompt, String(c), distractors, rng, prompt);
}

/** Largest exponent in play, per level. */
const SCI_MAGNITUDE = [3, 4, 5, 6, 8];

/**
 * A mantissa held as an integer and a count of decimal places, rendered without a float ever
 * touching it: `45` with one place is "4.5", and with two it is "0.45". Shared by the answer
 * and by both of its misplaced-point distractors, which is the point — the three differ only
 * in where the point lands.
 */
function renderMantissa(digits: number, places: number): string {
  if (places <= 0) return String(digits);
  const s = String(digits).padStart(places + 1, "0");
  return `${s.slice(0, s.length - places)}.${s.slice(s.length - places)}`;
}

/**
 * Scientific notation (grade 8). Negative exponents join at level 4.
 *
 * **Every number here is an integer of digits and a power of ten, and no float touches one.**
 * `4.56e-4` written out by `toString` is a rendering nobody controls; the digits are placed
 * against the decimal point by hand instead, so what a child reads is exactly what was meant.
 *
 * The mantissa never ends in a zero. `4.50 × 10^3` and `4.5 × 10^3` are the same number
 * written two ways, and a question whose right answer has two spellings has no right answer.
 *
 * A negative exponent is capped at six regardless of the level's magnitude. `4.5 × 10^-8` is
 * `0.000000045`, and counting eight zeros is not a harder question about exponents — it is a
 * different and worse question about eyesight.
 */
export function sciNotation(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const places = lvl >= 2 ? randInt(rng, 1, 2) : 1;
  let digits = 0;
  do {
    digits = randInt(rng, 10 ** places, 10 ** (places + 1) - 1);
  } while (digits % 10 === 0);
  const negative = lvl >= 4 && rng() < 0.5;
  const exponent = negative ? -randInt(rng, 2, 6) : randInt(rng, 2, SCI_MAGNITUDE[lvl]);

  // The number as a child reads it: the digits shifted against the point, then grouped.
  const shift = exponent - places;
  const s = String(digits);
  let plain: string;
  if (shift >= 0) {
    plain = Number(s + "0".repeat(shift)).toLocaleString("en-US");
  } else {
    const point = s.length + shift;
    plain = point > 0 ? `${s.slice(0, point)}.${s.slice(point)}` : `0.${"0".repeat(-point)}${s}`;
  }

  const mantissa = renderMantissa(digits, places);
  const answer = `${mantissa} × 10^${exponent}`;
  const distractors = pickDistinct(
    [
      `${renderMantissa(digits, places - 1)} × 10^${exponent}`, // the point one place too far right
      `${renderMantissa(digits, places + 1)} × 10^${exponent}`, // the point one place too far left
      `${mantissa} × 10^${exponent + 1}`,                       // the exponent off by one
      `${mantissa} × 10^${exponent - 1}`,
    ],
    answer,
  );

  const prompt = `Write ${plain} in scientific notation.`;
  return makeQuestion(skillId, plain.replace(/,/g, ""), prompt, answer, distractors, rng, prompt);
}
