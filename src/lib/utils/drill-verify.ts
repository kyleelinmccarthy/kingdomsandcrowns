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

/** "Solve for x: x + 4 = 11" / "Solve for x: 3x = -12" / "Solve for x: x / 4 = -3" */
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
  // Undone by multiplying, which is the opposite direction from the generator's own build.
  const div = /^Solve for x: x \/ (-?\d+) = (-?\d+)$/.exec(q.prompt);
  if (div) {
    const a = Number(div[1]);
    if (a === 0) throw new Error(`divided by zero in: ${q.prompt}`);
    return String(a * Number(div[2]));
  }
  throw new Error(`equation verifier cannot parse: ${q.prompt}`);
};

/**
 * "What number comes after 7?" / "What number comes before 12?" / "What number comes
 * between 12 and 14?"
 *
 * Derived by walking a literal counting sequence one position, not by computing n ± 1:
 * "comes after" IS the next entry when you count, and a generator that had decided
 * "after" meant two steps on would disagree with this walk.
 *
 * "Between" walks the same sequence and then checks the far end of the prompt against it:
 * a prompt naming two numbers that are not two apart has nothing between them, and is a
 * defect rather than a question, so it throws instead of answering the near neighbour.
 */
const countSeq: Verifier = (q) => {
  const counting = Array.from({ length: 101 }, (_, i) => i);
  const between = /^What number comes between (\d+) and (\d+)\?$/.exec(q.prompt);
  if (between) {
    const from = counting.indexOf(Number(between[1]));
    if (from < 0 || from + 2 >= counting.length) throw new Error(`off the number line: ${q.prompt}`);
    if (counting[from + 2] !== Number(between[2])) {
      throw new Error(`nothing sits between ${between[1]} and ${between[2]}: ${q.prompt}`);
    }
    return String(counting[from + 1]);
  }
  const m = /^What number comes (after|before) (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`counting verifier cannot parse: ${q.prompt}`);
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

/** How many parts a named fraction cuts a whole into — the verifier's own table, not the generator's. */
const PART_NAMES: Record<string, number> = {
  halves: 2, thirds: 3, fourths: 4, fifths: 5, sixths: 6, sevenths: 7, eighths: 8,
  ninths: 9, tenths: 10, elevenths: 11, twelfths: 12,
};

/**
 * "A number line from 0 to 1 is split into 6 equal parts. What fraction is at the 5th mark?"
 * "A number line from 0 to 2 is marked in fourths. What fraction is at the 5th mark?"
 *
 * Derived by laying the marks out along the line and stepping to the one asked for, which
 * catches a generator that numbered them from zero or counted the end of the line as a
 * mark. It is only half a second derivation, though: the prompt already names both the
 * numerator (as an ordinal) and the denominator, so no phrasing of this question leaves
 * an inverse to compute. A generator with a wrong idea of what a fraction means would
 * still be agreed with here.
 *
 * The longer line is laid out the same way and nothing about the answer is special-cased:
 * marking two wholes in fourths lays out `1/4 … 7/4` and the 5th of them is `5/4`. What IS
 * checked independently is the size of a part — `PART_NAMES` above is this file's own table,
 * so a generator that thought "fourths" meant six parts is caught rather than agreed with.
 */
const fracUnit: Verifier = (q) => {
  const longer = /^A number line from 0 to (\d+) is marked in ([a-z]+)\. What fraction is at the (\d+)(?:st|nd|rd|th) mark\?$/.exec(q.prompt);
  const m = longer ?? /^A number line from 0 to (1) is split into (\d+) equal parts\. What fraction is at the (\d+)(?:st|nd|rd|th) mark\?$/.exec(q.prompt);
  if (!m) throw new Error(`fraction verifier cannot parse: ${q.prompt}`);
  const wholes = Number(m[1]);
  const parts = longer ? PART_NAMES[m[2]] : Number(m[2]);
  if (parts === undefined) throw new Error(`no such fraction as a "${m[2]}": ${q.prompt}`);
  if (parts < 2) throw new Error(`a line split into ${parts} parts has no marks: ${q.prompt}`);
  if (wholes < 1) throw new Error(`a line that runs from 0 to ${wholes} has no marks: ${q.prompt}`);
  // The marks BETWEEN 0 and the end of the line: cutting each of `wholes` wholes into
  // `parts` pieces leaves `wholes * parts - 1` of them, the last whole itself not being one.
  const marks = Array.from({ length: wholes * parts - 1 }, (_, i) => `${i + 1}/${parts}`);
  const which = Number(m[3]);
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
  // A bound on the loop, not a claim about the curriculum: grade 5 multiplies by a
  // three-digit number, and 999 additions is still nothing.
  if (b > 999) throw new Error(`operand too large to count out in: ${q.prompt}`);
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
  // "Which fraction is equal to 4/5?" answered "4/5" satisfies every check above and teaches
  // nothing: the answer is copied off the prompt. The generator scales by at least 2 so this
  // cannot happen, and saying so HERE is what keeps it that way — "this question is defective"
  // belongs in the second opinion, not in one assertion of one generator test.
  if (m[1] === "equal" && wanted[0] === `${m[2]}/${m[3]}`) {
    throw new Error(`the answer is the fraction the prompt already names: ${q.prompt}`);
  }
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
  // Every number has 1 and itself for a factor, and is a multiple of itself, so answering
  // with either is true and tells a child nothing about 24 in particular. The generator draws
  // its answer from the PROPER divisors, and this is where that is insisted on rather than
  // merely intended.
  const found = Number(passes[0]);
  if (m[1] === "factor" && (found === 1 || found === target)) {
    throw new Error(`every number has 1 and itself for a factor, so ${found} is no answer to: ${q.prompt}`);
  }
  if (m[1] === "multiple" && found === target) {
    throw new Error(`every number is a multiple of itself, so ${found} is no answer to: ${q.prompt}`);
  }
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

// ---------------------------------------------------------------------------
// Grades 6 and 7
// ---------------------------------------------------------------------------

/**
 * "A car travels 120 miles in 3 hours. What is the speed in miles per hour?"
 *
 * NOT an inverse, and the prompt leaves none: both the distance and the time are named, so
 * there is nothing to recover. What IS independent is the route — the time is subtracted
 * out of the distance one hour at a time and the hours counted, which is what "how far per
 * hour" literally means — and the exactness check. Neither `/` nor `%` appears, so a
 * generator that had built its distance wrong, or had divided the other way round, is
 * caught. A shared misconception about what a rate IS would not be.
 */
const unitRate: Verifier = (q) => {
  const m = /^A car travels (\d+) miles in (\d+) hours\. What is the speed in miles per hour\?$/.exec(q.prompt);
  if (!m) throw new Error(`rate verifier cannot parse: ${q.prompt}`);
  const miles = Number(m[1]), hours = Number(m[2]);
  if (hours < 1) throw new Error(`no time passes in: ${q.prompt}`);
  if (miles > 100000) throw new Error(`distance too large to count down in: ${q.prompt}`);
  let left = miles, speed = 0;
  while (left >= hours) {
    left -= hours;
    speed += 1;
  }
  if (left !== 0) throw new Error(`the distance does not divide by the time in: ${q.prompt}`);
  return String(speed);
};

/**
 * "What is 3/4 ÷ 1/2?"
 *
 * A genuinely different derivation, not invert-and-multiply. Both fractions are put over
 * their LCM and the two NUMERATORS are then divided — "six eighths shared into four
 * eighths" — which is the other standard algorithm and shares no step with the generator's
 * `n₁d₂ / d₁n₂`. The operator is read from the prompt and switched on, with `×` evaluated
 * as the straight product, so a prompt flipped to multiplication cannot keep the quotient
 * as its answer. The answer is reduced on this side too, so an unreduced answer fails.
 */
const fractionDivide: Verifier = (q) => {
  const m = /^What is (\d+)\/(\d+) ([×÷]) (\d+)\/(\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`fraction division verifier cannot parse: ${q.prompt}`);
  const n1 = Number(m[1]), d1 = Number(m[2]), n2 = Number(m[4]), d2 = Number(m[5]);
  if (d1 === 0 || d2 === 0) throw new Error(`a fraction cannot have a denominator of 0: ${q.prompt}`);
  if (m[3] === "×") return reduceFraction(n1 * n2, d1 * d2);
  if (n2 === 0) throw new Error(`division by zero in: ${q.prompt}`);
  const lcm = (d1 * d2) / commonFactor(d1, d2);
  return reduceFraction(n1 * (lcm / d1), n2 * (lcm / d2));
};

/**
 * "If x = -3, what is 3x + 5?"
 *
 * NOT an inverse — the prompt names x, the coefficient and the constant. The independence
 * is in what this REFUSES to do: `3x` is reached by counting 3 out x times, never by adding
 * 3 to x, and the constant is added exactly once at the end, never multiplied. Those are
 * the two mistakes the skill exists to catch, and a generator making either one disagrees
 * here. The value of x is taken from the prompt's own `x = ` clause, so a generator that
 * substituted a different number is caught as well.
 */
const evaluateExpression: Verifier = (q) => {
  const m = /^If x = (-?\d+), what is (\d+)x \+ (-?\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`expression verifier cannot parse: ${q.prompt}`);
  const x = Number(m[1]), a = Number(m[2]), b = Number(m[3]);
  if (Math.abs(x) > 1000) throw new Error(`x too large to count out in: ${q.prompt}`);
  let product = 0;
  for (let counted = 0; counted < Math.abs(x); counted++) product += a;
  return String((x < 0 ? -product : product) + b);
};

/**
 * "If 3 pencils cost $6, how much do 7 pencils cost?"
 *
 * A genuine second derivation: the generator holds a unit price and multiplies it by the
 * new count, while this never forms a unit price at all — it cross-multiplies, `n₁ × answer
 * = n₂ × cost`, and divides by repeated subtraction. So a generator that scaled by the
 * wrong count, or scaled the wrong number, disagrees here. The item is matched by
 * backreference, so a prompt naming pencils in one clause and apples in the other does not
 * parse at all.
 */
const proportionCost: Verifier = (q) => {
  const m = /^If (\d+) ([a-z]+) cost \$(\d+), how much do (\d+) \2 cost\?$/.exec(q.prompt);
  if (!m) throw new Error(`proportion verifier cannot parse: ${q.prompt}`);
  const n1 = Number(m[1]), cost = Number(m[3]), n2 = Number(m[4]);
  if (n1 < 1 || n2 < 1) throw new Error(`a count of none in: ${q.prompt}`);
  if (n2 * cost > 100000) throw new Error(`total too large to count down in: ${q.prompt}`);
  let left = n2 * cost, dollars = 0;
  while (left >= n1) {
    left -= n1;
    dollars += 1;
  }
  if (left !== 0) throw new Error(`the counts do not scale to a whole number of dollars: ${q.prompt}`);
  return `$${dollars}`;
};

/**
 * "What is -3/4 + 1/2?" / "What is 3/4 - (-1/2)?"
 *
 * The common denominator is reached by LCM here and by multiplying the two denominators in
 * the generator, so a cross-multiplication slip shows up as a disagreement, and the answer
 * is reduced on this side so an unreduced one fails. Both SIGNS and the operator are read
 * out of the prompt and applied here, never assumed: a prompt whose second operand lost its
 * brackets, or whose plus became a minus, cannot keep the old answer. A bracketed operand
 * must carry a minus sign — a plain `(1/2)` does not parse, because nothing should be
 * writing one.
 */
const rationalAddSub: Verifier = (q) => {
  const m = /^What is (-?\d+)\/(\d+) ([+\-]) (?:(\d+)\/(\d+)|\((-\d+)\/(\d+)\))\?$/.exec(q.prompt);
  if (!m) throw new Error(`rational verifier cannot parse: ${q.prompt}`);
  const n1 = Number(m[1]), d1 = Number(m[2]);
  const n2 = Number(m[4] ?? m[6]), d2 = Number(m[5] ?? m[7]);
  if (d1 === 0 || d2 === 0) throw new Error(`a fraction cannot have a denominator of 0: ${q.prompt}`);
  const lcm = (d1 * d2) / commonFactor(d1, d2);
  const left = n1 * (lcm / d1), right = n2 * (lcm / d2);
  return reduceFraction(m[3] === "+" ? left + right : left - right, lcm);
};

/**
 * "A price rises from $40 to $50. What is the percent increase?"
 *
 * A genuine inverse: the generator picks the percent and builds the new price from it,
 * while this recovers the percent from the two prices. The BASE is the price it started
 * FROM, which is the whole point of the skill and the one thing a verifier must not learn
 * from its generator.
 *
 * Both direction words are checked against the numbers rather than trusted. A prompt that
 * said "rises" while the price fell, or asked for the "increase" on a fall, would be read
 * by a child one way and marked the other, and neither wording alone is enough to catch it.
 * A price that did not move throws: there is no percent change to ask about.
 */
const percentChange: Verifier = (q) => {
  const m = /^A price (rises|falls) from \$(\d+) to \$(\d+)\. What is the percent (increase|decrease)\?$/.exec(q.prompt);
  if (!m) throw new Error(`percent-change verifier cannot parse: ${q.prompt}`);
  const before = Number(m[2]), after = Number(m[3]);
  if (before <= 0) throw new Error(`nothing to change from in: ${q.prompt}`);
  if (before === after) throw new Error(`the price did not move in: ${q.prompt}`);
  const rising = after > before;
  if (rising !== (m[1] === "rises")) throw new Error(`the prices do not ${m[1]} in: ${q.prompt}`);
  if (rising !== (m[4] === "increase")) throw new Error(`a price that ${m[1]} has no percent ${m[4]}: ${q.prompt}`);
  const difference = rising ? after - before : before - after;
  const percent = (difference * 100) / before;
  if (!Number.isInteger(percent)) throw new Error(`not a whole percent in: ${q.prompt}`);
  return `${percent}%`;
};

/**
 * "Solve for x: 3x + 4 = 19" / "Solve for x: -3x - 4 = -13"
 *
 * A genuine inverse: the generator builds the right-hand side from x, and this takes it
 * apart — subtract the constant, then divide by the coefficient, in that order. The
 * constant's sign is read from the prompt, so an equation printed with a minus cannot be
 * solved as if it had a plus.
 *
 * A non-integer solution THROWS rather than being rounded into agreement. Every equation
 * this skill asks is built to come out whole, so `(c - b) % a !== 0` means the generator
 * produced an equation no child can solve, and the throw is how that reaches the harness.
 */
const twoStepEquation: Verifier = (q) => {
  const m = /^Solve for x: (-?\d+)x ([+\-]) (\d+) = (-?\d+)$/.exec(q.prompt);
  if (!m) throw new Error(`two-step equation verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]);
  const b = m[2] === "+" ? Number(m[3]) : -Number(m[3]);
  const c = Number(m[4]);
  if (a === 0) throw new Error(`no x to solve for in: ${q.prompt}`);
  if ((c - b) % a !== 0) throw new Error(`no integer solution in: ${q.prompt}`);
  return String((c - b) / a);
};

/**
 * "A circle has a radius of 5. What is its area? Use 3.14 for pi."
 *
 * NOT an inverse: πr² and 2πr are named by the question itself, so there is nothing to run
 * backwards. Three things here ARE independent and each catches a real mistake:
 *
 *  - **The value of pi is taken from the prompt**, not from a constant in this file. A
 *    generator computing with 3.14159 while the prompt says 3.14 disagrees here.
 *  - **The diameter is halved here**, so a generator that used a diameter as a radius — the
 *    defining error of this skill — is caught. An odd diameter throws.
 *  - **The rounding is written out again**, `Math.round(x * 10) / 10` over a FLOAT, where
 *    the generator works in exact integer hundredths. Deliberately not a shared helper:
 *    one helper called twice is one derivation, and the whole point of one decimal place is
 *    that both sides agree on where it lands.
 */
const circleMeasure: Verifier = (q) => {
  const m = /^A circle has a (radius|diameter) of (\d+)\. What is its (area|circumference)\? Use (\d+(?:\.\d+)?) for pi\.$/.exec(q.prompt);
  if (!m) throw new Error(`circle verifier cannot parse: ${q.prompt}`);
  const given = Number(m[2]);
  if (given < 1) throw new Error(`a circle needs a size in: ${q.prompt}`);
  if (m[1] === "diameter" && given % 2 !== 0) throw new Error(`an odd diameter has no whole radius: ${q.prompt}`);
  const radius = m[1] === "diameter" ? given / 2 : given;
  const pi = Number(m[4]);
  if (!(pi > 3 && pi < 4)) throw new Error(`that is not pi in: ${q.prompt}`);
  // r squared by counting r lots of r, rather than by `r * r`.
  let squared = 0;
  for (let counted = 0; counted < radius; counted++) squared += radius;
  const value = m[3] === "area" ? pi * squared : pi * radius + pi * radius;
  return (Math.round(value * 10) / 10).toFixed(1);
};

// ---------------------------------------------------------------------------
// Grade 8
// ---------------------------------------------------------------------------

/**
 * "Solve for x: 4x - 3 = 2x + 7" / "Solve for x: 4x - 3 = 5"
 *
 * A genuine inverse: the generator picks x and builds the right-hand side from it, and this
 * runs that backwards — collect the x terms, collect the constants, divide. Both signs are
 * read out of the prompt and applied here, never assumed, so an equation printed with a
 * minus cannot be solved as if it had a plus.
 *
 * An equation with the same coefficient on both sides throws rather than dividing by zero:
 * `4x + 1 = 4x + 5` has no solution and is not a question. A non-integer solution throws for
 * the same reason it does in the grade-7 two-step verifier — every equation this skill asks
 * is built to come out whole, so a ragged one is a generator bug reaching the harness.
 */
const linearEquation: Verifier = (q) => {
  const m = /^Solve for x: (\d+)x ([+\-]) (\d+) = (?:(\d+)x ([+\-]) (\d+)|(-?\d+))$/.exec(q.prompt);
  if (!m) throw new Error(`linear equation verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]);
  const b = m[2] === "+" ? Number(m[3]) : -Number(m[3]);
  const bothSides = m[4] !== undefined;
  const c = bothSides ? Number(m[4]) : 0;
  const d = bothSides ? (m[5] === "+" ? Number(m[6]) : -Number(m[6])) : Number(m[7]);
  if (a === c) throw new Error(`the x terms cancel, so there is nothing to solve in: ${q.prompt}`);
  if ((d - b) % (a - c) !== 0) throw new Error(`no integer solution in: ${q.prompt}`);
  return String((d - b) / (a - c));
};

/**
 * "What is the slope of the line through (2, 3) and (6, 11)?"
 *
 * A genuine inverse: the generator draws the slope and places the second point from it,
 * while this recovers the slope from the two points. Which coordinate is the rise and which
 * the run is decided HERE, from the prompt's own ordering, so a generator that had divided
 * run by rise — the defining error of this skill — disagrees.
 *
 * Equal x-coordinates throw. A vertical line has no slope, and the question would be asking
 * a child to divide by zero.
 */
const slopeFromPoints: Verifier = (q) => {
  const m = /^What is the slope of the line through \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)\?$/.exec(q.prompt);
  if (!m) throw new Error(`slope verifier cannot parse: ${q.prompt}`);
  const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
  if (x1 === x2) throw new Error(`a vertical line has no slope: ${q.prompt}`);
  return reduceFraction(y2 - y1, x2 - x1);
};

