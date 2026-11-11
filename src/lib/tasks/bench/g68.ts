/**
 * The grade 6-8 bench (R-C3): `ratio-rate`, `percent-of`, `proportion`, `circle-measure`,
 * `pythagorean` and `linear-eq`. Every one is a cut: a length or a count typed or stepped to.
 *
 * - ratio-rate: a mortar or paint mix (3 buckets of sand to every 1 of lime), or a unit rate
 *   (60 feet of fence in 5 hours).
 * - percent-of: a percentage trimmed off a beam, or of the stones in a wall.
 * - proportion: a scale plan (1 inch stands for 4 feet), or a weight scaled from n1 to n2 items.
 * - circle-measure: the well's ring (its circumference) or the paved yard round it (its area), with
 *   pi given as 3.14 so the answer is an exact decimal.
 * - pythagorean: the brace across a wall frame (the hypotenuse), and from level 2 the height of a
 *   frame that a brace of known length spans.
 * - linear-eq: a rope or beam cut in two (one piece so many feet longer, or so many times as long),
 *   and from level 3 in three, with half-foot answers.
 *
 * Sizes ride the range tables the choice generators use for the same skills (`RATE_TOTAL_MAX`,
 * `PERCENT_BASE_MAX`, `PROP_*`, `CIRCLE_RADIUS_MAX`, `TRIPLE_*`, `LINEAR_*`), so a level means the same
 * difficulty either way. Whole numbers wherever the choice ladder had them; the circle's answer is
 * exact in hundredths (built from integers, never a float that is graded) with a tolerance of "0.01",
 * and a half-foot answer is a decimal string.
 *
 * Every answer is at least two steps (RC-i), so the stepper never hands it over in one press, and
 * the ruler is the next 1, 2 or 5 times a power of ten above it. Typed lengths do the heavy lifting
 * where answers run large; the hundredths step on the circle is the precision the answer lives at.
 */
import { gcd, PERCENT_BASE_MAX, randInt } from "@/lib/utils/drill-generators";
import {
  CIRCLE_RADIUS_MAX, LINEAR_COEF_MAX, LINEAR_CONST_MAX, PROP_COUNT_MAX, PROP_UNIT_MAX, PYTHAGOREAN_TRIPLES,
  RATE_TOTAL_MAX, TRIPLE_HYP_MAX, TRIPLE_SCALE_MAX,
} from "@/lib/utils/generators/middle";
import { aOrAn, capitalAOrAn } from "./copy";
import { decString } from "./g35";
import type { BenchGenerator } from "./index";

const level4 = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));
const MINUS = "−";
const TIMES = "×";
const DIVIDE = "÷";
const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[randInt(rng, 0, xs.length - 1)];
const feet = (n: number) => (n === 1 ? "1 foot" : `${n} feet`);
/** Twice a length in whole or half units, as a string: 7 is "3.5", 8 is "4". */
export const halfString = (twice: number) => (twice % 2 === 0 ? String(twice / 2) : `${(twice - 1) / 2}.5`);

/** The ruler: the next 1, 2 or 5 times a power of ten that leaves room above the answer. */
export const rulerFor = (answer: number): string => {
  const need = answer * 1.25;
  for (let p = 1; ; p *= 10) {
    for (const m of [1, 2, 5]) if (m * p >= need) return String(m * p);
  }
};

// ---- ratio-rate -----------------------------------------------------------------------------

const MIXES = [
  { key: "mortar", unit: "buckets", say: (a: number, b: number, n: number) => `Mortar takes ${a} buckets of sand to every ${b} of lime. For ${n} buckets of sand, how many buckets of lime?` },
  { key: "paint", unit: "pots", say: (a: number, b: number, n: number) => `Paint takes ${a} pots of red to every ${b} of white. For ${n} pots of red, how many pots of white?` },
];
const RATE_JOBS = [
  { key: "fence", who: "The fence-maker", verb: "sets", what: "fence" },
  { key: "ditch", who: "The ditch-digger", verb: "digs", what: "ditch" },
  { key: "wall", who: "The wall-builder", verb: "lays", what: "wall" },
];
/** The biggest first and second terms of a mix's ratio, per level; level 0 is always "to every 1". */
const MIX_A_MAX = [4, 5, 6, 7, 8];
const MIX_B_MAX = [1, 2, 3, 4, 4];

