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

/** Take candidates in order, skipping the answer and anything already taken, to exactly three. */
function pickDistinct(candidates: string[], answer: string): string[] {
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