/**
 * "Simplify: x^3 · x^5" / "Simplify: x^7 ÷ x^3" / "Simplify: (x^3)^2"
 *
 * NOT an inverse, and the prompt leaves none: both exponents are named, so there is nothing
 * to recover. What IS independent is the route. An exponent here is a COUNT OF FACTORS and
 * nothing else: a product lays the two runs of x end to end and counts them, a quotient
 * cancels one x off each side at a time until the bottom is empty, and a power of a power
 * lays down the inner run once per outer step. No `+`, `-` or `×` is applied to the
 * exponents themselves, which are precisely the three operations a child confuses. A
 * generator that added where it should multiply is caught; a shared misconception about
 * what an exponent MEANS would not be.
 *
 * The operator is read from the prompt and switched on, so a prompt flipped from `·` to `÷`
 * cannot keep the sum as its answer. An exponent that lands below 2 throws: `x^1` and `x^0`
 * are a different lesson and this skill never asks them.
 */
const exponentRules: Verifier = (q) => {
  const m = /^Simplify: (?:x\^(\d+) ([·÷]) x\^(\d+)|\(x\^(\d+)\)\^(\d+))$/.exec(q.prompt);
  if (!m) throw new Error(`exponent verifier cannot parse: ${q.prompt}`);
  const factors: string[] = [];
  if (m[4] !== undefined) {
    const inner = Number(m[4]), outer = Number(m[5]);
    if (inner < 1 || outer < 1) throw new Error(`an exponent of none in: ${q.prompt}`);
    for (let step = 0; step < outer; step++) for (let one = 0; one < inner; one++) factors.push("x");
  } else {
    const a = Number(m[1]), b = Number(m[3]);
    if (a < 1 || b < 1) throw new Error(`an exponent of none in: ${q.prompt}`);
    for (let one = 0; one < a; one++) factors.push("x");
    if (m[2] === "·") {
      for (let one = 0; one < b; one++) factors.push("x");
    } else {
      for (let one = 0; one < b; one++) {
        if (factors.length === 0) throw new Error(`more x's cancelled than there were in: ${q.prompt}`);
        factors.pop();
      }
    }
  }
  if (factors.length < 2) throw new Error(`this skill never asks for x to the first or zeroth power: ${q.prompt}`);
  return `x^${factors.length}`;
};