const ratioRate: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  if (rng() < 0.5) {
    const a = randInt(rng, 2, MIX_A_MAX[L]);
    let b = randInt(rng, 1, MIX_B_MAX[L]);
    while (b === a) b = randInt(rng, 1, MIX_B_MAX[L]);
    // The sand in play stays within a quarter of the choice ladder's distance.
    const k = randInt(rng, 2, Math.floor(RATE_TOTAL_MAX[L] / 4 / a));
    const n = a * k;
    const answer = b * k;
    const mix = pick(rng, MIXES);
    const working = b === 1 ? `${n} ${DIVIDE} ${a}` : `${n} ${DIVIDE} ${a} ${TIMES} ${b}`;
    return {
      kind: "measure", id: `${skillId}:cut:mix:${mix.key}:${a}-${b}:${n}`, skillId,
      prompt: mix.say(a, b, n),
      mode: "cut", unit: mix.unit, quantity: "count", answer: String(answer), step: "1", maxLength: rulerFor(answer),
      bridge: `${working} = ${answer}`,
      explain: `${n} is ${k} lots of ${a}, so the mix needs ${k} lots of ${b}: ${working} = ${answer}.`,
    };
  }
  const hours = randInt(rng, 2, 12);
  const speed = randInt(rng, 2, Math.floor(RATE_TOTAL_MAX[L] / hours));
  const total = hours * speed;
  const job = pick(rng, RATE_JOBS);
  return {
    kind: "measure", id: `${skillId}:cut:rate:${job.key}:${total}/${hours}`, skillId,
    prompt: `${job.who} ${job.verb} ${total} feet of ${job.what} in ${hours} hours. How many feet is that an hour?`,
    mode: "cut", unit: "feet", quantity: "length", answer: String(speed), step: "1", maxLength: rulerFor(speed),
    bridge: `${total} ${DIVIDE} ${hours} = ${speed}`,
    explain: `Share ${total} feet across ${hours} hours: ${total} ${DIVIDE} ${hours} = ${speed} feet an hour.`,
  };
};

// ---- percent-of -----------------------------------------------------------------------------

const PERCENT_POOLS = new Map<number, Map<number, number[]>>();
/** For each percentage, the wholes that give a whole answer of at least 2 (so the answer is not one step). */
function percentPool(L: number): Map<number, number[]> {
  let pool = PERCENT_POOLS.get(L);
  if (!pool) {
    pool = new Map();
    const baseMax = PERCENT_BASE_MAX[L];
    const ps = L === 0 ? [10, 50] : Array.from({ length: 19 }, (_, i) => (i + 1) * 5);
    for (const p of ps) {
      const step = L === 0 ? 10 : 100 / gcd(p, 100);
      const ns: number[] = [];
      for (let n = step; n <= baseMax; n += step) if ((p * n) / 100 >= 2) ns.push(n);
      if (ns.length) pool.set(p, ns);
    }
    PERCENT_POOLS.set(L, pool);
  }
  return pool;
}

/** A beam is a believable length up to this many feet; past it the whole is a count of stones. */
const BEAM_MAX = 60;

