import type { Question } from "./drill-generators";

/**
 * Re-derives a question's answer from its PROMPT TEXT, never from the generator that
 * produced it. The point is independence: if the generator's formula is wrong, the
 * verifier still reads the question a child would actually see and computes what the
 * right answer is. A generator and its verifier agreeing is two derivations agreeing.
 *
 * A verifier returns the answer as a string, or throws if the prompt does not parse —
 * a prompt the verifier cannot read is itself a defect worth failing on.
 */
export type Verifier = (q: Question) => string;

/** "What is 12 + 7?" / "What is -3 × 4?" / "What is 20% of 50?" */
const arithmetic: Verifier = (q) => {
  const m = /^What is (-?\d+) ([+\-×÷]) (-?\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`arithmetic verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]), b = Number(m[3]);
  switch (m[2]) {
    case "+": return String(a + b);
    case "-": return String(a - b);
    case "×": return String(a * b);
    case "÷": {
      if (b === 0) throw new Error(`division by zero in: ${q.prompt}`);
      if (a % b !== 0) throw new Error(`non-integer quotient in: ${q.prompt}`);
      return String(a / b);
    }
    default: throw new Error(`unknown operator in: ${q.prompt}`);
  }
};

const percentOf: Verifier = (q) => {
  const m = /^What is (\d+)% of (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`percent verifier cannot parse: ${q.prompt}`);
  const value = (Number(m[1]) * Number(m[2])) / 100;
  if (!Number.isInteger(value)) throw new Error(`non-integer percent answer in: ${q.prompt}`);
  return String(value);
};

const placeValue: Verifier = (q) => {
  const m = /^What digit is in the ([a-z-]+) place of ([\d,]+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`place-value verifier cannot parse: ${q.prompt}`);
  const places = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
  const idx = places.indexOf(m[1]);
  if (idx < 0) throw new Error(`unknown place "${m[1]}"`);
  const digits = m[2].replace(/,/g, "");
  return digits[digits.length - 1 - idx];
};

/** "Which fraction is the largest?" — the choices ARE the data, so verify over them. */
const largestFraction: Verifier = (q) => {
  // Parse the DIRECTION the prompt asks for, never assume it. Reading only the choices and
  // hardcoding "largest" let the generator's prompt be flipped to "smallest" while the
  // answer stayed the largest — and the whole suite passed. Every child who answered
  // correctly would have been marked wrong, silently. Unrecognised wording throws: a
  // question this cannot read is itself a defect, not something to guess at.
  const m = /^Which fraction is the (largest|greatest|smallest|least)\?$/.exec(q.prompt);
  if (!m) throw new Error(`fraction comparison verifier cannot parse: ${q.prompt}`);
  const wantLargest = m[1] === "largest" || m[1] === "greatest";
  const value = (s: string) => {
    const f = /^(\d+)\/(\d+)$/.exec(s);
    if (!f) throw new Error(`not a fraction: ${s}`);
    if (Number(f[2]) === 0) throw new Error(`zero denominator: ${s}`);
    return Number(f[1]) / Number(f[2]);
  };
  return q.choices.reduce((best, c) => {
    const better = wantLargest ? value(c) > value(best) : value(c) < value(best);
    return better ? c : best;
  });
};

/** "Solve for x: x + 4 = 11" / "Solve for x: 3x = -12" */
const oneStepEq: Verifier = (q) => {
  const add = /^Solve for x: x \+ (-?\d+) = (-?\d+)$/.exec(q.prompt);
  if (add) return String(Number(add[2]) - Number(add[1]));
  const sub = /^Solve for x: x - (-?\d+) = (-?\d+)$/.exec(q.prompt);
  if (sub) return String(Number(sub[2]) + Number(sub[1]));
  const mul = /^Solve for x: (-?\d+)x = (-?\d+)$/.exec(q.prompt);
  if (mul) {
    const a = Number(mul[1]), c = Number(mul[2]);
    if (a === 0 || c % a !== 0) throw new Error(`no integer solution in: ${q.prompt}`);
    return String(c / a);
  }
  throw new Error(`equation verifier cannot parse: ${q.prompt}`);
};

/**
 * "What number comes after 7?" / "What number comes before 12?"
 *
 * Derived by walking a literal counting sequence one position, not by computing n ± 1:
 * "comes after" IS the next entry when you count, and a generator that had decided
 * "after" meant two steps on would disagree with this walk.
 */
const countSeq: Verifier = (q) => {
  const m = /^What number comes (after|before) (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`counting verifier cannot parse: ${q.prompt}`);
  const counting = Array.from({ length: 101 }, (_, i) => i);
  const at = counting.indexOf(Number(m[2]));
  const next = m[1] === "after" ? at + 1 : at - 1;
  if (at < 0 || next < 0 || next >= counting.length) throw new Error(`off the number line: ${q.prompt}`);
  return String(counting[next]);
};

/**
 * "Which number is the greatest?" — the choices ARE the data, so the values are read from
 * them. The DIRECTION, though, is read from the prompt and switched on: a verifier that
 * assumed "greatest" would still pass if the generator asked for the smallest and kept
 * answering with the largest, and every child answering correctly would be marked wrong.
 * Any wording this does not recognise throws rather than being guessed at.
 */
const extremeNumber: Verifier = (q) => {
  const m = /^Which number is the (greatest|largest|smallest|least)\?$/.exec(q.prompt);
  if (!m) throw new Error(`comparison verifier cannot parse: ${q.prompt}`);
  const wantLargest = m[1] === "greatest" || m[1] === "largest";
  const value = (s: string) => {
    if (!/^\d+$/.test(s)) throw new Error(`not a whole number: ${s}`);
    return Number(s);
  };
  return q.choices.reduce((best, c) => {
    const better = wantLargest ? value(c) > value(best) : value(c) < value(best);
    return better ? c : best;
  });
};

/**
 * "What is 10 more than 34?" / "What is 10 less than 56?"
 *
 * Counted out one at a time rather than by adding ten in a single step, so a generator
 * that had multiplied by ten, or moved a different number of steps, is caught. The
 * direction still has to be read from the prompt, which is the part no phrasing of this
 * question can invert.
 */
const tenMoreLess: Verifier = (q) => {
  const m = /^What is 10 (more|less) than (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`ten-more-less verifier cannot parse: ${q.prompt}`);
  let value = Number(m[2]);
  for (let step = 0; step < 10; step++) value += m[1] === "more" ? 1 : -1;
  if (value < 0) throw new Error(`negative answer in: ${q.prompt}`);
  return String(value);
};

/** Two digits, so "4:5" can never pass for "4:05". */
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * "Count by 5s: 5, 10, 15, __"
 *
 * The step is recovered from the GAPS between the printed terms, not from the "Count by
 * 5s" label, and the label is then checked against it. So a generator that printed one
 * step and counted by another is caught from either side.
 */
const skipCount: Verifier = (q) => {
  const m = /^Count by (\d+)s: (\d+), (\d+), (\d+), __$/.exec(q.prompt);
  if (!m) throw new Error(`skip-count verifier cannot parse: ${q.prompt}`);
  const [first, second, third] = [Number(m[2]), Number(m[3]), Number(m[4])];
  const step = second - first;
  if (step <= 0) throw new Error(`the run does not count up in: ${q.prompt}`);
  if (third - second !== step) throw new Error(`uneven steps in: ${q.prompt}`);
  if (Number(m[1]) !== step) throw new Error(`prompt says ${m[1]}s but counts by ${step}: ${q.prompt}`);
  return String(third + step);
};

/**
 * "The hour hand is on 4 and the minute hand is on 6. What time is it?"
 *
 * A genuine inverse: the generator divides the minutes by five to place the hand, and
 * this multiplies the hand back up. A generator that had read the hand as the minutes
 * themselves disagrees here.
 */
const timeClock: Verifier = (q) => {
  const m = /^The hour hand is on (\d+) and the minute hand is on (\d+)\. What time is it\?$/.exec(q.prompt);
  if (!m) throw new Error(`clock verifier cannot parse: ${q.prompt}`);
  const hour = Number(m[1]), hand = Number(m[2]);
  if (hour < 1 || hour > 12) throw new Error(`no such hour in: ${q.prompt}`);
  // 1-12, like the dial. This previously accepted 0 and rejected 12 — the same mistake the
  // generator was making, which is exactly why the harness stayed silent about it. When a
  // verifier shares the generator's model of the world it stops being a second opinion.
  if (hand < 1 || hand > 12) throw new Error(`no such minute-hand position in: ${q.prompt}`);
  return `${hour}:${pad2((hand % 12) * 5)}`;
};

const COIN_VALUES: Record<string, number> = {
  quarter: 25, quarters: 25, dime: 10, dimes: 10, nickel: 5, nickels: 5, penny: 1, pennies: 1,
};

/**
 * "How much is 3 dimes and 2 pennies?"
 *
 * The SUMMATION is the same direction: the prompt names every coin and its count, so there
 * is nothing left to invert, and a shared misconception about adding them up would go
 * unnoticed.
 *
 * Two things here ARE independent, and a review proved both by mutation. `COIN_VALUES`
 * below is written out separately from the generator's own table, so a generator that
 * thought a dime was worth five cents IS caught. And the rendering rule — "32¢" under a
 * dollar, "$1.15" at or above one, always two digits of cents — is derived here too, so a
 * boundary slip is caught. Do not "simplify" this by importing the generator's coin table:
 * that would destroy the only independent check of what a coin is worth.
 */
const moneyCoins: Verifier = (q) => {
  const m = /^How much is (.+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`money verifier cannot parse: ${q.prompt}`);
  const phrases = m[1].split(/, | and /);
  let cents = 0;
  for (const phrase of phrases) {
    const coin = /^(\d+) ([a-z]+)$/.exec(phrase);
    if (!coin) throw new Error(`money verifier cannot read "${phrase}" in: ${q.prompt}`);
    const value = COIN_VALUES[coin[2]];
    if (value === undefined) throw new Error(`unknown coin "${coin[2]}" in: ${q.prompt}`);
    for (let counted = 0; counted < Number(coin[1]); counted++) cents += value;
  }
  return cents >= 100 ? `$${Math.floor(cents / 100)}.${pad2(cents % 100)}` : `${cents}¢`;
};

/**
 * "A number line from 0 to 1 is split into 6 equal parts. What fraction is at the 5th mark?"
 *
 * Derived by laying the marks out along the line and stepping to the one asked for, which
 * catches a generator that numbered them from zero or counted the end of the line as a
 * mark. It is only half a second derivation, though: the prompt already names both the
 * numerator (as an ordinal) and the denominator, so no phrasing of this question leaves
 * an inverse to compute. A generator with a wrong idea of what a fraction means would
 * still be agreed with here.
 */
const fracUnit: Verifier = (q) => {
  const m = /^A number line from 0 to 1 is split into (\d+) equal parts\. What fraction is at the (\d+)(?:st|nd|rd|th) mark\?$/.exec(q.prompt);
  if (!m) throw new Error(`fraction verifier cannot parse: ${q.prompt}`);
  const parts = Number(m[1]);
  if (parts < 2) throw new Error(`a line split into ${parts} parts has no marks: ${q.prompt}`);
  // The marks BETWEEN 0 and 1: cutting into `parts` pieces leaves `parts - 1` of them.
  const marks = Array.from({ length: parts - 1 }, (_, i) => `${i + 1}/${parts}`);
  const which = Number(m[2]);
  if (which < 1 || which > marks.length) throw new Error(`there is no ${which} mark in: ${q.prompt}`);
  return marks[which - 1];
};

/**
 * "A rectangle is 7 units wide and 4 units tall. What is its area?" (or perimeter, or "1 unit")
 *
 * Both measures are computed a different way round from the generator: the perimeter as
 * the four sides added up rather than as twice the half-perimeter, and the area as the
 * rows added up rather than multiplied. Which measure is being asked for is read from the
 * prompt and switched on, so a generator that answered with the wrong one is caught.
 */
const areaPerimeter: Verifier = (q) => {
  const m = /^A rectangle is (\d+) units? wide and (\d+) units? tall\. What is its (area|perimeter)\?$/.exec(q.prompt);
  if (!m) throw new Error(`rectangle verifier cannot parse: ${q.prompt}`);
  const w = Number(m[1]), h = Number(m[2]);
  if (w < 1 || h < 1) throw new Error(`a rectangle needs both sides in: ${q.prompt}`);
  if (m[3] === "perimeter") return String(w + h + w + h);
  let area = 0;
  for (let row = 0; row < h; row++) area += w;
  return String(area);
};

/**
 * "Round 274 to the nearest 10."
 *
 * Derived from the remainder — how far past the last multiple the number sits, and
 * whether that is half the place or more — rather than from dividing and rounding. The
 * two routes disagree the moment a generator rounds ties the wrong way.
 */
const roundNearest: Verifier = (q) => {
  const m = /^Round (\d+) to the nearest (\d+)\.$/.exec(q.prompt);
  if (!m) throw new Error(`rounding verifier cannot parse: ${q.prompt}`);
  const n = Number(m[1]), place = Number(m[2]);
  if (![10, 100, 1000].includes(place)) throw new Error(`not a place to round to: ${q.prompt}`);
  const past = n % place;
  return String(past * 2 >= place ? n - past + place : n - past);
};

// ---------------------------------------------------------------------------
// Grades 4 and 5
// ---------------------------------------------------------------------------

/** Euclid, written here rather than imported: a verifier shares no code with a generator. */
function commonFactor(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** Lowest terms, rendered the way the generators render a fraction: "0", a whole number, or "n/d". */
function reduceFraction(n: number, d: number): string {
  if (d === 0) throw new Error("a fraction cannot have a denominator of 0");
  if (n === 0) return "0";
  const negative = n < 0 !== d < 0;
  const g = commonFactor(n, d) || 1;
  const rn = Math.abs(n) / g, rd = Math.abs(d) / g;
  return `${negative ? "-" : ""}${rn}${rd === 1 ? "" : `/${rd}`}`;
}

/** "3/4" or "3" to its lowest-terms spelling, so two choices can be compared BY VALUE. */
function fractionKey(text: string): string {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(text);
  if (!m) throw new Error(`not a fraction: ${text}`);
  return reduceFraction(Number(m[1]), m[2] === undefined ? 1 : Number(m[2]));
}

/**
 * "What is 34 × 6?" (multi-digit)
 *
 * NOT a true inverse, and there is none to have: the prompt names both factors, so nothing
 * is left to recover. What this does instead is reach the product by the DEFINITION of
 * multiplication — 34 added to itself 6 times — rather than by the `*` operator, so a
 * generator that had its own idea of what multiplying means is caught. A shared
 * misconception about place value would not be.
 */
const mulMulti: Verifier = (q) => {
  const m = /^What is (\d+) × (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`multi-digit multiplication verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]), b = Number(m[2]);
  if (b > 200) throw new Error(`operand too large to count out in: ${q.prompt}`);
  let total = 0;
  for (let counted = 0; counted < b; counted++) total += a;
  return String(total);
};