/**
 * "A right triangle has legs 3 and 4. How long is the hypotenuse?"
 *
 * NOT an inverse: both legs are named, so nothing is left to recover. Two things here ARE
 * independent, and the second is the one that matters.
 *
 * Each leg is squared by counting it out that many times, and the hypotenuse is found by
 * laying down consecutive odd numbers — 1, 3, 5, 7 — because that is what a square number
 * IS. Neither `*` nor `Math.sqrt` appears, and `Math.sqrt(25)` returning 4.999999 is not a
 * failure mode this can have.
 *
 * And the sum of the squares MUST be a perfect square, or this throws. That is the guard
 * the whole skill rests on: legs of 3 and 5 give an irrational hypotenuse, which cannot be
 * one of four choices on a screen, and a generator that wandered off the triple table
 * reaches the harness here rather than reaching a child.
 */
const pythagorean: Verifier = (q) => {
  const m = /^A right triangle has legs (\d+) and (\d+)\. How long is the hypotenuse\?$/.exec(q.prompt);
  if (!m) throw new Error(`Pythagorean verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]), b = Number(m[2]);
  if (a < 1 || b < 1) throw new Error(`a triangle needs two legs in: ${q.prompt}`);
  if (a > 500 || b > 500) throw new Error(`legs too long to count out in: ${q.prompt}`);
  const square = (n: number) => {
    let total = 0;
    for (let counted = 0; counted < n; counted++) total += n;
    return total;
  };
  const target = square(a) + square(b);
  let side = 0, running = 0, odd = 1;
  while (running < target) {
    running += odd;
    odd += 2;
    side += 1;
  }
  if (running !== target) throw new Error(`these legs have no whole hypotenuse: ${q.prompt}`);
  return String(side);
};

/**
 * A decimal string as an exact integer and a power of ten, with trailing zeros normalised
 * away: "4,500" is 45 × 10², "0.0045" is 45 × 10⁻⁴, and both come back as `{45, ...}`. No
 * float touches one, so `4.56 × 10^5` is compared by its digits rather than by a product
 * that might land on 455999.99999999994.
 */
function powerOfTenParts(text: string): { digits: number; shift: number } {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`not a decimal this can read: ${text}`);
  const fraction = m[2] ?? "";
  let digits = Number(m[1] + fraction);
  let shift = -fraction.length;
  if (digits === 0) throw new Error(`zero has no scientific notation: ${text}`);
  while (digits % 10 === 0) {
    digits /= 10;
    shift += 1;
  }
  return { digits, shift };
}

/** How many digits an integer is written with, so a mantissa's size can be read off it. */
const digitCount = (n: number): number => String(n).length;

/**
 * "Write 4,500 in scientific notation." — the choices carry the candidate answers.
 *
 * A genuinely independent derivation, and the one the skill needs: every choice is parsed
 * back into a mantissa and an exponent and MULTIPLIED OUT again, then compared to the
 * number the prompt names with its commas stripped. The generator goes the other way, from
 * digits and a power of ten to a printed number, so a generator that had placed the point
 * one column off disagrees here.
 *
 * Reaching the right VALUE is not enough: `45 × 10^2` is 4,500 and is not scientific
 * notation, so a mantissa outside [1, 10) is rejected before its value is even looked at.
 * That test is done on the digits rather than on a float — a mantissa is in range exactly
 * when its digit count plus its shift is one — which is what makes "0.45" and "45" both
 * fail without ever forming a number.
 *
 * Exactly one choice must survive both tests. Two survivors would mean the same number
 * written two ways, which is a question with no single right answer.
 */
const sciNotation: Verifier = (q) => {
  const m = /^Write ([\d,.]+) in scientific notation\.$/.exec(q.prompt);
  if (!m) throw new Error(`scientific notation verifier cannot parse: ${q.prompt}`);
  const target = powerOfTenParts(m[1].replace(/,/g, ""));
  const passes = q.choices.filter((choice) => {
    const cm = /^(\d+(?:\.\d+)?) × 10\^(-?\d+)$/.exec(choice);
    if (!cm) return false;
    const mantissa = powerOfTenParts(cm[1]);
    if (digitCount(mantissa.digits) + mantissa.shift !== 1) return false; // not between 1 and 10
    return mantissa.digits === target.digits && mantissa.shift + Number(cm[2]) === target.shift;
  });
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices are ${m[1]} in scientific notation: ${q.choices.join(", ")}`);
  }
  return passes[0];
};

// ---------------------------------------------------------------------------
// Grade 9 — Algebra I
// ---------------------------------------------------------------------------

/**
 * "Solve for x: 2(x + 3) = 4x - 8" / "Solve for x: 3(x - 4) = x/2 + 8"
 *
 * A genuine inverse: the generator picks x and builds the right-hand side from it, and this
 * runs it backwards. The distribution is done HERE too — `a` times the constant inside the
 * bracket, not `a` times x alone — so a generator that had distributed to the first term
 * only, which is the mistake this skill exists to catch, disagrees rather than agreeing.
 *
 * Every sign is read out of the prompt and applied here. An equation printed with a minus
 * cannot be solved as if it had a plus, and the two shapes are told apart by which one the
 * prompt actually wrote rather than by a level number this file never sees.
 *
 * Equal coefficients throw: the x terms cancel and there is nothing to solve. A non-integer
 * solution throws too — every equation this skill asks is built to come out whole, so a
 * ragged one is a generator bug on its way to a child.
 */