const percentOf: BenchGenerator = (level, rng, skillId) => {
  const pool = percentPool(level4(level));
  const p = pick(rng, [...pool.keys()]);
  const n = pick(rng, pool.get(p)!);
  const answer = (p * n) / 100;
  const beam = n <= BEAM_MAX && rng() < 0.5;
  return {
    kind: "measure", id: `${skillId}:cut:${beam ? "beam" : "stones"}:${p}%${n}`, skillId,
    prompt: beam
      ? `Trim ${p}% off ${aOrAn(String(n))} ${n}-foot beam. How long is the piece trimmed off?`
      : `${p}% of the ${n} stones in a wall are cracked. How many stones need replacing?`,
    mode: "cut", unit: beam ? "feet" : "stones", quantity: beam ? "length" : "count", answer: String(answer), step: "1", maxLength: String(n),
    bridge: `${p}% ${TIMES} ${n} = ${answer}`,
    explain: `${p}% is ${p}/100 of the whole: ${p}% ${TIMES} ${n} = ${answer}.`,
  };
};

// ---- proportion -----------------------------------------------------------------------------

const PLAN_THINGS = ["wall", "hall", "bridge"];
const WEIGHT_ITEMS = ["bricks", "roof tiles", "grain sacks", "iron bars"];
/** Half-inches on the plan join at this level, with an even scale so the real length stays whole. */
const PLAN_HALVES_FROM = 2;

const proportion: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const wmax = PROP_COUNT_MAX[L];
  const kmax = PROP_UNIT_MAX[L];
  if (rng() < 0.5) {
    const half = L >= PLAN_HALVES_FROM && rng() < 0.4;
    const twice = half ? 2 * randInt(rng, 2, wmax - 1) + 1 : 2 * randInt(rng, 2, wmax); // twice the inches: 7 is 3.5
    const k = half ? 2 * randInt(rng, 1, Math.floor(kmax / 2)) : randInt(rng, 2, kmax);
    const w = halfString(twice);
    const answer = (twice * k) / 2;
    const thing = pick(rng, PLAN_THINGS);
    return {
      kind: "measure", id: `${skillId}:cut:plan:${thing}:${w}x${k}`, skillId,
      prompt: `On the plan, 1 inch stands for ${k} feet. The ${thing} is ${w} inches on the plan. How long is the real ${thing}?`,
      mode: "cut", unit: "feet", quantity: "length", answer: String(answer), step: "1", maxLength: rulerFor(answer),
      bridge: `${w} ${TIMES} ${k} = ${answer}`,
      explain: `Each inch on the plan is ${k} feet, so ${w} inches is ${w} ${TIMES} ${k} = ${answer} feet.`,
    };
  }
  const unit = randInt(rng, 2, kmax);
  const n1 = randInt(rng, 2, wmax);
  let n2 = randInt(rng, 2, wmax);
  while (n2 === n1) n2 = randInt(rng, 2, wmax);
  const items = pick(rng, WEIGHT_ITEMS);
  const given = n1 * unit;
  const answer = n2 * unit;
  return {
    kind: "measure", id: `${skillId}:cut:weigh:${items}:${n1}-${n2}@${unit}`, skillId,
    prompt: `${n1} ${items} weigh ${given} pounds. How many pounds do ${n2} ${items} weigh?`,
    mode: "cut", unit: "pounds", quantity: "weight", answer: String(answer), step: "1", maxLength: rulerFor(answer),
    bridge: `${given} ${DIVIDE} ${n1} ${TIMES} ${n2} = ${answer}`,
    explain: `One weighs ${given} ${DIVIDE} ${n1} = ${unit} pounds, so ${n2} weigh ${unit} ${TIMES} ${n2} = ${answer}.`,
  };
};

// ---- circle-measure -------------------------------------------------------------------------