/**
 * "What is 47 ÷ 5? Give the remainder." (or the quotient)
 *
 * A genuine second derivation: the generator builds the dividend up from a divisor, a
 * quotient and a remainder, and this takes it apart again by subtracting the divisor one
 * lot at a time and counting — which is what "how many times does 5 go into 47, and what
 * is left over" literally means. Neither `/` nor `%` appears. Which of the two numbers is
 * wanted is read from the prompt and switched on, so a prompt flipped to ask for the other
 * one cannot keep the old answer.
 */
const divRemainder: Verifier = (q) => {
  const m = /^What is (\d+) ÷ (\d+)\? Give the (quotient|remainder)\.$/.exec(q.prompt);
  if (!m) throw new Error(`division verifier cannot parse: ${q.prompt}`);
  const dividend = Number(m[1]), divisor = Number(m[2]);
  if (divisor < 1) throw new Error(`division by zero in: ${q.prompt}`);
  if (dividend > 10000) throw new Error(`dividend too large to count down in: ${q.prompt}`);
  let left = dividend, times = 0;
  while (left >= divisor) {
    left -= divisor;
    times += 1;
  }
  return String(m[3] === "quotient" ? times : left);
};

/**
 * "Which fraction is equal to 2/3?" — the choices ARE the data.
 *
 * A genuine inverse: the generator scales the base fraction UP by a whole number, and this
 * reduces every choice DOWN to lowest terms, so the two derivations meet in the middle and
 * a generator that scaled only one half of the fraction disagrees here. The direction word
 * is parsed and switched on, never assumed, and a wording this does not recognise throws.
 */