const multiStepEquation: Verifier = (q) => {
  const m = /^Solve for x: (\d+)\(x ([+\-]) (\d+)\) = (?:(\d+)x|x\/(\d+)) ([+\-]) (\d+)$/.exec(q.prompt);
  if (!m) throw new Error(`multi-step equation verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]);
  const b = m[2] === "+" ? Number(m[3]) : -Number(m[3]);
  const d = m[6] === "+" ? Number(m[7]) : -Number(m[7]);
  if (a === 0) throw new Error(`no bracket to distribute in: ${q.prompt}`);
  // a(x + b) = cx + d  ->  (a - c)x = d - ab
  // a(x + b) = x/e + d ->  (ae - 1)x = e(d - ab)
  const overDivisor = m[5] !== undefined;
  const e = overDivisor ? Number(m[5]) : 0;
  if (overDivisor && e < 2) throw new Error(`a divisor of ${e} in: ${q.prompt}`);
  const numerator = overDivisor ? e * (d - a * b) : d - a * b;
  const denominator = overDivisor ? a * e - 1 : a - Number(m[4]);
  if (denominator === 0) throw new Error(`the x terms cancel, so there is nothing to solve in: ${q.prompt}`);
  if (numerator % denominator !== 0) throw new Error(`no integer solution in: ${q.prompt}`);
  return String(numerator / denominator);
};

/** A coefficient as it is written in an equation: "" is 1, "-" is -1, anything else is itself. */
function writtenCoefficient(text: string): number {
  if (text === "" || text === "+") return 1;
  if (text === "-") return -1;
  const value = Number(text);
  if (!Number.isInteger(value)) throw new Error(`not a coefficient: ${text}`);
  return value;
}

/**
 * "Solve: x + y = 10 and x - y = 4. What is x?"
 *
 * A genuine inverse: the generator picks the pair (x, y) and builds both right-hand sides
 * from them, while this recovers the pair from the four coefficients and two totals by
 * elimination. Cramer's rule rather than substitution, so it shares no step with the
 * generator beyond arithmetic.
 *
 * **Which variable is wanted is read from the prompt and switched on**, never assumed. A
 * prompt flipped from "What is x?" to "What is y?" cannot keep the old answer, which is the
 * failure mode a verifier that only ever returned x would be blind to — and the two numbers
 * are both on screen, because the other one is this skill's mandatory distractor.
 *
 * A zero determinant throws: two parallel lines have no single solution to ask about. A
 * non-integer solution throws for the same reason it does everywhere else in this file.
 */
const systemOfEquations: Verifier = (q) => {
  const m = /^Solve: (-?\d*)x ([+\-]) (\d*)y = (-?\d+) and (-?\d*)x ([+\-]) (\d*)y = (-?\d+)\. What is (x|y)\?$/.exec(q.prompt);
  if (!m) throw new Error(`system verifier cannot parse: ${q.prompt}`);
  const a = writtenCoefficient(m[1]);
  const b = writtenCoefficient(m[3]) * (m[2] === "+" ? 1 : -1);
  const e = Number(m[4]);
  const c = writtenCoefficient(m[5]);
  const d = writtenCoefficient(m[7]) * (m[6] === "+" ? 1 : -1);
  const f = Number(m[8]);
  const determinant = a * d - b * c;
  if (determinant === 0) throw new Error(`these two lines never meet at one point: ${q.prompt}`);
  const xTimes = e * d - b * f;
  const yTimes = a * f - e * c;
  if (xTimes % determinant !== 0 || yTimes % determinant !== 0) {
    throw new Error(`no whole-number solution in: ${q.prompt}`);
  }
  return String((m[9] === "x" ? xTimes : yTimes) / determinant);
};

/**
 * "Factor: x² + 7x + 12" — the choices carry the candidate factorisations.
 *
 * The independent derivation, and the reason this skill is worth generating at all: every
 * choice is compared to the prompt's quadratic **by value, at five different x**, rather than
 * by multiplying the two constants out. Nothing here knows the FOIL identity. Two quadratics
 * that agree at five points are the same quadratic — three would do — so a generator with its
 * own idea of how brackets expand does not get to be right here by sharing that idea.
 *
 * Exactly one choice must match. Two would mean the same quadratic factored two ways on one
 * screen, which is a question with no single right answer — and catching that is the whole
 * point of testing every choice rather than only the answer.
 *
 * The survivor must also be written canonically, smaller number first. `(x + 4)(x + 3)` is
 * the same factorisation as `(x + 3)(x + 4)` and would pass every check above; insisting on
 * the order HERE is what keeps the answer to one spelling, for every draw of every level.
 */
const factorQuadratic: Verifier = (q) => {
  const m = /^Factor: x² ([+\-]) (\d*)x ([+\-]) (\d+)$/.exec(q.prompt);
  if (!m) throw new Error(`factoring verifier cannot parse: ${q.prompt}`);
  const middle = (m[2] === "" ? 1 : Number(m[2])) * (m[1] === "+" ? 1 : -1);
  const constant = Number(m[4]) * (m[3] === "+" ? 1 : -1);
  const passes = q.choices.filter((choice) => {
    const c = /^\(x ([+\-]) (\d+)\)\(x ([+\-]) (\d+)\)$/.exec(choice);
    if (!c) return false;
    const first = Number(c[2]) * (c[1] === "+" ? 1 : -1);
    const second = Number(c[4]) * (c[3] === "+" ? 1 : -1);
    return [-2, -1, 0, 1, 2].every((at) => (at + first) * (at + second) === at * at + middle * at + constant);
  });
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices factor ${q.prompt}: ${q.choices.join(", ")}`);
  }
  const c = /^\(x ([+\-]) (\d+)\)\(x ([+\-]) (\d+)\)$/.exec(passes[0])!;
  const first = Number(c[2]) * (c[1] === "+" ? 1 : -1);
  const second = Number(c[4]) * (c[3] === "+" ? 1 : -1);
  if (first > second) throw new Error(`the factors are written the wrong way round in: ${passes[0]}`);
  return passes[0];
};

/**
 * "A line has slope 3 and passes through (2, 4). Write it in slope-intercept form."
 *
 * A genuine inverse: the generator picks the intercept and places the point from it, while
 * this recovers the intercept from the point — `b = y - mx`, which is the skill itself run
 * backwards. A generator that had added where it should subtract disagrees here, and so does
 * one that read the point's coordinates the other way round.
 *
 * The answer is rendered here from scratch rather than matched against the choices, so a
 * generator that got the arithmetic right and the WRITING wrong — `y = 3x + -2` — fails too.
 * A slope of zero throws: `y = 0x - 2` is not how anyone writes a horizontal line.
 */
const slopeInterceptForm: Verifier = (q) => {
  const m = /^A line has slope (-?\d+) and passes through \((-?\d+), (-?\d+)\)\. Write it in slope-intercept form\.$/.exec(q.prompt);
  if (!m) throw new Error(`slope-intercept verifier cannot parse: ${q.prompt}`);
  const slope = Number(m[1]), px = Number(m[2]), py = Number(m[3]);
  if (slope === 0) throw new Error(`a line with no slope has no slope-intercept form worth asking: ${q.prompt}`);
  const intercept = py - slope * px;
  const coefficient = slope === 1 ? "" : slope === -1 ? "-" : String(slope);
  return `y = ${coefficient}x ${intercept < 0 ? "-" : "+"} ${Math.abs(intercept)}`;
};

/**
 * "Solve: -2x + 1 < 9"
 *
 * The boundary is a genuine inverse — the generator builds the right-hand side from the
 * boundary and this recovers it — but the boundary is the easy half. **The direction is
 * decided by substitution, and that is the part that matters.**
 *
 * Turning the inequality around when you divide by a negative is the entire skill, and a
 * verifier that applied the same flip rule as the generator would be no second opinion at
 * all: if both believed the rule backwards, every child who got it right would be marked
 * wrong and nothing here would notice. So no flip rule is applied. Three numbers are put
 * back into the inequality AS PRINTED — one either side of the boundary, and the boundary
 * itself — and which of them satisfy it is what says whether the answer reads greater or
 * less, strict or not.
 *
 * If both sides of the boundary satisfy the inequality, or neither does, this throws: that is
 * not an inequality in x and there is no solution set to name.
 */
const inequality: Verifier = (q) => {
  const m = /^Solve: (-?\d+)x ([+\-]) (\d+) ([<>≤≥]) (-?\d+)$/.exec(q.prompt);
  if (!m) throw new Error(`inequality verifier cannot parse: ${q.prompt}`);
  const a = Number(m[1]);
  const b = m[2] === "+" ? Number(m[3]) : -Number(m[3]);
  const relation = m[4];
  const c = Number(m[5]);
  if (a === 0) throw new Error(`no x to solve for in: ${q.prompt}`);
  if ((c - b) % a !== 0) throw new Error(`the boundary is not a whole number in: ${q.prompt}`);
  const boundary = (c - b) / a;

  const holds = (at: number): boolean => {
    const left = a * at + b;
    switch (relation) {
      case "<": return left < c;
      case ">": return left > c;
      case "≤": return left <= c;
      case "≥": return left >= c;
      default: throw new Error(`unknown relation in: ${q.prompt}`);
    }
  };
  const above = holds(boundary + 1), below = holds(boundary - 1);
  if (above === below) throw new Error(`both sides of ${boundary} read the same in: ${q.prompt}`);
  const loose = holds(boundary);
  return `x ${above ? (loose ? "≥" : ">") : (loose ? "≤" : "<")} ${boundary}`;
};

// ---------------------------------------------------------------------------
// Grade 10 — Geometry
// ---------------------------------------------------------------------------

/** The two angles this skill is named after, spelled out rather than left as bare numbers. */
const RIGHT_ANGLE = 90;
const STRAIGHT_ANGLE = 180;

/**
 * "Two angles are complementary. One is 65°. What is the other?"
 *
 * **There is no inverse here and this does not pretend to one.** "90 minus" is its own
 * inverse: run it on the answer and the angle the prompt gave comes straight back, so any
 * verifier of this skill works in the same direction the generator did. An honest note is
 * worth more than a false sense of coverage.
 *
 * Two things it does add, and both are failures this file has actually seen. **The
 * relationship is read out of the prompt and switched on** — a generator that printed
 * "complementary" and answered the supplement disagrees here rather than being agreed with,
 * and a wording this does not recognise throws rather than being guessed at. And the test runs
 * over EVERY choice with exactly one required to pass: this skill's distractors are built from
 * the other relationship, and two angles on screen that both complete the pair would be a
 * question with no single right answer.
 */
