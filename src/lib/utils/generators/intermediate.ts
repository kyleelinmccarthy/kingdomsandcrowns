/**
 * Grades 3, 4 and 5 math.
 *
 * Declared with `function` rather than `const`, for the same reason as the grade K-2
 * module: `drill-generators.ts` imports this file and this file imports its helpers back,
 * so hoisted declarations are what keep the registry safe whichever module loads first.
 */
import {
  gcd,
  makeQuestion,
  numericDistractors,
  randInt,
  shuffle,
  type Question,
  type Rng,
} from "../drill-generators";

/** Levels are 0-4, easiest to hardest within one grade; anything else clamps. */
const L = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));

/**
 * How many equal parts the line is cut into, per level. Each level draws from a small set
 * rather than one fixed denominator, because a single denominator d offers only d - 1
 * different questions and a deed asks eight. The sets climb with the level.
 *
 * No halves, though the brief's ladder starts there. A line split into 2 parts has exactly
 * ONE interior mark, so there is no second real mark to offer as a wrong answer — the
 * choices came out `1/2, 2/1, 2/2, 0/2`, and three of those are not marks on the line at
 * all. A child who had learned only "the answer is between 0 and 1" could score every
 * halves question without counting a single mark. Thirds up.
 */
const FRAC_DENOMS = [[3, 4, 6], [3, 4, 6], [3, 4, 6, 8], [3, 4, 6, 8], [4, 6, 8]];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const ORDINAL_WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** Two fractions are the same number when their lowest terms agree. */
function sameFraction(a: [number, number], b: [number, number]): boolean {
  const reduce = ([n, d]: [number, number]): string => {
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    return `${n / g}/${d / g}`;
  };
  return reduce(a) === reduce(b);
}

/**
 * Unit fractions on a number line (grade 3).
 *
 * The answer is a fraction, so `numericDistractors` does not apply. The three wrong
 * choices are built by hand from the three real mistakes — reading the fraction upside
 * down, landing on the wrong mark, and calling the whole line one part — and are checked
 * against each other BY VALUE, not by spelling, so no two of them are the same number.
 */
export function fracUnit(level: number, rng: Rng, skillId: string): Question {
  const denoms = FRAC_DENOMS[L(level)];
  const d = denoms[randInt(rng, 0, denoms.length - 1)];
  const n = randInt(rng, 1, d - 1);

  // Miscounting by one mark is the mistake this question is really about, so the off-by-one
  // must itself be a real mark: step forward when there is a mark ahead, back when there is
  // not. With halves excluded there is always at least one other interior mark, so this can
  // never fall off the line to 0/d — which is not a mark, and which the verifier's own model
  // of the line agrees is not a mark.
  const offByOne = n + 1 < d ? n + 1 : n - 1;
  const candidates: [number, number][] = [[d, n], [offByOne, d], [d, d]];
  const answer: [number, number] = [n, d];
  const distractors: string[] = [];
  for (const c of candidates) {
    if (sameFraction(c, answer)) continue;
    if (distractors.some((seen) => sameFraction(c, seen.split("/").map(Number) as [number, number]))) continue;
    distractors.push(`${c[0]}/${c[1]}`);
  }
  if (distractors.length !== 3) throw new Error(`could not build three distinct fractions for ${n}/${d}`);

  return makeQuestion(
    skillId,
    `${n}/${d}`,
    `A number line from 0 to 1 is split into ${d} equal parts. What fraction is at the ${ORDINALS[n]} mark?`,
    `${n}/${d}`,
    distractors,
    rng,
    `A number line from 0 to 1 is split into ${d} equal parts. What fraction is at the ${ORDINAL_WORDS[n]} mark?`,
  );
}

/** Longest side per level. */
const RECT_MAX = [5, 8, 10, 12, 15];

/**
 * Area and perimeter of a rectangle (grade 3). Perimeter joins from level 2.
 *
 * The other measure is always one of the distractors, because confusing the two is THE
 * mistake at this age — which is exactly why a rectangle whose area and perimeter are the
 * same number is redrawn: it would put the right answer in the distractor slot and leave
 * the question with two right answers.
 */