const equivalentFraction: Verifier = (q) => {
  const m = /^Which fraction is (equal|not equal) to (\d+)\/(\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`equivalent-fraction verifier cannot parse: ${q.prompt}`);
  const target = reduceFraction(Number(m[2]), Number(m[3]));
  const same = q.choices.filter((c) => fractionKey(c) === target);
  const different = q.choices.filter((c) => fractionKey(c) !== target);
  const wanted = m[1] === "equal" ? same : different;
  if (wanted.length !== 1) throw new Error(`${wanted.length} choices are ${m[1]} to ${m[2]}/${m[3]} in: ${q.choices.join(", ")}`);
  return wanted[0];
};

/**
 * "Which number is a factor of 24?" — the choices ARE the data.
 *
 * The generator picks a divisor of the target; this tests every choice for divisibility and
 * insists exactly one passes, which is a different question from "which one did you build".
 * Factor and multiple are the pair children swap, so both wordings are parsed and the test
 * is turned around for "multiple" — a prompt flipped to the other word cannot keep the old
 * answer. Anything else throws.
 */
const factorOf: Verifier = (q) => {
  const m = /^Which number is a (factor|multiple) of (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`factor verifier cannot parse: ${q.prompt}`);
  const target = Number(m[2]);
  if (target < 1) throw new Error(`nothing is a factor of ${target}: ${q.prompt}`);
  const passes = q.choices.filter((c) => {
    if (!/^\d+$/.test(c)) throw new Error(`not a whole number: ${c}`);
    const value = Number(c);
    if (value === 0) throw new Error(`0 cannot be a factor or a multiple: ${q.prompt}`);
    return m[1] === "factor" ? target % value === 0 : value % target === 0;
  });
  if (passes.length !== 1) throw new Error(`${passes.length} choices are a ${m[1]} of ${target} in: ${q.choices.join(", ")}`);
  return passes[0];
};