const anglePair: Verifier = (q) => {
  const named = /^Two angles are (complementary|supplementary)\. One is (\d+)°\. What is the other\?$/.exec(q.prompt);
  const vertical = /^Two lines cross\. One of a pair of vertical angles is (\d+)°\. What is the other\?$/.exec(q.prompt);
  const sameSide = /^Parallel lines are cut by a transversal\. One same-side interior angle is (\d+)°\. What is the other\?$/.exec(q.prompt);
  let given: number;
  let completes: (other: number) => boolean;
  if (named) {
    given = Number(named[2]);
    const whole = named[1] === "complementary" ? RIGHT_ANGLE : STRAIGHT_ANGLE;
    completes = (other) => given + other === whole;
  } else if (vertical) {
    given = Number(vertical[1]);
    completes = (other) => other === given;                        // vertical angles are equal
  } else if (sameSide) {
    given = Number(sameSide[1]);
    completes = (other) => given + other === STRAIGHT_ANGLE;       // same-side interior angles are supplementary
  } else {
    throw new Error(`angle verifier cannot parse: ${q.prompt}`);
  }
  if (given < 1 || given > 359) throw new Error(`that is not an angle in: ${q.prompt}`);
  const passes = q.choices.filter((c) => /^\d+$/.test(c) && completes(Number(c)));
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices complete the pair in "${q.prompt}": ${q.choices.join(", ")}`);
  }
  return passes[0];
};

/**
 * "Two triangles are similar: the first has sides 3 and 5, and the second's side matching the
 * 3 is 12. What is the second's side matching the 5?"
 *
 * A genuinely different route: the generator scales a side UP by multiplying, and this never
 * divides. Every choice is put back into the proportion and cross-multiplied — `first × x`
 * against `second × image` — so a generator that added the scale where it should have
 * multiplied, which is this skill's mandatory wrong answer, fails the test rather than passing
 * it. Exactly one choice may satisfy the proportion, which is what would catch a distractor
 * that is quietly a second right answer.
 *
 * The prompt is also checked against itself: the side it says the image matches must be one of
 * the two it named, and the side it asks about must be the other.
 */
const similarTriangle: Verifier = (q) => {
  const m = /^Two triangles are similar: the first has sides (\d+) and (\d+), and the second's side matching the (\d+) is (\d+)\. What is the second's side matching the (\d+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`similar triangle verifier cannot parse: ${q.prompt}`);
  const first = Number(m[1]), second = Number(m[2]), image = Number(m[4]);
  if (Number(m[3]) !== first || Number(m[5]) !== second) {
    throw new Error(`the prompt matches sides it never named: ${q.prompt}`);
  }
  if (first === second) throw new Error(`"the side matching the ${first}" names both sides in: ${q.prompt}`);
  if (first < 1) throw new Error(`a triangle needs a size in: ${q.prompt}`);
  const passes = q.choices.filter((c) => /^\d+$/.test(c) && first * Number(c) === second * image);
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices are in proportion in "${q.prompt}": ${q.choices.join(", ")}`);
  }
  return passes[0];
};

/**
 * "In a right triangle, angle A has an opposite side of 3, an adjacent side of 4, and a
 * hypotenuse of 5. What is sin A?"
 *
 * **The ratio itself is computed in the same direction the generator computed it** — a
 * quotient of two of the three sides, with no inverse available, because the prompt already
 * names every side. Two things here are genuinely a second opinion:
 *
 *  - **The triangle is checked.** `opposite² + adjacent² = hypotenuse²` is tested here from the
 *    numbers a child reads, and nothing on this side has ever seen the triple table the
 *    generator draws from. A table with a wrong row in it fails here.
 *  - **Which ratio is wanted is read from the prompt and switched on.** A prompt that said
 *    "cos A" and kept the sine as its answer cannot pass, and that matters more than usual for
 *    this skill: the other ratio is its mandatory distractor, so both numbers are on screen.
 *
 * No trigonometric function is called. `Math.cos(Math.PI / 3)` is `0.5000000000000001`, which
 * is not `1/2` and would mark every correct child wrong.
 */
const trigRatio: Verifier = (q) => {
  const m = /^In a right triangle, angle A has an opposite side of (\d+), an adjacent side of (\d+), and a hypotenuse of (\d+)\. What is (sin|cos|tan) A\?$/.exec(q.prompt);
  if (!m) throw new Error(`trigonometry verifier cannot parse: ${q.prompt}`);
  const opposite = Number(m[1]), adjacent = Number(m[2]), hypotenuse = Number(m[3]);
  if (opposite < 1 || adjacent < 1) throw new Error(`a triangle needs two legs in: ${q.prompt}`);
  if (opposite * opposite + adjacent * adjacent !== hypotenuse * hypotenuse) {
    throw new Error(`those three sides are not a right triangle: ${q.prompt}`);
  }
  if (m[4] === "sin") return reduceFraction(opposite, hypotenuse);
  if (m[4] === "cos") return reduceFraction(adjacent, hypotenuse);
  return reduceFraction(opposite, adjacent);
};

/** The pi a prompt actually printed, rejected unless it really is one. */
function readPi(text: string, prompt: string): number {
  const pi = Number(text);
  if (!(pi > 3 && pi < 4)) throw new Error(`that is not pi in: ${prompt}`);
  return pi;
}

/** `base` multiplied by itself `exponent` times, reached by adding rather than by `**`. */
function raised(base: number, exponent: number): number {
  let total = 1;
  for (let power = 0; power < exponent; power++) {
    let sum = 0;
    for (let counted = 0; counted < base; counted++) sum += total;
    total = sum;
  }
  return total;
}

/**
 * "A cylinder has radius 3 and height 4. What is its volume? Use 3.14 for pi."
 *
 * **No inverse exists**: a solid whose every dimension is printed leaves nothing to recover,
 * so this computes the measure the same way round the generator did. What is genuinely
 * independent is everything around that arithmetic, and it is where this skill's defects would
 * live. **The solid and the measure are both read from the prompt and switched on**, so a
 * generator that printed "surface area" and answered with a volume — which is this skill's
 * mandatory distractor, and therefore on screen either way — disagrees here. **Pi is read from
 * the prompt** rather than assumed. And the rounding is done here from scratch, in floating
 * point from the printed 3.14, where the generator holds every measure as an exact whole
 * number over 100 or 300 and never forms a float at all: two roundings that can only disagree
 * on a tie, and the generator's note shows there are none.
 *
 * A cone is only ever asked for its volume. Its surface needs a slant height, and
 * `√(r² + h²)` is irrational for nearly every radius and height a child would be given.
 */
const solidMeasure: Verifier = (q) => {
  const prism = /^A rectangular prism is (\d+) by (\d+) by (\d+)\. What is its (volume|surface area)\?$/.exec(q.prompt);
  const cylinder = /^A cylinder has radius (\d+) and height (\d+)\. What is its (volume|surface area)\? Use (\d+(?:\.\d+)?) for pi\.$/.exec(q.prompt);
  const sphere = /^A sphere has radius (\d+)\. What is its (volume|surface area)\? Use (\d+(?:\.\d+)?) for pi\.$/.exec(q.prompt);
  const cone = /^A cone has radius (\d+) and height (\d+)\. What is its volume\? Use (\d+(?:\.\d+)?) for pi\.$/.exec(q.prompt);
  let value: number;
  if (prism) {
    const l = Number(prism[1]), w = Number(prism[2]), h = Number(prism[3]);
    if (l < 1 || w < 1 || h < 1) throw new Error(`a solid needs a size in: ${q.prompt}`);
    value = prism[4] === "volume" ? l * w * h : 2 * (l * w + l * h + w * h);
  } else if (cylinder) {
    const r = Number(cylinder[1]), h = Number(cylinder[2]), pi = readPi(cylinder[4], q.prompt);
    if (r < 1 || h < 1) throw new Error(`a solid needs a size in: ${q.prompt}`);
    value = cylinder[3] === "volume" ? pi * raised(r, 2) * h : 2 * pi * raised(r, 2) + 2 * pi * r * h;
  } else if (sphere) {
    const r = Number(sphere[1]), pi = readPi(sphere[3], q.prompt);
    if (r < 1) throw new Error(`a solid needs a size in: ${q.prompt}`);
    value = sphere[2] === "volume" ? (4 * pi * raised(r, 3)) / 3 : 4 * pi * raised(r, 2);
  } else if (cone) {
    const r = Number(cone[1]), h = Number(cone[2]), pi = readPi(cone[3], q.prompt);
    if (r < 1 || h < 1) throw new Error(`a solid needs a size in: ${q.prompt}`);
    value = (pi * raised(r, 2) * h) / 3;
  } else {
    throw new Error(`solid verifier cannot parse: ${q.prompt}`);
  }
  return (Math.round(value * 10) / 10).toFixed(1);
};

/**
 * "What is the distance between (1, 2) and (4, 6)?" / "What is the midpoint of (1, 2) and
 * (4, 6)?"
 *
 * Both readings are run the other way round from the generator, and neither takes a square
 * root or a half.
 *
 *  - **The distance is the whole number whose SQUARE is the sum of the two squares**, found by
 *    counting up to it. The generator builds the two points by stepping the legs of a
 *    Pythagorean triple apart; this squares a candidate back and compares, and a table with a
 *    wrong row in it fails here. A distance that is not whole throws — every pair this skill
 *    asks about is built to come out whole, so a ragged one is a generator bug on its way to a
 *    child.
 *  - **The midpoint is doubled, not halved**: the middle of two points is the point whose
 *    double is their sum. Exactly one choice may satisfy that, which is what catches a second
 *    right answer among the distractors.
 *
 * **Which of the two is wanted is read from the prompt and switched on.** This skill's
 * mandatory distractor is the midpoint offered against a distance question, so a prompt that
 * said "distance" while the answer key held a midpoint would have that midpoint on screen and
 * would look entirely well-formed.
 */
