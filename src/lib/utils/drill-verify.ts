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
  const value = (s: string) => {
    const m = /^(\d+)\/(\d+)$/.exec(s);
    if (!m) throw new Error(`not a fraction: ${s}`);
    return Number(m[1]) / Number(m[2]);
  };
  return q.choices.reduce((best, c) => (value(c) > value(best) ? c : best));
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
};