/**
 * "What is 1/4 + 2/4?"
 *
 * The common denominator is reached by LCM here and by multiplying the two denominators in
 * the generator — two different routes to the same number, so a cross-multiplication slip
 * shows up as a disagreement. The answer is reduced on this side too, so an unreduced
 * answer fails rather than passing quietly. The operator is read from the prompt, so a
 * prompt flipped from plus to minus cannot keep the old answer.
 */
const fractionAddSub: Verifier = (q) => {
  const m = /^What is (\d+)\/(\d+) ([+\-]) (\d+)\/(\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`fraction add/subtract verifier cannot parse: ${q.prompt}`);
  const n1 = Number(m[1]), d1 = Number(m[2]), n2 = Number(m[4]), d2 = Number(m[5]);
  if (d1 === 0 || d2 === 0) throw new Error(`a fraction cannot have a denominator of 0: ${q.prompt}`);
  const lcm = (d1 * d2) / commonFactor(d1, d2);
  const left = n1 * (lcm / d1), right = n2 * (lcm / d2);
  return reduceFraction(m[3] === "+" ? left + right : left - right, lcm);
};

/**
 * "What is 2/3 × 3/5?"
 *
 * NOT a true inverse for the multiplication itself — the prompt names both fractions, so
 * there is nothing to recover. Two things here ARE independent: the answer is reduced on
 * this side, so an unreduced answer fails; and the operator is parsed and switched on, with
 * division written as multiplying by the flipped second fraction, so a prompt flipped to
 * `÷` cannot keep the product as its answer.
 */