const distanceOrMidpoint: Verifier = (q) => {
  const m = /^What is the (distance between|midpoint of) \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)\?$/.exec(q.prompt);
  if (!m) throw new Error(`distance verifier cannot parse: ${q.prompt}`);
  const x1 = Number(m[2]), y1 = Number(m[3]), x2 = Number(m[4]), y2 = Number(m[5]);
  if (x1 === x2 && y1 === y2) throw new Error(`those are the same point: ${q.prompt}`);
  if (m[1] === "midpoint of") {
    const passes = q.choices.filter((choice) => {
      const c = /^\((-?\d+(?:\.5)?), (-?\d+(?:\.5)?)\)$/.exec(choice);
      return c !== null && 2 * Number(c[1]) === x1 + x2 && 2 * Number(c[2]) === y1 + y2;
    });
    if (passes.length !== 1) {
      throw new Error(`${passes.length} choices are the midpoint in "${q.prompt}": ${q.choices.join(", ")}`);
    }
    return passes[0];
  }
  const target = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  for (let distance = 1; distance * distance <= target; distance++) {
    if (distance * distance === target) return String(distance);
  }
  throw new Error(`the distance in ${q.prompt} is not a whole number`);
};

// ---------------------------------------------------------------------------
// Grade 11 — Algebra II
// ---------------------------------------------------------------------------

/**
 * "Solve: x² - 5x + 6 = 0. What is the larger root?"
 *
 * A genuine inverse, and a clean one: the generator picks the two roots and multiplies the
 * brackets out, while this recovers them from the coefficients by the quadratic formula. The
 * square root is taken by counting up to it rather than by `Math.sqrt`, so a discriminant that
 * is not a perfect square throws instead of handing back a rounding error.
 *
 * **Which root is wanted is read from the prompt and switched on.** The other root is this
 * skill's mandatory distractor, so both numbers are on screen and a prompt flipped from
 * "larger" to "smaller" would look entirely well-formed while marking every correct child
 * wrong.
 *
 * A discriminant of zero throws rather than answering. A repeated root makes "the larger root"
 * a question with no meaning, and it makes the smaller root the answer — the two failures the
 * generator redraws to avoid, said here so they hold for every draw of every level.
 */
const quadraticRoots: Verifier = (q) => {
  const m = /^Solve: (\d*)x² ([+\-]) (\d*)x ([+\-]) (\d+) = 0\. What is the (larger|smaller) root\?$/.exec(q.prompt);
  if (!m) throw new Error(`quadratic verifier cannot parse: ${q.prompt}`);
  const a = m[1] === "" ? 1 : Number(m[1]);
  const b = (m[2] === "+" ? 1 : -1) * (m[3] === "" ? 1 : Number(m[3]));
  const c = (m[4] === "+" ? 1 : -1) * Number(m[5]);
  if (a < 1) throw new Error(`that is not a quadratic: ${q.prompt}`);
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) throw new Error(`${q.prompt} has no two different real roots`);
  let gap = 0;
  for (let d = 1; d * d <= discriminant; d++) if (d * d === discriminant) gap = d;
  if (gap === 0) throw new Error(`the roots of ${q.prompt} are not whole numbers`);
  const larger = (-b + gap) / (2 * a), smaller = (-b - gap) / (2 * a);
  if (!Number.isInteger(larger) || !Number.isInteger(smaller)) {
    throw new Error(`the roots of ${q.prompt} are not whole numbers`);
  }
  return String(m[6] === "larger" ? larger : smaller);
};

/**
 * A polynomial as this file reads one: `"x² - 2x - 15"` to a coefficient per power, or `null`
 * when the text is not one.
 *
 * Read strictly, because the SPELLING is part of the answer here. Powers must descend and may
 * not repeat, a coefficient of one is left unwritten, a coefficient of zero is not written at
 * all, and the leading term carries no sign but a minus. `x² + 0x - 15` and `- 15 + x²` are
 * both rejected — an answer with two spellings is an answer a child can be marked wrong for
 * writing correctly.
 */
function polynomialTerms(text: string): Map<number, number> | null {
  const terms = text.split(/ (?=[+-] )/);
  const out = new Map<number, number>();
  let previous = Infinity;
  for (let i = 0; i < terms.length; i++) {
    const m = /^(?:([+-]) )?(\d*)(x[²³]?)?$/.exec(terms[i]);
    if (!m) return null;
    if ((i === 0) !== (m[1] === undefined)) return null;     // a sign on the first term, or none on a later one
    if (m[2] === "" && m[3] === undefined) return null;      // an empty term
    if (m[2] === "0") return null;                           // a zero term is not written at all
    const power = m[3] === undefined ? 0 : m[3] === "x" ? 1 : m[3] === "x²" ? 2 : 3;
    if (power >= previous) return null;
    previous = power;
    out.set(power, (m[1] === "-" ? -1 : 1) * (m[2] === "" ? 1 : Number(m[2])));
  }
  return out;
}

/** A polynomial's value at one x, from its coefficients. */
function polynomialAt(terms: Map<number, number>, x: number): number {
  let total = 0;
  for (const [power, coefficient] of terms) total += coefficient * x ** power;
  return total;
}

/**
 * "Expand: (x + 3)(x - 5)" — the choices carry the candidate expansions.
 *
 * **Nothing here knows how brackets multiply out.** Every choice is compared to the prompt's
 * two factors **by value, at seven different x**: the factors are evaluated and multiplied, the
 * choice is evaluated, and the two numbers must agree. Two polynomials of degree at most three
 * that agree at seven points are the same polynomial, so a generator with its own idea of FOIL
 * does not get to be right here by sharing that idea — which is the whole reason this skill is
 * worth generating.
 *
 * Exactly one choice may match. Two would mean the same product written two ways on one
 * screen, and catching that is why every choice is tested rather than only the answer.
 */
const expandPolynomial: Verifier = (q) => {
  const m = /^Expand: \(([^()]+)\)\(([^()]+)\)$/.exec(q.prompt);
  if (!m) throw new Error(`expansion verifier cannot parse: ${q.prompt}`);
  const first = polynomialTerms(m[1]), second = polynomialTerms(m[2]);
  if (!first || !second) throw new Error(`a factor this cannot read in: ${q.prompt}`);
  const points = [-3, -2, -1, 0, 1, 2, 3];
  const passes = q.choices.filter((choice) => {
    const terms = polynomialTerms(choice);
    return terms !== null && points.every((x) => polynomialAt(terms, x) === polynomialAt(first, x) * polynomialAt(second, x));
  });
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices expand ${q.prompt}: ${q.choices.join(", ")}`);
  }
  return passes[0];
};

/** No square divides it — which is what "fully simplified" means under a root. */
function squareFree(n: number): boolean {
  for (let d = 2; d * d <= n; d++) if (n % (d * d) === 0) return false;
  return true;
}

/**
 * "Simplify: √72" — the choices carry the candidate simplifications.
 *
 * Squared back rather than factored: `a√b` is the answer exactly when `a² × b` is the radicand
 * the prompt names. The generator goes the other way, choosing a perfect square and a
 * square-free part and multiplying them together, so a generator that pulled the wrong factor
 * out disagrees here.
 *
 * **And `b` must be square-free, which is half the test rather than a flourish.** `√72`
 * squares back to 72 and so does `2√18`; both are true statements about the square root of 72
 * and neither is simplified. Without the square-free assertion this verifier would accept
 * either one, and the generator offers both precisely so that a verifier missing it fails
 * loudly. A bare integer is read as `a√1`, which is how a perfect square passes both tests.
 *
 * Exactly one choice may survive: a second would be the same number written another way.
 */
const simplifyRadical: Verifier = (q) => {
  const m = /^Simplify: √(\d+)$/.exec(q.prompt);
  if (!m) throw new Error(`radical verifier cannot parse: ${q.prompt}`);
  const radicand = Number(m[1]);
  if (radicand < 2) throw new Error(`there is nothing to simplify in: ${q.prompt}`);
  const passes = q.choices.filter((choice) => {
    const surd = /^(\d*)√(\d+)$/.exec(choice);
    const outside = surd ? (surd[1] === "" ? 1 : Number(surd[1])) : /^\d+$/.test(choice) ? Number(choice) : null;
    const inside = surd ? Number(surd[2]) : /^\d+$/.test(choice) ? 1 : null;
    if (outside === null || inside === null || inside < 1 || outside < 1) return false;
    return outside * outside * inside === radicand && squareFree(inside);
  });
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices are √${radicand} fully simplified: ${q.choices.join(", ")}`);
  }
  return passes[0];
};

/** The base a logarithm is written with. No subscript means ten, by convention. */
const LOG_BASES: Record<string, number> = { "₂": 2, "₃": 3, "₅": 5, "": 10 };