const circleMeasure: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const r = randInt(rng, 2, CIRCLE_RADIUS_MAX[L]);
  const area = L === 0 ? true : rng() < 0.5; // level 0 asks for the area only, as the choice ladder does
  const byDiameter = rng() < 0.5;
  const hundredths = area ? 314 * r * r : 628 * r; // 3.14 * r * r, 2 * 3.14 * r: exact in integers
  const answer = decString(hundredths, 2);
  const pi = "Use 3.14 for pi.";
  const prompt = area
    ? `The well-digger paves a round yard ${byDiameter ? `${2 * r} feet across` : `with a radius of ${r} feet`}. How many square feet of paving? ${pi}`
    : byDiameter
      ? `The well is ${2 * r} feet across. How far is it round the outside? ${pi}`
      : `A stone ring runs round the well. Its radius is ${r} feet. How far is it round the outside? ${pi}`;
  const working = area ? `3.14 ${TIMES} ${r} ${TIMES} ${r}` : byDiameter ? `3.14 ${TIMES} ${2 * r}` : `2 ${TIMES} 3.14 ${TIMES} ${r}`;
  return {
    kind: "measure", id: `${skillId}:cut:${area ? "a" : "c"}${byDiameter ? "d" : "r"}${r}`, skillId,
    prompt, mode: "cut", unit: area ? "square feet" : "feet", quantity: area ? "area" : "length",
    answer, tolerance: "0.01", step: "0.01", maxLength: rulerFor(hundredths / 100),
    bridge: `${working} = ${answer}`,
    explain: area
      ? `Area is 3.14 ${TIMES} radius ${TIMES} radius${byDiameter ? ` (half of ${2 * r} is ${r})` : ""}: ${working} = ${answer}.`
      : `Round the outside is ${byDiameter ? "3.14 times the width" : "2 times 3.14 times the radius"}: ${working} = ${answer}.`,
  };
};

// ---- pythagorean ----------------------------------------------------------------------------

type Triple = readonly [number, number, number];
const TRIPLE_POOLS = new Map<number, Triple[]>();
/** The ladder's triples and their multiples within the level's hypotenuse, each right triangle once. */
function triplePool(L: number): Triple[] {
  let pool = TRIPLE_POOLS.get(L);
  if (!pool) {
    const seen = new Set<string>();
    pool = [];
    for (const [a, b, c] of PYTHAGOREAN_TRIPLES) {
      for (let s = 1; s <= TRIPLE_SCALE_MAX[L]; s++) {
        if (c * s > TRIPLE_HYP_MAX[L] || seen.has(`${a * s},${b * s}`)) continue;
        seen.add(`${a * s},${b * s}`);
        pool.push([a * s, b * s, c * s]);
      }
    }
    TRIPLE_POOLS.set(L, pool);
  }
  return pool;
}
/** Finding a leg joins at this level; before it, every task asks for the brace. */
const LEG_FROM = 2;

const pythagorean: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const [p, q, c] = pick(rng, triplePool(L));
  const flip = rng() < 0.5;
  const a = flip ? q : p;
  const b = flip ? p : q;
  if (L >= LEG_FROM && rng() < 0.5) {
    return {
      kind: "measure", id: `${skillId}:cut:leg:${c}-${a}`, skillId,
      prompt: `${capitalAOrAn(String(c))} ${c}-foot brace spans the corner of a wall frame ${a} feet wide. How tall is the frame?`,
      mode: "cut", unit: "feet", quantity: "length", answer: String(b), step: "1", maxLength: String(c),
      bridge: `√(${c}² ${MINUS} ${a}²) = ${b}`,
      explain: `The brace is the long side: ${c}² ${MINUS} ${a}² = ${c * c - a * a}, and the square root of ${c * c - a * a} is ${b}.`,
    };
  }
  return {
    kind: "measure", id: `${skillId}:cut:brace:${a}x${b}`, skillId,
    prompt: `A brace runs corner to corner across a wall frame ${a} feet by ${b} feet. How long is the brace?`,
    mode: "cut", unit: "feet", quantity: "length", answer: String(c), step: "1", maxLength: String(a + b),
    bridge: `√(${a}² + ${b}²) = ${c}`,
    explain: `${a}² + ${b}² = ${a * a + b * b}, and the square root of ${a * a + b * b} is ${c}.`,
  };
};

