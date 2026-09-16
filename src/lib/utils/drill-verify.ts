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
  if (hand < 0 || hand > 11) throw new Error(`no such minute-hand position in: ${q.prompt}`);
  return `${hour}:${pad2(hand * 5)}`;
};

const COIN_VALUES: Record<string, number> = {
  quarter: 25, quarters: 25, dime: 10, dimes: 10, nickel: 5, nickels: 5, penny: 1, pennies: 1,
};

/**
 * "How much is 3 dimes and 2 pennies?"
 *
 * NOT a second derivation of the arithmetic: the prompt names every coin and its count,
 * so there is nothing left to invert, and this adds the same values up the same way the
 * generator did. A generator that thought a dime was worth five cents would be agreed
 * with. What this DOES check independently is the rendering — that the cents total is
 * spelled "32¢" under a dollar and "$1.15" at or above one, with two digits of cents —
 * which is its own class of bug, and the total is reached by counting each coin out one
 * at a time rather than by multiplying.
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
 * "A rectangle is 7 units wide and 4 units tall. What is its area?" (or perimeter)
 *
 * Both measures are computed a different way round from the generator: the perimeter as
 * the four sides added up rather than as twice the half-perimeter, and the area as the
 * rows added up rather than multiplied. Which measure is being asked for is read from the
 * prompt and switched on, so a generator that answered with the wrong one is caught.
 */
const areaPerimeter: Verifier = (q) => {
  const m = /^A rectangle is (\d+) units wide and (\d+) units tall\. What is its (area|perimeter)\?$/.exec(q.prompt);
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
};