/**
 * "What is log₂(32)?" / "What is log(1000)?" / "What is log₂(1/8)?"
 *
 * A genuine inverse: the generator raises the base to a power, and this **divides the argument
 * down to 1 and counts the steps**, which is what a logarithm is. An argument that is not a
 * whole power of its base throws rather than being rounded to the nearest one — every question
 * this skill asks is built to come out whole, so a ragged one is a generator bug on its way to
 * a child.
 *
 * A unit fraction counts the same divisions and comes back negative: `1/8` is three steps down
 * from 1, so `log₂(1/8)` is -3.
 *
 * **The base is read from the prompt**, including the base 10 that convention leaves unwritten.
 * The base is also this skill's mandatory distractor, so it is on screen either way — a
 * verifier that assumed 2 would answer `log₃(81)` with a number that is already a choice.
 */
const logarithm: Verifier = (q) => {
  const m = /^What is log([₂₃₅]?)\((\d+|1\/\d+)\)\?$/.exec(q.prompt);
  if (!m) throw new Error(`logarithm verifier cannot parse: ${q.prompt}`);
  return String(logSteps(m[2], LOG_BASES[m[1]], q.prompt));
};

/**
 * How many times `base` divides `text` down to 1 — the logarithm, counted rather than computed.
 * A unit fraction counts the same divisions the other way and comes back negative: `1/8` is
 * three steps down from 1, so it is -3 in base 2.
 *
 * An argument that is not a whole power of its base throws rather than being rounded to the
 * nearest one. Every question either logarithm skill asks is built to come out whole, so a
 * ragged one is a generator bug on its way to a child.
 *
 * Shared by the grade-11 logarithm above and the grade-12 equation solver below, which is the
 * one kind of sharing this file allows: both are verifiers, and neither has ever seen a
 * generator. A second copy is a second place for the sign of a unit fraction to go wrong.
 */
function logSteps(text: string, base: number | undefined, prompt: string): number {
  if (base === undefined || base < 2) throw new Error(`that is not a base in: ${prompt}`);
  const fraction = /^1\/(\d+)$/.exec(text);
  if (!fraction && !/^\d+$/.test(text)) throw new Error(`a power this cannot read, "${text}", in: ${prompt}`);
  let value = fraction ? Number(fraction[1]) : Number(text);
  if (value < 1) throw new Error(`a logarithm needs a positive argument: ${prompt}`);
  let steps = 0;
  while (value > 1) {
    if (value % base !== 0) throw new Error(`${text} is not a whole power of ${base} in: ${prompt}`);
    value /= base;
    steps += 1;
  }
  return fraction ? -steps : steps;
}

/**
 * "If f(x) = 2x + 1 and g(x) = x - 3, what is f(g(4))?"
 *
 * **No inverse exists here** — the prompt names both functions and the input, and leaves
 * nothing to recover — so this is not two derivations in the way the quadratic verifier is.
 * What it is is two different routes to the same number. The generator NESTS: it works out
 * `g(4)` and then feeds it to `f`. This MULTIPLIES OUT: `f(g(x))` is `acx + ad + b`, reached
 * without ever forming the inner value. The two agree only if the distributive law was applied
 * correctly, which is the arithmetic this skill is actually about.
 *
 * **Which function is on the outside is read from the prompt and switched on.** `g(f(4))` is
 * this skill's mandatory distractor and is therefore always among the choices, so a prompt that
 * had the order the other way round would look well-formed while every correct child was marked
 * wrong — the exact failure that makes this switch worth writing rather than assuming.
 */
