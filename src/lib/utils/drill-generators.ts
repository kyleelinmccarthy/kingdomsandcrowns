/**
 * Math practice is generated, never stored: the ranges are tuned per skill and
 * mastery level, and a seeded rng makes every run reproducible in tests.
 */
import { compareNum, countSeq, tenMoreLess } from "./generators/elementary";

export type Question = {
  id: string;        // stable; encodes the parameters so a miss can be re-asked verbatim
  skillId: string;
  prompt: string;
  choices: string[]; // 4 (2 after fewerChoices trimming)
  answer: string;    // always one of choices
  readAloud?: string;
};

export type Rng = () => number;

/** mulberry32: small, fast, deterministic. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive integer in [min, max]. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Three distinct near-miss distractors: off by one or two, off by ten, and a
 * random nudge — the mistakes a hero actually makes, never the answer itself.
 */
export function numericDistractors(answer: number, rng: Rng, min = -Infinity): string[] {
  const candidates = shuffle([answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer + 3, answer - 3], rng);
  const out: number[] = [];
  for (const c of candidates) {
    if (c !== answer && c >= min && !out.includes(c)) out.push(c);
    if (out.length === 3) break;
  }
  let nudge = 4;
  while (out.length < 3) {
    const c = answer + nudge * (rng() < 0.5 ? 1 : -1);
    if (c !== answer && c >= min && !out.includes(c)) out.push(c);
    nudge += 1;
  }
  return out.map(String);
}

/**
 * The standard question shape: a stable id built from the skill and a parameter key, the
 * answer shuffled in among its distractors, and read-aloud text only when there is any.
 * Exported because every per-grade generator module builds its questions with it.
 */
export function makeQuestion(skillId: string, key: string, prompt: string, answer: string, distractors: string[], rng: Rng, spoken?: string): Question {
  return { id: `${skillId}:${key}`, skillId, prompt, choices: shuffle([answer, ...distractors], rng), answer, ...(spoken ? { readAloud: spoken } : {}) };
}

/** A signed integer spoken as words never contains a bare "-", so read-aloud text
 * built from it can never collide into an awkward "- -" run. */
function speakInt(n: number): string {
  return n < 0 ? `negative ${Math.abs(n)}` : String(n);
}

export type Generator = (level: number, rng: Rng, skillId: string) => Question;

const L = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));

// Sum ceilings per level, keyed by skill so one generator serves three skills.
const ADD_MAX: Record<string, number[]> = { "add-10": [5, 6, 8, 9, 10], "add-20": [10, 12, 15, 18, 20], "add-100": [20, 40, 60, 80, 100] };
const SUB_MAX: Record<string, number[]> = { "sub-10": [5, 6, 8, 9, 10], "sub-20": [10, 12, 15, 18, 20] };
const FACT_MAX = [2, 4, 6, 9, 12];
const INT_MAX = [10, 20, 30, 40, 50];
const PLACE_DIGITS = [2, 3, 4, 5, 6];
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
const PERCENT_BASE_MAX = [100, 200, 300, 400, 500];

const add: Generator = (level, rng, skillId) => {
  const max = (ADD_MAX[skillId] ?? ADD_MAX["add-20"])[L(level)];
  const a = randInt(rng, 0, max);
  const b = randInt(rng, 0, max - a);
  return makeQuestion(skillId, `${a}+${b}`, `What is ${a} + ${b}?`, String(a + b), numericDistractors(a + b, rng, 0), rng, `What is ${a} plus ${b}?`);
};

const sub: Generator = (level, rng, skillId) => {
  const max = (SUB_MAX[skillId] ?? SUB_MAX["sub-20"])[L(level)];
  const a = randInt(rng, 0, max);
  const b = randInt(rng, 0, a);
  return makeQuestion(skillId, `${a}-${b}`, `What is ${a} - ${b}?`, String(a - b), numericDistractors(a - b, rng, 0), rng, `What is ${a} minus ${b}?`);
};

const mul: Generator = (level, rng, skillId) => {
  const max = FACT_MAX[L(level)];
  const a = randInt(rng, 0, max);
  const b = randInt(rng, 0, max);
  return makeQuestion(skillId, `${a}x${b}`, `What is ${a} × ${b}?`, String(a * b), numericDistractors(a * b, rng, 0), rng, `What is ${a} times ${b}?`);
};

const div: Generator = (level, rng, skillId) => {
  const max = FACT_MAX[L(level)];
  const b = randInt(rng, 1, max);
  const q = randInt(rng, 0, 12);
  const a = b * q;
  return makeQuestion(skillId, `${a}/${b}`, `What is ${a} ÷ ${b}?`, String(q), numericDistractors(q, rng, 0), rng, `What is ${a} divided by ${b}?`);
};