const fractionMultiply: Verifier = (q) => {
  const m = /^What is (\d+)\/(\d+) ([×÷]) (\d+)\/(\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`fraction multiply verifier cannot parse: ${q.prompt}`);
  const n1 = Number(m[1]), d1 = Number(m[2]), n2 = Number(m[4]), d2 = Number(m[5]);
  if (d1 === 0 || d2 === 0) throw new Error(`a fraction cannot have a denominator of 0: ${q.prompt}`);
  if (m[3] === "÷") {
    if (n2 === 0) throw new Error(`division by zero in: ${q.prompt}`);
    return reduceFraction(n1 * d2, d1 * n2);
  }
  return reduceFraction(n1 * n2, d1 * d2);
};

/** Every decimal here is an integer scaled by 10 000; no float ever touches one. */
const VERIFY_SCALE = 10000;

/**
 * "3.4" to 34000, read DIGIT BY DIGIT out of the prompt. `parseFloat("0.1") + parseFloat("0.2")`
 * is 0.30000000000000004, so the string is never turned into a float at any point — not
 * here, and not in the generator, and the two do it by different means so that they are
 * still two derivations where the bug would live.
 */
function scaledDecimal(text: string): number {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!m) throw new Error(`not a decimal this can read: ${text}`);
  return Number(m[1]) * VERIFY_SCALE + Number((m[2] ?? "").padEnd(4, "0"));
}