const composeFunctions: Verifier = (q) => {
  const m = /^If f\(x\) = (-?\d*)x ([+\-]) (\d+) and g\(x\) = (-?\d*)x ([+\-]) (\d+), what is (f\(g|g\(f)\((-?\d+)\)\)\?$/.exec(q.prompt);
  if (!m) throw new Error(`composition verifier cannot parse: ${q.prompt}`);
  const a = writtenCoefficient(m[1]);
  const b = (m[2] === "+" ? 1 : -1) * Number(m[3]);
  const c = writtenCoefficient(m[4]);
  const d = (m[5] === "+" ? 1 : -1) * Number(m[6]);
  const at = Number(m[8]);
  if (a === 0 || c === 0) throw new Error(`a constant function has nothing to compose in: ${q.prompt}`);
  // f(g(x)) = a(cx + d) + b = acx + ad + b, and g(f(x)) = c(ax + b) + d = cax + cb + d.
  return String(m[7] === "f(g" ? a * c * at + a * d + b : c * a * at + c * b + d);
};

// ---------------------------------------------------------------------------
// Grade 12 — Precalculus and statistics
// ---------------------------------------------------------------------------

/**
 * **The cosine table, written value first.**
 *
 * The generator holds an angle-to-value table; a verifier holding the same table the same way
 * round is a transcription of it, and a transcription agrees with its source about everything,
 * including the mistakes. This one is indexed the other way — each value, and the angles where
 * the cosine takes it — so the two disagree the moment either one has a row wrong.
 *
 * The SINE is not tabulated at all. `sin θ = cos(90° - θ)` is the definition of the co-function
 * on the unit circle, and one table plus that identity is one thing to get wrong rather than
 * two. It also means the sine questions are answered by a route the generator does not have:
 * the generator reads the sine column, and this reflects the angle and reads the cosine.
 */
const COSINE_AT: Record<string, readonly number[]> = {
  "1": [0],
  "√3/2": [30, 330],
  "√2/2": [45, 315],
  "1/2": [60, 300],
  "0": [90, 270],
  "-1/2": [120, 240],
  "-√2/2": [135, 225],
  "-√3/2": [150, 210],
  "-1": [180],
};

/** "60°" or "π/3" to a whole number of degrees. A radian angle that is not one throws. */
function angleInDegrees(text: string, prompt: string): number {
  const degrees = /^(\d+)°$/.exec(text);
  if (degrees) return Number(degrees[1]);
  const radians = /^(\d*)π(?:\/(\d+))?$/.exec(text);
  if (!radians) throw new Error(`that is not an angle in: ${prompt}`);
  const numerator = radians[1] === "" ? 1 : Number(radians[1]);
  const denominator = radians[2] === undefined ? 1 : Number(radians[2]);
  if (denominator === 0) throw new Error(`an angle cannot be divided by zero: ${prompt}`);
  const whole = (180 * numerator) / denominator;
  if (!Number.isInteger(whole)) throw new Error(`${text} is not a whole number of degrees in: ${prompt}`);
  return whole;
}

/**
 * "What is cos(60°)?" / "What is sin(π/3)?"
 *
 * **Which function is asked is read from the prompt and switched on.** The other one is this
 * skill's mandatory distractor and is therefore on screen, so a prompt that said `cos` while
 * the generator answered with the sine would look entirely well-formed while marking every
 * correct child wrong.
 *
 * Nothing here computes a trigonometric function. `Math.cos(Math.PI / 3)` is
 * `0.5000000000000001`, which is not `1/2` and is not any string a child could pick.
 */
const unitCircleValue: Verifier = (q) => {
  const m = /^What is (sin|cos)\(([^()]+)\)\?$/.exec(q.prompt);
  if (!m) throw new Error(`unit circle verifier cannot parse: ${q.prompt}`);
  const degrees = angleInDegrees(m[2], q.prompt);
  // A sine question is answered as the cosine of the complementary angle, brought back into
  // one turn. The modulo is written twice because `-30 % 360` is `-30` in JavaScript.
  const at = (((m[1] === "cos" ? degrees : 90 - degrees) % 360) + 360) % 360;
  const found = Object.entries(COSINE_AT).filter(([, angles]) => angles.includes(at));
  if (found.length !== 1) throw new Error(`${at}° is not one of the special angles, in: ${q.prompt}`);
  return found[0][0];
};

/**
 * "An arithmetic sequence starts at 4 with common difference 3. What is the 7th term?"
 *
 * **No inverse exists here** — the prompt names the start, the step and the position, and the
 * term is the only thing left to work out — so this is not two derivations the way the radical
 * verifier is. What it is is the other route to the same number: the generator uses the closed
 * form, `a + (n - 1)d` and `a rⁿ⁻¹`, and this **counts the sequence out** one term at a time,
 * which is what "the 7th term" means in words. The off-by-one those formulas exist to prevent
 * is the one mistake the two routes cannot make together, and it is also this skill's mandatory
 * distractor, so a generator that took n steps would find its own wrong answer already on screen.
 *
 * **Which kind of sequence is read from the prompt and cross-checked against the word it uses
 * for its step.** An arithmetic sequence has a common difference and a geometric one a common
 * ratio; a prompt that mixed them is a defect rather than a question, and so is one whose
 * ordinal does not match its number.
 */
const sequenceTerm: Verifier = (q) => {
  const m = /^An (arithmetic|geometric) sequence starts at (-?\d+) with common (difference|ratio) (-?\d+)\. What is the (\d+)(st|nd|rd|th) term\?$/.exec(q.prompt);
  if (!m) throw new Error(`sequence verifier cannot parse: ${q.prompt}`);
  const arithmetic = m[1] === "arithmetic";
  if (arithmetic !== (m[3] === "difference")) {
    throw new Error(`an ${m[1]} sequence has no common ${m[3]}: ${q.prompt}`);
  }
  const start = Number(m[2]), step = Number(m[4]), index = Number(m[5]);
  if (index < 1 || index > 40) throw new Error(`that is not a term to ask for: ${q.prompt}`);
  const rest = index % 100, last = index % 10;
  const suffix = rest >= 11 && rest <= 13 ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  if (suffix !== m[6]) throw new Error(`there is no "${index}${m[6]}" term: ${q.prompt}`);
  if (!arithmetic && step === 0) throw new Error(`a geometric sequence cannot have a ratio of zero: ${q.prompt}`);
  let term = start;
  for (let position = 1; position < index; position++) term = arithmetic ? term + step : term * step;
  return String(term);
};

/**
 * "A bag has 3 red and 5 blue marbles. What is the probability of drawing red?"
 *
 * **The bag is rebuilt from the prompt as a list of marbles and the outcomes are counted.** For
 * one draw that is the same arithmetic the generator did, and this says so rather than claiming
 * a second opinion it does not have: the count over the total IS the probability, and there is
 * no other route to it. What the rebuild does add is that the total is re-added from the colours
 * actually printed, so a bag whose total was computed from something else disagrees.
 *
 * **For two draws it is a genuinely different route.** The generator multiplies two
 * probabilities; this walks every ordered pair of marbles in the bag and counts the pairs that
 * are both the asked colour, which is what "independent" means before it is a formula.
 *
 * **How many draws there are is read from the sentence and cross-checked against the question's
 * wording** — a prompt that put one marble back and then asked about a single draw is a defect
 * rather than a question. And exactly one choice may reduce to the answer's value: two spellings
 * of the same probability on one screen is a question with two right answers.
 */
const marbleProbability: Verifier = (q) => {
  const m = /^A bag has (.+?) marbles\.(.*) What is the probability (of drawing|that both are) ([a-z]+)\?$/.exec(q.prompt);
  if (!m) throw new Error(`probability verifier cannot parse: ${q.prompt}`);
  const replaced = " One marble is drawn and put back, then another is drawn.";
  if (m[2] !== "" && m[2] !== replaced) throw new Error(`a drawing this cannot read in: ${q.prompt}`);
  const twoDraws = m[2] === replaced;
  if (twoDraws !== (m[3] === "that both are")) {
    throw new Error(`the prompt draws ${twoDraws ? "twice" : "once"} and asks about the other: ${q.prompt}`);
  }
  const marbles: string[] = [];
  const seen = new Set<string>();
  for (const part of m[1].split(/, | and /)) {
    const counted = /^(\d+) ([a-z]+)$/.exec(part);
    if (!counted) throw new Error(`a colour this cannot read, "${part}", in: ${q.prompt}`);
    if (seen.has(counted[2])) throw new Error(`${counted[2]} is in the bag twice: ${q.prompt}`);
    seen.add(counted[2]);
    for (let i = 0; i < Number(counted[1]); i++) marbles.push(counted[2]);
  }
  const asked = m[4];
  if (!seen.has(asked)) throw new Error(`there is no ${asked} in the bag: ${q.prompt}`);
  if (marbles.length < 2) throw new Error(`there is nothing to draw from in: ${q.prompt}`);

  let favourable = 0, outcomes = 0;
  if (twoDraws) {
    for (const first of marbles) {
      for (const second of marbles) {
        outcomes += 1;
        if (first === asked && second === asked) favourable += 1;
      }
    }
  } else {
    for (const marble of marbles) {
      outcomes += 1;
      if (marble === asked) favourable += 1;
    }
  }
  const probability = reduceFraction(favourable, outcomes);
  const passes = q.choices.filter((c) => /^-?\d+(?:\/\d+)?$/.test(c) && fractionKey(c) === probability);
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices are the probability in "${q.prompt}": ${q.choices.join(", ")}`);
  }
  return passes[0];
};

/**
 * "Simplify: (x² - 9) / (x + 3)" — the choices carry the candidate simplifications.
 *
 * **Multiplied back rather than divided.** A choice is the answer exactly when the choice times
 * the denominator is the numerator, and that is tested by VALUE at seven different x rather
 * than by any rule about factoring: the generator builds the numerator from two factors and
 * cancels one of them, and this never factors anything at all. A choice a degree too high —
 * which is what the term-cancelling distractors are — fails on the first point that is not a
 * root.
 *
 * The x where the denominator is zero is skipped, and that is the one place the missing domain
 * restriction shows itself: at x = -3 the equation reads `0 = 0` for every choice on screen, so
 * the point tests nothing and is dropped rather than being allowed to pass everything.
 *
 * Exactly one choice may survive. Two would be the same expression written twice.
 */
const simplifyRational: Verifier = (q) => {
  const m = /^Simplify: \(([^()]+)\) \/ \(([^()]+)\)$/.exec(q.prompt);
  if (!m) throw new Error(`rational expression verifier cannot parse: ${q.prompt}`);
  const numerator = polynomialTerms(m[1]), denominator = polynomialTerms(m[2]);
  if (!numerator || !denominator) throw new Error(`an expression this cannot read in: ${q.prompt}`);
  const points = [-7, -5, -4, -2, 2, 3, 4, 5, 7].filter((x) => polynomialAt(denominator, x) !== 0);
  if (points.length < 4) throw new Error(`nothing left to test in: ${q.prompt}`);
  const passes = q.choices.filter((choice) => {
    const terms = polynomialTerms(choice);
    return terms !== null
      && points.every((x) => polynomialAt(terms, x) * polynomialAt(denominator, x) === polynomialAt(numerator, x));
  });
  if (passes.length !== 1) {
    throw new Error(`${passes.length} choices simplify ${q.prompt}: ${q.choices.join(", ")}`);
  }
  return passes[0];
};

/**
 * "Solve: 2^x = 64" / "Solve: 2^(x - 2) = 8" / "Solve: log₂(x) = 5" / "Solve: 2^x = 1/8"
 *
 * A genuine inverse in both frames, and the same one: the generator RAISES a base to a power,
 * and `logSteps` above **divides back down to 1 and counts**, which is what a logarithm is.
 *
 *  - Written as an exponential, the count is the exponent and the shift printed in the bracket
 *    is taken off it. The shift is read from the prompt and signed, so `2^(x - 2) = 8` cannot
 *    keep the answer `2^(x + 2) = 8` would have.
 *  - Written as a logarithm, the answer is a number rather than an exponent, so it is found
 *    among the CHOICES: the one that divides down to 1 in exactly the number of steps the
 *    prompt names. Exactly one may, and a distractor one step out is rejected by the count.
 *
 * **The base is read from the prompt** in both frames, including the 10 that convention leaves
 * unwritten, and it is also this skill's mandatory distractor — so a verifier that assumed 2
 * would answer `3ˣ = 81` with a number already on screen.
 */
const exponentialEquation: Verifier = (q) => {
  const exponential = /^Solve: (\d+)\^(?:x|\(x ([+\-]) (\d+)\)) = (\d+|1\/\d+)$/.exec(q.prompt);
  if (exponential) {
    const base = Number(exponential[1]);
    const shift = exponential[2] === undefined ? 0 : (exponential[2] === "+" ? 1 : -1) * Number(exponential[3]);
    return String(logSteps(exponential[4], base, q.prompt) - shift);
  }
  const logarithmic = /^Solve: log([₂₃₅]?)\(x\) = (-?\d+)$/.exec(q.prompt);
  if (logarithmic) {
    const base = LOG_BASES[logarithmic[1]];
    if (base === undefined) throw new Error(`that is not a base in: ${q.prompt}`);
    const exponent = Number(logarithmic[2]);
    const passes = q.choices.filter((c) => {
      try {
        return logSteps(c, base, q.prompt) === exponent;
      } catch {
        return false;   // a choice that is not a whole power of the base is simply not the answer
      }
    });
    if (passes.length !== 1) {
      throw new Error(`${passes.length} choices solve ${q.prompt}: ${q.choices.join(", ")}`);
    }
    return passes[0];
  }
  throw new Error(`exponential equation verifier cannot parse: ${q.prompt}`);
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
  "addsub-1000": arithmetic,
  "mul-multi": mulMulti,
  "div-multi": divRemainder,
  /**
   * Grade 5's two-digit division prints exactly the same sentence grade 4's does, so it is
   * read by the same second derivation rather than by a copy of it: a duplicate is a second
   * thing to get wrong, and this one already counts the divisor out of the dividend without
   * ever using `/` or `%`.
   */
  "div-2digit": divRemainder,
  "frac-equiv": equivalentFraction,
  factors: factorOf,
  "frac-addsub": fractionAddSub,
  "frac-mul": fractionMultiply,
  "dec-ops": decimalOps,
  "volume-prism": boxMeasure,
  "order-ops": orderOfOperations,
  "ratio-rate": unitRate,
  "frac-div": fractionDivide,
  "eval-expr": evaluateExpression,
  proportion: proportionCost,
  "rational-ops": rationalAddSub,
  "percent-change": percentChange,
  "two-step-eq": twoStepEquation,
  "circle-measure": circleMeasure,
  "linear-eq": linearEquation,
  slope: slopeFromPoints,
  "exponent-rules": exponentRules,
  pythagorean,
  "sci-notation": sciNotation,
  "multi-step-eq": multiStepEquation,
  "systems-eq": systemOfEquations,
  "factor-quad": factorQuadratic,
  "slope-intercept": slopeInterceptForm,
  inequalities: inequality,
  "angle-pairs": anglePair,
  "similar-tri": similarTriangle,
  "trig-ratios": trigRatio,
  "solid-measure": solidMeasure,
  "dist-midpoint": distanceOrMidpoint,
  "quad-formula": quadraticRoots,
  "poly-ops": expandPolynomial,
  "radical-ops": simplifyRadical,
  "log-rules": logarithm,
  "fn-compose": composeFunctions,
  "unit-circle": unitCircleValue,
  sequences: sequenceTerm,
  probability: marbleProbability,
  "rational-expr": simplifyRational,
  "log-eq": exponentialEquation,
};