export function areaPerimeter(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = RECT_MAX[lvl];
  let w = 0, h = 0;
  do {
    w = randInt(rng, 1, max);
    h = randInt(rng, 1, max);
  } while (w * h === 2 * (w + h)); // 4 by 4, and 3 by 6, are the rectangles that collide

  const wantArea = !(lvl >= 2 && rng() < 0.5);
  const area = w * h;
  const perimeter = 2 * (w + h);
  const answer = wantArea ? area : perimeter;
  const other = wantArea ? perimeter : area;

  const distractors = [String(other)];
  for (const near of numericDistractors(answer, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }
  for (let nudge = 4; distractors.length < 3; nudge++) {
    const candidate = String(answer + nudge);
    if (!distractors.includes(candidate)) distractors.push(candidate);
  }

  const measure = wantArea ? "area" : "perimeter";
  // "1 units wide" reached both the screen and the screen reader, which said "one units
  // tall" — on better than a third of a grade-3 child's first deed.
  const unit = (n: number) => (n === 1 ? "unit" : "units");
  const prompt = `A rectangle is ${w} ${unit(w)} wide and ${h} ${unit(h)} tall. What is its ${measure}?`;
  return makeQuestion(
    skillId,
    `${w}x${h}${wantArea ? "a" : "p"}`,
    prompt,
    String(answer),
    distractors,
    rng,
    prompt, // plain words and two numbers; nothing a screen reader would mangle
  );
}

/** Which place to round to, and how big the number gets, per level. */
const ROUND_PLACE = [10, 10, 100, 100, 1000];
const ROUND_RANGE: [number, number][] = [[10, 99], [100, 999], [100, 999], [1000, 9999], [1000, 9999]];

/**
 * Rounding to a given place (grade 3).
 *
 * A number already sitting on the place is redrawn: it is its own rounded value, so the
 * "left it alone" distractor would be the right answer and the question would have two.
 */
export function roundNearest(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const place = ROUND_PLACE[lvl];
  const [lo, hi] = ROUND_RANGE[lvl];
  let n = 0;
  do {
    n = randInt(rng, lo, hi);
  } while (n % place === 0);

  const answer = Math.round(n / place) * place;
  const below = n - (n % place);
  // Rounded the wrong way: the multiple on the other side of the number.
  const wrongWay = answer === below ? below + place : below;
  // Rounded to the wrong place — one step coarser, or finer when there is nothing coarser
  // worth offering.
  const wrongPlace = place === 10 ? 100 : place / 10;
  const wrongPlaceValue = Math.round(n / wrongPlace) * wrongPlace;

  const distractors: string[] = [];
  const wanted = [wrongWay, wrongPlaceValue, n];
  for (const candidate of wanted) {
    // 0 is skipped rather than offered: rounding a two-digit number to the nearest
    // hundred really can land there, but as a choice it tells a child nothing.
    if (candidate <= 0 || candidate === answer) continue;
    const rendered = String(candidate);
    if (!distractors.includes(rendered)) distractors.push(rendered);
  }
  for (const near of numericDistractors(answer, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }

  const prompt = `Round ${n} to the nearest ${place}.`;
  return {
    id: `${skillId}:${n}@${place}`,
    skillId,
    prompt,
    choices: shuffle([String(answer), ...distractors.slice(0, 3)], rng),
    answer: String(answer),
    readAloud: prompt, // "Round 274 to the nearest 10." reads as written
  };
}

// ---------------------------------------------------------------------------
// Grades 4 and 5
// ---------------------------------------------------------------------------

/**
 * One fraction, rendered.
 *
 * **Reduction is a decision, not an accident.** Every computed fraction answer in this
 * module is fully reduced, and the verifiers reduce too, so an unreduced answer fails the
 * harness rather than passing quietly. The one deliberate exception is `frac-equiv`, whose
 * whole point is the scaled-up form — it builds its answer by hand and says so there.
 *
 * **The unreduced form of the answer can never be offered as a distractor**, and the
 * generators no longer try. `2/4` when the answer is `1/2` is not a wrong answer, it is the
 * right answer spelled differently, and a child who picked it would be marked wrong for
 * being right — so every distractor is filtered against the answer BY VALUE, and the
 * unreduced form is equal to the answer by value by construction. `frac-addsub` and
 * `frac-mul` each used to push it as a candidate under a comment claiming it was offered
 * "wherever the answer actually reduces"; measured over 20,000 draws apiece, the answer
 * reduced in 7,792 and 6,616 of them and the unreduced form was offered in **0**. The
 * candidates were dead code and are gone; the filter that killed them stays.
 *
 * `frac(0, 5)` is `"0"` and `frac(6, 2)` is `"3"`: a whole number is written as one.
 */
export function frac(n: number, d: number): string {
  if (d === 0) throw new Error("a fraction cannot have a denominator of 0");
  if (n === 0) return "0";
  const negative = n < 0 !== d < 0;
  const g = gcd(Math.abs(n), Math.abs(d)) || 1;
  const rn = Math.abs(n) / g, rd = Math.abs(d) / g;
  const sign = negative ? "-" : "";
  return rd === 1 ? `${sign}${rn}` : `${sign}${rn}/${rd}`;
}

/** Exact value of a rendered fraction, for comparing two of them BY VALUE and not by spelling. */
function fracValue(rendered: string): number {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(rendered);
  if (!m) throw new Error(`not a fraction: ${rendered}`);
  return Number(m[1]) / (m[2] === undefined ? 1 : Number(m[2]));
}

const DENOM_WORDS = ["", "whole", "half", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

/**
 * A fraction spoken aloud. `/` is banned from read-aloud text — a child on speech support
 * would hear "three slash four" — so "3/4" becomes "3 fourths" and a bare number is left
 * alone. Denominators past twelve have no short word, so they fall back to "n over d".
 */
export function speakFrac(rendered: string): string {
  const m = /^(-?\d+)\/(\d+)$/.exec(rendered);
  if (!m) return rendered;
  const n = Number(m[1]), d = Number(m[2]);
  const word = DENOM_WORDS[d];
  if (!word) return `${n} over ${d}`;
  return `${n} ${Math.abs(n) === 1 ? word : `${word}s`}`;
}

/** Digits in each operand per level, as [digits in a, digits in b]. */
const MUL_DIGITS: [number, number][] = [[2, 1], [2, 1], [3, 1], [2, 2], [3, 2]];

/**
 * A number with exactly `digits` digits and never a trailing zero: `30 × 6` makes the
 * "tens ignored" distractor 0, which tells a child nothing, and a single-digit operand of
 * 0 or 1 makes the whole question trivial.
 */
function multiDigit(rng: Rng, digits: number): number {
  if (digits === 1) return randInt(rng, 2, 9);
  let n = 0;
  do {
    n = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
  } while (n % 10 === 0);
  return n;
}

/** Every digit pair multiplied and its carry thrown away — the classic long-multiplication slip. */
function carryDropped(a: number, b: number): number {
  const da = String(a).split("").reverse().map(Number);
  const db = String(b).split("").reverse().map(Number);
  let total = 0;
  for (let i = 0; i < da.length; i++) {
    for (let j = 0; j < db.length; j++) total += ((da[i] * db[j]) % 10) * 10 ** (i + j);
  }
  return total;
}

/**
 * Multi-digit multiplication (grade 4).
 *
 * The three distractors are the three real mistakes: only the ones digit multiplied, every
 * carry dropped, and the answer out by a factor of ten.
 */
export function mulMulti(level: number, rng: Rng, skillId: string): Question {
  const [da, db] = MUL_DIGITS[L(level)];
  let a = 0, b = 0;
  // Redraw until at least one digit pair actually carries. 12 × 3 carries nowhere, so
  // "carry dropped" would come out as 36 — which IS the answer, and the question would
  // have two right answers among its four choices.
  do {
    a = multiDigit(rng, da);
    b = multiDigit(rng, db);
  } while (carryDropped(a, b) === a * b);

  const answer = a * b;
  const distractors: string[] = [];
  for (const candidate of [(a % 10) * b, carryDropped(a, b), answer * 10]) {
    const rendered = String(candidate);
    if (candidate !== answer && !distractors.includes(rendered)) distractors.push(rendered);
  }
  for (const near of numericDistractors(answer, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }

  return makeQuestion(
    skillId,
    `${a}x${b}`,
    `What is ${a} × ${b}?`,
    String(answer),
    distractors.slice(0, 3),
    rng,
    `What is ${a} times ${b}?`,
  );
}

/** Largest divisor per level. */
const DIV_MAX = [5, 9, 9, 12, 12];

/**
 * Division with remainders (grade 4).
 *
 * Even levels ask for the quotient and odd levels for the remainder, so a level asks one
 * question shape rather than switching under a child mid-run. The measure NOT asked for is
 * always a distractor — swapping the two is the mistake this skill exists to catch — which
 * is why a draw where the quotient and the remainder are the same number is thrown away:
 * it would put the right answer in a distractor slot.
 */
export function divMulti(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = DIV_MAX[lvl];
  const wantQuotient = lvl % 2 === 0;
  let divisor = 0, quotient = 0, remainder = 0;
  do {
    divisor = randInt(rng, 2, max);
    quotient = randInt(rng, 1, 12);
    // Never 0: a division that comes out even has no remainder to find, and the question
    // would be asking about the thing it removed.
    remainder = randInt(rng, 1, divisor - 1);
  } while (remainder === quotient);

  const dividend = divisor * quotient + remainder;
  const answer = wantQuotient ? quotient : remainder;
  const other = wantQuotient ? remainder : quotient;

  const distractors: string[] = [];
  for (const candidate of [other, answer + 1, answer - 1]) {
    const rendered = String(candidate);
    if (candidate >= 0 && candidate !== answer && !distractors.includes(rendered)) distractors.push(rendered);
  }
  for (const near of numericDistractors(answer, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }

  const measure = wantQuotient ? "quotient" : "remainder";
  return makeQuestion(
    skillId,
    `${dividend}/${divisor}${wantQuotient ? "q" : "r"}`,
    `What is ${dividend} ÷ ${divisor}? Give the ${measure}.`,
    String(answer),
    distractors.slice(0, 3),
    rng,
    `What is ${dividend} divided by ${divisor}? Give the ${measure}.`,
  );
}

/** How far the fraction may be scaled up per level, and how big the base denominator gets. */
const EQUIV_MULT_MAX = [2, 3, 4, 6, 8];
const EQUIV_DENOM_MAX = [6, 8, 9, 10, 12];

/**
 * Equivalent fractions (grade 4). The choices ARE the data, as in `fractions-compare`.
 *
 * The answer here is deliberately NOT reduced — a scaled-up form is the whole point of the
 * skill, and the base fraction is always drawn in lowest terms so exactly one choice can be
 * equal to it. The three wrong choices are the three real mistakes: the numerator scaled and
 * the denominator left alone, the denominator scaled and the numerator left alone, and the
 * two scaled by different factors. They are checked against each other BY VALUE, because
 * `n/(d×k)` and `(n×k)/(d×k²)` are the same number written two ways.
 */
export function fracEquiv(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const kmax = EQUIV_MULT_MAX[lvl];
  const dmax = EQUIV_DENOM_MAX[lvl];
  let n = 0, d = 0;
  do {
    d = randInt(rng, 2, dmax);
    n = randInt(rng, 1, d - 1);
  } while (gcd(n, d) !== 1);

  const k = randInt(rng, 2, kmax);
  const answer = `${n * k}/${d * k}`;
  const others = shuffle(
    Array.from({ length: kmax + 1 }, (_, i) => i + 2).filter((j) => j !== k),
    rng,
  );
  const candidates = [
    `${n * k}/${d}`,
    `${n}/${d * k}`,
    ...others.map((j) => `${n * k}/${d * j}`),
    ...others.map((j) => `${n * j}/${d * k}`),
  ];
  const distractors: string[] = [];
  for (const candidate of candidates) {
    if (distractors.length === 3) break;
    if (fracValue(candidate) === fracValue(answer)) continue;
    if (distractors.some((seen) => fracValue(seen) === fracValue(candidate))) continue;
    distractors.push(candidate);
  }
  if (distractors.length !== 3) throw new Error(`could not build three wrong fractions for ${n}/${d} scaled by ${k}`);

  // The id is the fraction in the prompt, NOT the scale factor that built the answer. With
  // `@${k}` on the end, "Which fraction is equal to 1/2?" could be asked twice in one deed —
  // answered 2/4 the first time and 3/6 the second, with 2/4 nowhere among the second
  // question's choices. A child who remembers their own answer is then marked wrong for it.
  return makeQuestion(
    skillId,
    `${n}/${d}`,
    `Which fraction is equal to ${n}/${d}?`,
    answer,
    distractors,
    rng,
    `Which fraction is equal to ${speakFrac(`${n}/${d}`)}?`,
  );
}

/**
 * Largest number to find a factor of, per level.
 *
 * Level 0 is 20, not 12. Targets are drawn from [4, max] with primes rejected, so a ceiling
 * of 12 left exactly {4, 6, 8, 9, 10, 12} — six prompts for an eight-question deed. It went
 * unnoticed because the id used to carry the choice list, which inflated six prompts into
 * thirty-five ids; with the id built from the target alone, six is six. Twenty gives eleven
 * composites: 4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20.
 */
const FACTOR_MAX = [20, 24, 36, 60, 100];

/**
 * Factors (grade 4). The choices ARE the data.
 *
 * The headline distractor is a MULTIPLE of the target — swapping factor and multiple is the
 * mistake the skill exists to correct — and a multiple of t can never divide t, so it is
 * always genuinely wrong. Every other choice is filtered through the same divisibility test,
 * so exactly one choice divides the target however the draw goes.
 */
export function factors(level: number, rng: Rng, skillId: string): Question {
  const max = FACTOR_MAX[L(level)];
  let target = 0;
  let divisors: number[] = [];
  do {
    target = randInt(rng, 4, max);
    divisors = [];
    for (let i = 2; i < target; i++) if (target % i === 0) divisors.push(i);
  } while (divisors.length === 0); // a prime has no factor to find but 1 and itself

  const answer = divisors[randInt(rng, 0, divisors.length - 1)];
  const nonDivisors: number[] = [];
  for (let i = 2; i < target; i++) if (target % i !== 0) nonDivisors.push(i);
  const near = shuffle(nonDivisors, rng).sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer));

  const chosen: number[] = [];
  const take = (v: number) => {
    // The divisibility test is the guard: anything that divides the target would be a
    // second right answer, whatever shape it was meant to be.
    if (v > 1 && v !== answer && target % v !== 0 && !chosen.includes(v)) chosen.push(v);
  };
  take(target * randInt(rng, 2, 4));
  take(near[0]);
  take(near[1]);
  for (const m of [2, 3, 5]) {
    if (chosen.length === 3) break;
    take(target * m);
  }
  for (let v = 2; chosen.length < 3; v++) take(v);

  const distractors = chosen.slice(0, 3);
  // The id is the TARGET and nothing else. It used to carry the sorted choice list too, which
  // let "Which number is a factor of 12?" through twice in one deed with different choices and
  // a different right answer each time — a deed fills by drawing until it has eight distinct
  // ids, and an id carrying anything the child cannot see does not prevent a repeat. The cost
  // is that a missed question comes back with a fresh shuffle rather than the identical four
  // choices; the same prompt re-asked is fine, a different question under the same id is not.
  const prompt = `Which number is a factor of ${target}?`;
  return makeQuestion(skillId, `${target}`, prompt, String(answer), distractors.map(String), rng, prompt);
}

/** Whether the two denominators match, and how big they get, per level. */
const ADDSUB_LIKE = [true, true, true, false, false];
const ADDSUB_DENOM_MAX = [6, 8, 10, 12, 12];

/**
 * Adding and subtracting fractions (grade 5).
 *
 * Every answer is a PROPER fraction strictly between 0 and 1. That is a deliberate narrowing:
 * it keeps every choice on screen the same shape, so a child compares fractions with
 * fractions rather than picking out the one whole number. The cost is that `1/2 + 1/2` is
 * never asked; the gain is that no distractor has to be discarded for rendering as "1".
 *
 * The mandatory distractor is the mediant — numerators added AND denominators added,
 * `1/4 + 2/4 = 3/8` — which is the single most common error at this age. It can never
 * collide with the answer: the mediant of two positive fractions lies strictly between
 * them, and their sum is larger than both.
 */
export function fracAddsub(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const like = ADDSUB_LIKE[lvl];
  const dmax = ADDSUB_DENOM_MAX[lvl];
  let n1 = 0, d1 = 0, n2 = 0, d2 = 0, plus = false, num = 0, den = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    // A shared denominator of 2 leaves 1/2 as the only fraction, so nothing can be added to
    // it and stay under 1; the ladder starts at thirds.
    d1 = randInt(rng, 3, dmax);
    d2 = like ? d1 : randInt(rng, 2, dmax);
    if (!like && d2 === d1) continue;
    n1 = randInt(rng, 1, d1 - 1);
    n2 = randInt(rng, 1, d2 - 1);
    plus = rng() < 0.5;
    den = like ? d1 : d1 * d2;
    const left = like ? n1 : n1 * d2;
    const right = like ? n2 : n2 * d1;
    num = plus ? left + right : left - right;
    if (num > 0 && num < den) drawn = true;
  }
  if (!drawn) throw new Error(`could not draw a proper fraction sum at level ${level}`);

  const answer = frac(num, den);
  const otherNum = plus ? (like ? n1 - n2 : n1 * d2 - n2 * d1) : (like ? n1 + n2 : n1 * d2 + n2 * d1);
  const candidates: string[] = [];
  // Mandatory, and first in the list so it always survives the de-duplication below.
  if (plus) candidates.push(`${n1 + n2}/${d1 + d2}`);
  else if (d1 > d2 && n1 > n2) candidates.push(`${n1 - n2}/${d1 - d2}`);
  // The other operation, left UNREDUCED. A child who adds where the question subtracts
  // writes 4/4, not 1 — and reducing it here would turn a characteristic mistake into a
  // whole number, which the fraction-only filter below would then drop on the floor.
  if (otherNum > 0) candidates.push(`${otherNum}/${den}`);
  if (!like) candidates.push(`${plus ? n1 + n2 : n1 - n2}/${d1}`);    // numerators combined, first denominator kept
  const [ansN, ansD] = [Number(answer.split("/")[0]), Number(answer.split("/")[1] ?? 1)];
  for (const delta of [1, -1, 2, -2, 3]) {
    if (ansN + delta > 0 && ansN + delta < ansD) candidates.push(`${ansN + delta}/${ansD}`);
  }
  for (const grow of [1, 2, 3]) candidates.push(`${ansN}/${ansD + grow}`);

  const distractors: string[] = [];
  for (const candidate of candidates) {
    if (distractors.length === 3) break;
    if (!/^\d+\/\d+$/.test(candidate)) continue; // every choice stays a fraction
    if (fracValue(candidate) === fracValue(answer)) continue;
    if (distractors.some((seen) => fracValue(seen) === fracValue(candidate))) continue;
    distractors.push(candidate);
  }
  if (distractors.length !== 3) throw new Error(`could not build three wrong fractions for ${n1}/${d1} ${plus ? "+" : "-"} ${n2}/${d2}`);

  const op = plus ? "+" : "-";
  return makeQuestion(
    skillId,
    `${n1}/${d1}${op}${n2}/${d2}`,
    `What is ${n1}/${d1} ${op} ${n2}/${d2}?`,
    answer,
    distractors,
    rng,
    `What is ${speakFrac(`${n1}/${d1}`)} ${plus ? "plus" : "minus"} ${speakFrac(`${n2}/${d2}`)}?`,
  );
}

/** Largest denominator per level. */
const FRACMUL_DENOM_MAX = [4, 5, 6, 8, 10];

/**
 * Multiplying fractions (grade 5). Both operands are proper and in lowest terms, so the
 * product is always a proper fraction and the answer is always reduced.
 *
 * Cross-multiplying and adding instead can never equal the product — for proper fractions
 * `n₁d₂/(d₁n₂)` and `(n₁d₂ + n₂d₁)/(d₁d₂)` are both strictly larger — so both distractors
 * are always genuinely wrong, and only the unreduced form has to be checked against the
 * answer before it is offered.
 */
export function fracMul(level: number, rng: Rng, skillId: string): Question {
  const dmax = FRACMUL_DENOM_MAX[L(level)];
  const draw = (): [number, number] => {
    let n = 0, d = 0;
    do {
      d = randInt(rng, 2, dmax);
      n = randInt(rng, 1, d - 1);
    } while (gcd(n, d) !== 1);
    return [n, d];
  };
  const [n1, d1] = draw();
  const [n2, d2] = draw();

  const answer = frac(n1 * n2, d1 * d2);
  // The first two are written UNREDUCED on purpose: a child who cross-multiplies 1/2 × 1/2
  // writes 2/2, not 1, and reducing it would turn the mistake into a whole number — which
  // the fraction-only filter below would drop, leaving the question without the one wrong
  // answer it most needs to offer.
  const candidates = [
    `${n1 * d2}/${d1 * n2}`,                // cross-multiplied
    `${n1 * d2 + n2 * d1}/${d1 * d2}`,      // added instead of multiplied
    // Three near misses, not two. The list used to carry the product left unreduced as a
    // third real shape; it is equal to the answer by value, so the filter below dropped it
    // every single time and the two cross-multiplication shapes plus two near misses were
    // all that ever reached a child. A fourth near miss keeps three candidates in reserve
    // behind the two real ones however the draw goes.
    `${n1 * n2 + 1}/${d1 * d2}`,
    `${n1 * n2}/${d1 * d2 + 1}`,
    `${n1 * n2 + 2}/${d1 * d2}`,
    `${n1 * n2}/${d1 * d2 + 2}`,
  ];
  const distractors: string[] = [];
  for (const candidate of candidates) {
    if (distractors.length === 3) break;
    if (!/^\d+\/\d+$/.test(candidate)) continue; // a whole number among fractions gives itself away
    if (fracValue(candidate) === fracValue(answer)) continue;
    if (distractors.some((seen) => fracValue(seen) === fracValue(candidate))) continue;
    distractors.push(candidate);
  }
  if (distractors.length !== 3) throw new Error(`could not build three wrong fractions for ${n1}/${d1} × ${n2}/${d2}`);

  return makeQuestion(
    skillId,
    `${n1}/${d1}x${n2}/${d2}`,
    `What is ${n1}/${d1} × ${n2}/${d2}?`,
    answer,
    distractors,
    rng,
    `What is ${speakFrac(`${n1}/${d1}`)} times ${speakFrac(`${n2}/${d2}`)}?`,
  );
}

/** How many digits after the point an operand may carry, per level. */
const DEC_PLACES = [1, 1, 2, 2, 2];

/**
 * Every decimal in this generator is held as an integer scaled by 10 000, and no float ever
 * touches it: `0.1 + 0.2` is `0.30000000000000004` in JavaScript, and a child would be shown
 * it. Four places is enough for everything here — two-place operands added, one-place
 * operands multiplied, and a tenth either side — and the verifier scales the same way from
 * the digit STRING in the prompt rather than from `parseFloat`.
 */
const DEC_SCALE = 10000;

/** A decimal with exactly `places` digits after the point, as a scaled integer. */
function decOperand(rng: Rng, places: number, maxWhole: number): number {
  let fracDigits = 0;
  for (let i = 0; i < places - 1; i++) fracDigits = fracDigits * 10 + randInt(rng, 0, 9);
  // The last digit is never 0, so the number really has `places` digits once it is trimmed.
  fracDigits = fracDigits * 10 + randInt(rng, 1, 9);
  return randInt(rng, 0, maxWhole) * DEC_SCALE + fracDigits * (DEC_SCALE / 10 ** places);
}

/** Scaled integer to the string a child reads, trailing zeros trimmed. */
function renderDecimal(scaled: number): string {
  const sign = scaled < 0 ? "-" : "";
  const magnitude = Math.abs(scaled);
  const digits = String(magnitude % DEC_SCALE).padStart(4, "0").replace(/0+$/, "");
  const whole = Math.floor(magnitude / DEC_SCALE);
  return digits === "" ? `${sign}${whole}` : `${sign}${whole}.${digits}`;
}

/** "4.65" spoken as "4 point 6 5" — a point read digit by digit is what a child hears. */
function speakDecimal(scaled: number): string {
  const rendered = renderDecimal(scaled);
  const [whole, digits] = rendered.split(".");
  return digits === undefined ? whole : `${whole} point ${digits.split("").join(" ")}`;
}

/**
 * Decimal arithmetic (grade 5). Adding and subtracting through level 3; multiplying joins at
 * level 4, where both operands are held to one decimal place so the product stops at two — a
 * two-place operand multiplied by another would run to four, which is tedious rather than hard.
 *
 * The distractors are the three real mistakes: the point out by one place, the digits
 * right-aligned instead of lined up on the point, and the answer out by a tenth.
 */
export function decOps(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const times = lvl === 4 && rng() < 0.5;
  const places = times ? 1 : DEC_PLACES[lvl];
  let a = 0, b = 0, result = 0, op = "+";
  let drawn = false;
  for (let attempt = 0; attempt < 200 && !drawn; attempt++) {
    a = decOperand(rng, randInt(rng, 1, places), times ? 9 : 20);
    b = decOperand(rng, randInt(rng, 1, places), times ? 9 : 20);
    op = times ? "×" : rng() < 0.5 ? "+" : "-";
    if (op === "+") result = a + b;
    else if (op === "-") result = a - b;
    else result = (a * b) / DEC_SCALE;
    // A whole-number answer would leave nothing to place the point in, and 0 leaves nothing
    // at all; both are redrawn rather than rendered.
    if (result > 0 && result % DEC_SCALE !== 0) drawn = true;
  }
  if (!drawn) throw new Error(`could not draw a decimal question at level ${level}`);

  // Right-aligned rather than lined up on the point: the digit strings with the point taken
  // out, combined as whole numbers, and the point put back at the wider of the two widths.
  const widthOf = (scaled: number) => (renderDecimal(scaled).split(".")[1] ?? "").length;
  const digitsOf = (scaled: number) => Number(renderDecimal(scaled).replace(".", ""));
  const width = Math.max(widthOf(a), widthOf(b));
  const misalignedDigits = op === "-" ? digitsOf(a) - digitsOf(b) : digitsOf(a) + digitsOf(b);
  const misaligned = misalignedDigits * (DEC_SCALE / 10 ** width);

  // The point one place the wrong way in each direction, then the misalignment, then a
  // tenth either side. `result / 10` is only offered when it lands on a whole number of
  // ten-thousandths — past four places nothing here can render it honestly.
  const wanted = [result / 10, result * 10, times ? 0 : misaligned, result + DEC_SCALE / 10, result - DEC_SCALE / 10];
  const distractors: string[] = [];
  for (const candidate of wanted) {
    if (distractors.length === 3) break;
    if (candidate <= 0 || candidate === result || !Number.isInteger(candidate)) continue;
    const rendered = renderDecimal(candidate);
    if (rendered !== renderDecimal(result) && !distractors.includes(rendered)) distractors.push(rendered);
  }
  for (let nudge = 2; distractors.length < 3; nudge++) {
    const rendered = renderDecimal(result + nudge * (DEC_SCALE / 10));
    if (!distractors.includes(rendered)) distractors.push(rendered);
  }

  const opWord = op === "+" ? "plus" : op === "-" ? "minus" : "times";
  return makeQuestion(
    skillId,
    `${renderDecimal(a)}${op === "×" ? "x" : op}${renderDecimal(b)}`,
    `What is ${renderDecimal(a)} ${op} ${renderDecimal(b)}?`,
    renderDecimal(result),
    distractors.slice(0, 3),
    rng,
    `What is ${speakDecimal(a)} ${opWord} ${speakDecimal(b)}?`,
  );
}

/** Longest side per level. */
const BOX_MAX = [3, 4, 5, 6, 8];

/**
 * Volume of a rectangular prism (grade 5).
 *
 * All three distractors are measures of the same box — its surface area, the three sides
 * added, and two of the three multiplied — which is exactly why the draw is thrown away
 * unless all four numbers differ. A 1 by 2 by 3 box has a volume of 6 and sides summing to
 * 6; a cube of side 6 has a volume and a surface area of 216; and any box one unit deep has
 * a volume equal to the product of its other two sides. Each of those puts a second right
 * answer among the choices, so each is redrawn.
 */
export function volumePrism(level: number, rng: Rng, skillId: string): Question {
  const max = BOX_MAX[L(level)];
  let l = 0, w = 0, h = 0, pair = 0, volume = 0, surface = 0, sum = 0, twoOfThree = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 200 && !drawn; attempt++) {
    l = randInt(rng, 1, max);
    w = randInt(rng, 1, max);
    h = randInt(rng, 1, max);
    pair = randInt(rng, 0, 2);
    volume = l * w * h;
    surface = 2 * (l * w + l * h + w * h);
    sum = l + w + h;
    twoOfThree = [l * w, l * h, w * h][pair];
    drawn = new Set([volume, surface, sum, twoOfThree]).size === 4;
  }
  if (!drawn) throw new Error(`could not draw a box with four different measures at level ${level}`);

  const prompt = `A box is ${l} by ${w} by ${h} units. What is its volume?`;
  // The id is the box, NOT which pair-product was picked as a distractor: a child cannot see
  // `pair`, so an id carrying it let the same box be asked twice in one deed.
  return makeQuestion(
    skillId,
    `${l}x${w}x${h}`,
    prompt,
    String(volume),
    [String(surface), String(sum), String(twoOfThree)],
    rng,
    prompt, // plain words and three numbers; nothing a screen reader would mangle
  );
}

/** How many numbers are in the expression, and how big they get, per level. */
const OPS_TERMS = [3, 3, 3, 4, 4];
const OPS_NUM_MAX = [9, 9, 9, 12, 12];
const OPS_SYMBOLS = ["+", "-", "×"];

/** A number, or a parenthesised pair of numbers. */
type Atom = { value: number; text: string; spoken: string };

const opWord = (op: string) => (op === "+" ? "plus" : op === "-" ? "minus" : "times");
const applyOp = (a: number, op: string, b: number) => (op === "+" ? a + b : op === "-" ? a - b : a * b);

/** Multiplication first, then the additions and subtractions left to right. */
function byPrecedence(values: number[], ops: string[]): number {
  const v = [...values], o = [...ops];
  for (let i = 0; i < o.length; ) {
    if (o[i] === "×") {
      v.splice(i, 2, v[i] * v[i + 1]);
      o.splice(i, 1);
    } else i++;
  }
  return o.reduce((total, op, i) => applyOp(total, op, v[i + 1]), v[0]);
}

/** Straight through, ignoring precedence — the error this skill exists to correct. */
function leftToRight(values: number[], ops: string[]): number {
  return ops.reduce((total, op, i) => applyOp(total, op, values[i + 1]), values[0]);
}

/**
 * Order of operations (grade 5). Parentheses join at level 3.
 *
 * The mandatory distractor is the expression read strictly left to right. A draw where that
 * happens to give the right answer — `2 × 3 + 4` is 10 either way — is thrown away rather
 * than patched: it would offer the same number twice AND ask nothing about precedence.
 *
 * Left-to-right here still evaluates the parentheses first, because a child who ignores
 * brackets entirely is making a different mistake from the one this skill teaches.
 */
export function orderOps(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const terms = OPS_TERMS[lvl];
  const numMax = OPS_NUM_MAX[lvl];
  const useParens = lvl >= 3;
  let atoms: Atom[] = [], topOps: string[] = [], correct = 0, ltr = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    const nums = Array.from({ length: terms }, () => randInt(rng, 1, numMax));
    const ops = Array.from({ length: terms - 1 }, () => OPS_SYMBOLS[randInt(rng, 0, 2)]);
    if (useParens) {
      const s = randInt(rng, 0, terms - 2);
      const group: Atom = {
        value: applyOp(nums[s], ops[s], nums[s + 1]),
        text: `(${nums[s]} ${ops[s]} ${nums[s + 1]})`,
        spoken: `open parenthesis ${nums[s]} ${opWord(ops[s])} ${nums[s + 1]} close parenthesis`,
      };
      const plain = (n: number): Atom => ({ value: n, text: String(n), spoken: String(n) });
      atoms = [...nums.slice(0, s).map(plain), group, ...nums.slice(s + 2).map(plain)];
      topOps = [...ops.slice(0, s), ...ops.slice(s + 1)];
    } else {
      atoms = nums.map((n) => ({ value: n, text: String(n), spoken: String(n) }));
      topOps = ops;
    }
    if (atoms.some((a) => a.value < 0)) continue;
    const values = atoms.map((a) => a.value);
    correct = byPrecedence(values, topOps);
    ltr = leftToRight(values, topOps);
    // Nothing negative reaches a child at this grade, and nothing so large that the
    // question becomes arithmetic stamina rather than precedence.
    drawn = correct > 0 && ltr >= 0 && correct !== ltr && correct <= 200;
  }
  if (!drawn) throw new Error(`could not draw an expression where precedence matters at level ${level}`);

  const expression = atoms.map((a, i) => (i === 0 ? a.text : `${topOps[i - 1]} ${a.text}`)).join(" ");
  const spoken = atoms.map((a, i) => (i === 0 ? a.spoken : `${opWord(topOps[i - 1])} ${a.spoken}`)).join(" ");

  const distractors = [String(ltr)];
  for (const near of numericDistractors(correct, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }

  return makeQuestion(skillId, expression, `What is ${expression}?`, String(correct), distractors.slice(0, 3), rng, `What is ${spoken}?`);
}