/** Scaled integer back to the string a child reads, trailing zeros trimmed. */
function renderScaled(scaled: number): string {
  const sign = scaled < 0 ? "-" : "";
  const magnitude = Math.abs(scaled);
  const whole = Math.trunc(magnitude / VERIFY_SCALE);
  let digits = String(VERIFY_SCALE + (magnitude % VERIFY_SCALE)).slice(1);
  while (digits.endsWith("0")) digits = digits.slice(0, -1);
  return digits === "" ? `${sign}${whole}` : `${sign}${whole}.${digits}`;
}

/**
 * "What is 3.4 + 1.25?"
 *
 * Same-direction arithmetic — both operands are named — but independent where the bug
 * actually lives: in the scaling and the rendering. The operator is parsed and switched on,
 * so a flipped sign cannot hide, and a product that does not land on a whole number of
 * ten-thousandths throws rather than being rounded into agreement.
 */
const decimalOps: Verifier = (q) => {
  const m = /^What is (\d+(?:\.\d+)?) ([+\-×]) (\d+(?:\.\d+)?)\?$/.exec(q.prompt);
  if (!m) throw new Error(`decimal verifier cannot parse: ${q.prompt}`);
  const a = scaledDecimal(m[1]), b = scaledDecimal(m[3]);
  if (m[2] === "+") return renderScaled(a + b);
  if (m[2] === "-") return renderScaled(a - b);
  const product = (a * b) / VERIFY_SCALE;
  if (!Number.isInteger(product)) throw new Error(`product needs more than four decimal places: ${q.prompt}`);
  return renderScaled(product);
};

/**
 * "A box is 3 by 4 by 2 units. What is its volume?" (or its surface area)
 *
 * The volume is COUNTED, one unit cube at a time, rather than multiplied — the definition
 * rather than the formula — and the surface area is the six faces added up one by one.
 * Which measure is wanted is read from the prompt and switched on, so a generator that
 * answered with the other one is caught.
 */