// ---- linear-eq ------------------------------------------------------------------------------

const CUT_THINGS = ["rope", "beam", "plank", "cord"];
/** Largest shorter piece, per level. */
const SHORT_MAX = [8, 10, 12, 14, 16];
const TIMES_FROM = 2;
const THREE_FROM = 3;
const HALVES_FROM = 3;

const linearEq: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const thing = pick(rng, CUT_THINGS);
  const cmax = LINEAR_CONST_MAX[L];
  const roll = rng();
  const family = L >= THREE_FROM ? (roll < 0.4 ? "diff" : roll < 0.7 ? "times" : "three")
    : L >= TIMES_FROM ? (roll < 0.5 ? "diff" : "times") : "diff";
  // A half-foot step for every task of the rungs that have half-foot answers, so the step never says which.
  const base = { kind: "measure" as const, skillId, mode: "cut" as const, unit: "feet", quantity: "length" as const, step: L >= HALVES_FROM ? "0.5" : "1" };

  if (family === "times") {
    const k = randInt(rng, 2, LINEAR_COEF_MAX[L] - 2);
    const x = randInt(rng, 2, 10);
    const total = (k + 1) * x;
    return {
      ...base, id: `${skillId}:cut:times:${total}-${k}:${thing}`,
      prompt: `${capitalAOrAn(String(total))} ${total}-foot ${thing} is cut in two; the longer piece is ${k} times as long as the shorter. How long is the shorter piece?`,
      answer: String(x), maxLength: String(total),
      bridge: `x + ${k}x = ${total}, x = ${x}`,
      explain: `Call the shorter piece x. The longer is ${k}x, so x + ${k}x = ${k + 1}x = ${total}, and x = ${total} ${DIVIDE} ${k + 1} = ${x}.`,
    };
  }
  if (family === "three") {
    const a = randInt(rng, 1, cmax);
    let b = randInt(rng, 1, cmax);
    while (b === a) b = randInt(rng, 1, cmax);
    const x = randInt(rng, 2, SHORT_MAX[L]);
    const total = 3 * x + a + b;
    return {
      ...base, id: `${skillId}:cut:three:${total}-${a}-${b}:${thing}`,
      prompt: `${capitalAOrAn(String(total))} ${total}-foot ${thing} is cut into three pieces. The second is ${feet(a)} longer than the first, the third ${feet(b)} longer. How long is the first piece?`,
      answer: String(x), maxLength: String(total),
      bridge: `x + (x + ${a}) + (x + ${b}) = ${total}, x = ${x}`,
      explain: `Call the first piece x: x + (x + ${a}) + (x + ${b}) = 3x + ${a + b} = ${total}, so 3x = ${total - a - b} and x = ${x}.`,
    };
  }
  const d = randInt(rng, 1, cmax);
  const half = L >= HALVES_FROM && rng() < 0.3;
  const twice = 2 * randInt(rng, 2, SHORT_MAX[L]) + (half ? 1 : 0); // twice the shorter piece
  const total = twice + d;
  const x = halfString(twice);
  return {
    ...base, id: `${skillId}:cut:diff:${total}-${d}:${thing}`,
    prompt: `${capitalAOrAn(String(total))} ${total}-foot ${thing} is cut into two pieces; one is ${feet(d)} longer than the other. How long is the shorter piece?`,
    answer: x, maxLength: String(total),
    bridge: `x + (x + ${d}) = ${total}, x = ${x}`,
    explain: `Call the shorter piece x: x + (x + ${d}) = 2x + ${d} = ${total}, so 2x = ${twice} and x = ${x}.`,
  };
};

export const G68_BENCH: Record<string, BenchGenerator> = {
  "ratio-rate": ratioRate, "percent-of": percentOf,
  proportion, "circle-measure": circleMeasure,
  pythagorean, "linear-eq": linearEq,
};