const placeValue: Generator = (level, rng, skillId) => {
  const digits = PLACE_DIGITS[L(level)];
  const n = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
  const idx = randInt(rng, 0, digits - 1);
  const s = String(n);
  const answer = s[s.length - 1 - idx];
  const others = shuffle([...new Set(s.split(""))].filter((d) => d !== answer), rng);
  while (others.length < 3) {
    const d = String(randInt(rng, 0, 9));
    if (d !== answer && !others.includes(d)) others.push(d);
  }
  return makeQuestion(skillId, `${n}@${idx}`, `What digit is in the ${PLACES[idx]} place of ${n.toLocaleString("en-US")}?`, answer, others.slice(0, 3), rng);
};

const fractionsCompare: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const fractions = new Map<string, number>(); // "n/d" -> value
  const denomMax = [6, 10, 10, 8, 12][lvl];
  // Same-denominator rounds need a denominator of at least 5 so four distinct
  // fractions exist; smaller ones would spin forever looking for a fourth.
  const sameDenominator = lvl <= 1 ? randInt(rng, 5, denomMax) : null;
  while (fractions.size < 4) {
    const d = sameDenominator ?? randInt(rng, 2, denomMax);
    const n = randInt(rng, 1, d - 1);
    const value = n / d;
    if (![...fractions.values()].includes(value)) fractions.set(`${n}/${d}`, value);
  }
  const entries = [...fractions.entries()];
  const answer = entries.reduce((best, e) => (e[1] > best[1] ? e : best))[0];
  const key = entries.map(([k]) => k).join(",");
  return { id: `${skillId}:${key}`, skillId, prompt: "Which fraction is the largest?", choices: shuffle(entries.map(([k]) => k), rng), answer };
};

const integerOps: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const max = INT_MAX[lvl];
  const a = randInt(rng, -max, max);
  const b = randInt(rng, -max, max);
  const op = lvl >= 3 && rng() < 0.34 ? "×" : rng() < 0.5 ? "+" : "-";
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  const opWord = op === "+" ? "plus" : op === "-" ? "minus" : "times";
  return makeQuestion(
    skillId, `${a}${op}${b}`, `What is ${a} ${op} ${b}?`, String(answer), numericDistractors(answer, rng), rng,
    `What is ${speakInt(a)} ${opWord} ${speakInt(b)}?`,
  );
};

const percentOf: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const baseMax = PERCENT_BASE_MAX[lvl];
  let p: number, n: number;
  if (lvl === 0) {
    p = rng() < 0.5 ? 10 : 50;
    n = randInt(rng, 1, 10) * 10;
  } else {
    // Any multiple of 5 percent; pick n so the answer is whole.
    p = randInt(rng, 1, 19) * 5;
    const step = 100 / gcd(p, 100);
    n = randInt(rng, 1, Math.floor(baseMax / step)) * step;
  }
  const answer = (p * n) / 100;
  return makeQuestion(skillId, `${p}%${n}`, `What is ${p}% of ${n}?`, String(answer), numericDistractors(answer, rng, 0), rng, `What is ${p} percent of ${n}?`);
};

/** Exported for the fraction generators, which need to know when a fraction is in lowest terms. */
export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const oneStepEq: Generator = (level, rng, skillId) => {
  const lvl = L(level);
  const kind = lvl === 0 ? "add" : lvl === 1 ? "sub" : lvl === 2 ? "mul" : (["add", "sub", "mul"] as const)[randInt(rng, 0, 2)];
  const span = lvl >= 3 ? 20 : 10;
  const x = lvl >= 3 ? randInt(rng, -span, span) : randInt(rng, 0, span);
  let prompt: string, key: string, spoken: string;
  if (kind === "add") {
    const a = randInt(rng, 1, span);
    prompt = `Solve for x: x + ${a} = ${x + a}`; key = `x+${a}=${x + a}`;
    spoken = `Solve for x: x plus ${a} equals ${speakInt(x + a)}`;
  } else if (kind === "sub") {
    const a = randInt(rng, 1, span);
    prompt = `Solve for x: x - ${a} = ${x - a}`; key = `x-${a}=${x - a}`;
    spoken = `Solve for x: x minus ${a} equals ${speakInt(x - a)}`;
  } else {
    const a = lvl >= 3 ? randInt(rng, 2, 9) * (rng() < 0.3 ? -1 : 1) : randInt(rng, 2, 9);
    prompt = `Solve for x: ${a}x = ${a * x}`; key = `${a}x=${a * x}`;
    spoken = `Solve for x: ${speakInt(a)} x equals ${speakInt(a * x)}`;
  }
  return makeQuestion(skillId, key, prompt, String(x), numericDistractors(x, rng), rng, spoken);
};

export const GENERATORS: Record<string, Generator> = {
  add,
  sub,
  mul,
  div,
  "place-value": placeValue,
  "fractions-compare": fractionsCompare,
  "integer-ops": integerOps,
  "percent-of": percentOf,
  "one-step-eq": oneStepEq,
  "count-seq": countSeq,
  "compare-num": compareNum,
  "ten-more-less": tenMoreLess,
};