const boxMeasure: Verifier = (q) => {
  const m = /^A box is (\d+) by (\d+) by (\d+) units\. What is its (volume|surface area)\?$/.exec(q.prompt);
  if (!m) throw new Error(`box verifier cannot parse: ${q.prompt}`);
  const [l, w, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (l < 1 || w < 1 || h < 1) throw new Error(`a box needs all three sides in: ${q.prompt}`);
  if (l > 40 || w > 40 || h > 40) throw new Error(`box too large to count out in: ${q.prompt}`);
  if (m[4] === "surface area") {
    let faces = 0;
    for (const [a, b] of [[l, w], [l, w], [l, h], [l, h], [w, h], [w, h]]) faces += a * b;
    return String(faces);
  }
  let cubes = 0;
  for (let x = 0; x < l; x++) for (let y = 0; y < w; y++) for (let z = 0; z < h; z++) cubes += 1;
  return String(cubes);
};

/**
 * "What is 3 + 4 × 2?" / "What is 2 + (3 + 4) × 2?"
 *
 * A genuinely independent derivation: the generator holds the expression as a structure and
 * evaluates that, while this parses the printed text back into one — a recursive descent
 * over `expr := term (('+'|'-') term)*`, `term := factor ('×' factor)*`, `factor := number |
 * '(' expr ')'` — and so disagrees the moment the generator's precedence and the text on
 * screen part company. Leftover tokens throw: an expression this cannot read all of is
 * itself a defect.
 */
const orderOfOperations: Verifier = (q) => {
  const m = /^What is (.+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`order-of-operations verifier cannot parse: ${q.prompt}`);
  const tokens = m[1].match(/\d+|[+\-×()]/g) ?? [];
  if (tokens.join("") !== m[1].replace(/\s/g, "")) throw new Error(`unreadable characters in: ${q.prompt}`);
  let at = 0;
  const peek = () => tokens[at];
  const expr = (): number => {
    let value = term();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[at++];
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (peek() === "×") {
      at++;
      value *= factor();
    }
    return value;
  };
  const factor = (): number => {
    const token = tokens[at];
    if (token === undefined) throw new Error(`expression ends early: ${q.prompt}`);
    if (token === "(") {
      at++;
      const value = expr();
      if (tokens[at] !== ")") throw new Error(`unclosed parenthesis in: ${q.prompt}`);
      at++;
      return value;
    }
    if (!/^\d+$/.test(token)) throw new Error(`expected a number, found "${token}" in: ${q.prompt}`);
    at++;
    return Number(token);
  };
  const value = expr();
  if (at !== tokens.length) throw new Error(`trailing "${tokens.slice(at).join(" ")}" in: ${q.prompt}`);
  return String(value);
};

export const VERIFIERS: Record<string, Verifier> = {
  add: arithmetic,
  sub: arithmetic,
  mul: arithmetic,
  div: arithmetic,
  "integer-ops": arithmetic,
  "percent-of": percentOf,
  "place-value": placeValue,
  "fractions-compare": largestFraction,
  "one-step-eq": oneStepEq,
  "count-seq": countSeq,
  "compare-num": extremeNumber,
  "ten-more-less": tenMoreLess,
  "skip-count": skipCount,
  "time-clock": timeClock,
  "money-coins": moneyCoins,
  "frac-unit": fracUnit,
  "area-perimeter": areaPerimeter,
  "round-nearest": roundNearest,
  "mul-multi": mulMulti,
  "div-multi": divRemainder,
  "frac-equiv": equivalentFraction,
  factors: factorOf,
  "frac-addsub": fractionAddSub,
  "frac-mul": fractionMultiply,
  "dec-ops": decimalOps,
  "volume-prism": boxMeasure,
  "order-ops": orderOfOperations,
};
