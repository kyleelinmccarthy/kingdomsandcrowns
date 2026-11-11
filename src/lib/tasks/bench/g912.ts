/**
 * The grade 9-12 bench (R-C3): `one-step-eq`, `systems-eq`, `similar-tri`, `trig-ratios`,
 * `quad-formula`, `poly-ops`, `sequences` and `unit-circle`. Every one is a cut: a length or a count
 * typed or stepped to.
 *
 * - one-step-eq: a rope, beam or plank with one unknown length and one operation (a splice added,
 *   a trim taken off, equal planks, equal parts), written as "x + 7 = 19" beside the story.
 * - systems-eq: two plank sizes filling spans ("3 long planks and 2 short ones make 26 feet ...").
 * - similar-tri: a tower's height from its shadow, against a post of known height and shadow.
 * - trig-ratios: a rafter, ramp or ladder whose angle's sin, cos or tan is stated in the prompt to two
 *   places, so the answer is an exact decimal from the stated value (tolerance a hundredth).
 * - quad-formula: a square yard of flagstones, or a floor d feet longer than wide, whose side is a root.
 * - poly-ops: a frame's or chest's area or volume as a polynomial, evaluated at a given x.
 * - sequences: stones stacked in rows, arithmetic (more or fewer each row) then geometric.
 * - unit-circle: the arc a wheel turns through, with pi given as 3.14.
 *
 * Sizes ride the range tables the choice generators use for the same skills (`SYSTEM_*`, `SIMILAR_*`,
 * `TRIG_HYP_MAX`, `QUAD_ROOT_HIGH`, `POLY_SPAN`, `SEQ_*`, `UNIT_CIRCLE_REACH`, and the one-step kinds per
 * level), so a level means the same difficulty either way. Every answer is a whole number, a half, or a
 * decimal exact in hundredths (built from integers, never a float that is graded).
 *
 * Every answer is at least two steps (RC-i), so the stepper never hands it over in one press, and a level
 * that has half-foot answers uses a half-foot step for every task, so the step never says which.
 */
import { gcd, ONE_STEP_KINDS, randInt } from "@/lib/utils/drill-generators";
import {
  POLY_SPAN, QUAD_ROOT_HIGH, SEQ_DIFF_MAX, SEQ_RATIO_MAX, SEQ_START_MAX, SEQ_TERM_MAX, SEQ_TERM_VALUE_MAX,
  SIMILAR_SCALE_MAX, SIMILAR_SIDE_MAX, SYSTEM_COEF_MAX, SYSTEM_SOLUTION_MAX, TRIG_HYP_MAX, UNIT_CIRCLE_REACH,
} from "@/lib/utils/generators/high";
import { aOrAn, capitalAOrAn } from "./copy";
import { decString } from "./g35";
import { halfString, rulerFor } from "./g68";
import type { BenchGenerator } from "./index";

const level4 = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));
const MINUS = "−";
const TIMES = "×";
const DIVIDE = "÷";
const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[randInt(rng, 0, xs.length - 1)];
const feet = (n: number) => (n === 1 ? "1 foot" : `${n} feet`);
const stones = (n: number) => (n === 1 ? "1 stone" : `${n} stones`);
const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).replace(/\d/g, (c) => SUPERSCRIPTS[Number(c)]);
/** A coefficient with its letter, the 1 left unwritten: "3x", "y". */
const coefTerm = (k: number, letter: string) => `${k === 1 ? "" : k}${letter}`;

const THINGS = ["rope", "beam", "plank", "cord"];
/** A half-foot step on the rungs that have half-foot answers; whole feet before. */
const HALVES_FROM = 3;
const stepFor = (L: number) => (L >= HALVES_FROM ? "0.5" : "1");

// ---- one-step-eq ----------------------------------------------------------------------------

/** The largest unknown (and the largest number added or taken off), per level; the choice ladder's span. */
const ONE_STEP_SPAN = [10, 10, 10, 20, 20];
/** Equal planks or parts are believable only so long. */
const EQUAL_X_MAX = 12;

const oneStepEq: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const kind = pick(rng, ONE_STEP_KINDS[L]);
  const span = ONE_STEP_SPAN[L];
  const thing = pick(rng, THINGS);
  const base = { kind: "measure" as const, skillId, mode: "cut" as const, unit: "feet", step: stepFor(L) };

  if (kind === "add") {
    const x = randInt(rng, 2, span);
    const a = randInt(rng, 1, span);
    const total = x + a;
    return {
      ...base, id: `${skillId}:cut:add:${thing}:${a}-${total}`,
      prompt: `The carpenter splices ${feet(a)} onto a ${thing}, and it reaches ${total} feet: x + ${a} = ${total}. How long was the ${thing}?`,
      answer: String(x), maxLength: rulerFor(x),
      bridge: `${total} ${MINUS} ${a} = ${x}`,
      explain: `Undo the splice: take ${a} from both sides, x = ${total} ${MINUS} ${a} = ${x}.`,
    };
  }
  if (kind === "sub") {
    const x = randInt(rng, 3, span);
    const a = randInt(rng, 1, x - 2);
    const b = x - a;
    return {
      ...base, id: `${skillId}:cut:sub:${thing}:${a}-${b}`,
      prompt: `The carpenter trims ${feet(a)} off a ${thing}, leaving ${feet(b)}: x ${MINUS} ${a} = ${b}. How long was the ${thing} before?`,
      answer: String(x), maxLength: rulerFor(x),
      bridge: `${b} + ${a} = ${x}`,
      explain: `Undo the trim: add ${a} to both sides, x = ${b} + ${a} = ${x}.`,
    };
  }
  if (kind === "mul") {
    // From level 3 two planks may make an odd total, so the plank is a half-foot length.
    const half = L >= HALVES_FROM && rng() < 0.3;
    const a = half ? 2 : randInt(rng, 2, 9);
    const px = randInt(rng, 2, Math.min(span, EQUAL_X_MAX));
    const total = half ? 2 * randInt(rng, 2, 6) + 1 : a * px;
    const x = half ? halfString(total) : String(px);
    return {
      ...base, id: `${skillId}:cut:mul:${a}-${total}`,
      prompt: `${a} equal planks laid end to end make ${total} feet: ${a}x = ${total}. How long is one plank?`,
      answer: x, maxLength: rulerFor(Number(x)),
      bridge: `${total} ${DIVIDE} ${a} = ${x}`,
      explain: `Share it out: divide both sides by ${a}, x = ${total} ${DIVIDE} ${a} = ${x}.`,
    };
  }
  // div: a beam cut into `a` equal parts of `q` feet, so the beam was a * q.
  const a = randInt(rng, 2, 9);
  const q = randInt(rng, 2, EQUAL_X_MAX);
  const x = a * q;
  return {
    ...base, id: `${skillId}:cut:div:${thing}:${a}-${q}`,
    prompt: `A ${thing} is cut into ${a} equal parts of ${q} feet each: x ${DIVIDE} ${a} = ${q}. How long was the ${thing}?`,
    answer: String(x), maxLength: rulerFor(x),
    bridge: `${a} ${TIMES} ${q} = ${x}`,
    explain: `Undo the cutting: multiply both sides by ${a}, x = ${a} ${TIMES} ${q} = ${x}.`,
  };
};

// ---- systems-eq -----------------------------------------------------------------------------

/** Sums and differences (one long plank and one short, then how much longer) below this level; mixes from it. */
const MIXES_FROM = 2;

const systemsEq: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const smax = SYSTEM_SOLUTION_MAX[L];
  const short = randInt(rng, 2, smax - 1);
  const long = randInt(rng, short + 1, smax);
  const askLong = L === 0 ? true : rng() < 0.5; // level 0 asks for the long plank only, as the ladder asks x first
  const whom = askLong ? "long" : "short";
  const answer = askLong ? long : short;
  const base = {
    kind: "measure" as const, skillId, mode: "cut" as const, unit: "feet", step: "1",
    answer: String(answer), maxLength: rulerFor(answer),
  };

  if (L < MIXES_FROM) {
    const sum = long + short;
    const d = long - short;
    return {
      ...base, id: `${skillId}:cut:sd:${sum}-${d}:${whom}`,
      prompt: `A long plank and a short plank end to end make ${sum} feet. The long one is ${feet(d)} longer. How long is the ${whom} plank?`,
      bridge: `x + y = ${sum}, x ${MINUS} y = ${d}, so ${askLong ? "x" : "y"} = ${answer}`,
      explain: `Add the two lines: 2x = ${sum + d}, so x = ${long}; then y = ${sum} ${MINUS} ${long} = ${short}.`,
    };
  }
  const cmax = SYSTEM_COEF_MAX[L];
  let a = 1, b = 1, c = 1, d = 1;
  do {
    a = randInt(rng, 1, cmax);
    b = randInt(rng, 1, cmax);
    c = randInt(rng, 1, cmax);
    d = randInt(rng, 1, cmax);
  } while (a * d - b * c === 0); // parallel mixes: no single answer
  const t1 = a * long + b * short;
  const t2 = c * long + d * short;
  const planks = (n: number, size: string, noun: string) => `${n} ${size} ${n === 1 ? noun : `${noun}s`}`;
  return {
    ...base, id: `${skillId}:cut:mix:${a}${b}-${c}${d}:${t1}-${t2}:${whom}`,
    prompt: `${planks(a, "long", "plank")} and ${b} short ${b === 1 ? "one" : "ones"} make ${t1} feet; ${c} long and ${d} short make ${t2} feet. How long is a ${whom} plank?`,
    bridge: `${coefTerm(a, "x")} + ${coefTerm(b, "y")} = ${t1}, ${coefTerm(c, "x")} + ${coefTerm(d, "y")} = ${t2}, so ${askLong ? "x" : "y"} = ${answer}`,
    explain: `Call a long plank x and a short one y. Match the lines up and take one from the other until one letter is left: x = ${long}, y = ${short}.`,
  };
};

// ---- similar-tri ----------------------------------------------------------------------------

const POSTS = ["post", "pole", "staff", "stake"];
const TOWERS = ["tower", "keep", "steeple", "mill"];

const similarTri: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  let h = 0, s = 0, shadow = 0, answer = 0;
  for (let attempt = 0; ; attempt++) {
    if (attempt > 400) throw new Error(`could not draw a post and a tower at level ${level}`);
    h = randInt(rng, 2, SIMILAR_SIDE_MAX[L]);
    s = randInt(rng, 2, SIMILAR_SIDE_MAX[L]);
    const g = gcd(h, s);
    const m = randInt(rng, 2, SIMILAR_SCALE_MAX[L]);
    shadow = (s / g) * m;
    answer = (h / g) * m;
    if (h !== s && answer > h) break; // the tower stands taller than the post
  }
  const post = pick(rng, POSTS);
  const tower = pick(rng, TOWERS);
  return {
    kind: "measure", id: `${skillId}:cut:${post}-${tower}:${h}-${s}-${shadow}`, skillId,
    prompt: `${capitalAOrAn(String(h))} ${h}-foot ${post} casts ${aOrAn(String(s))} ${s}-foot shadow. The ${tower}'s shadow is ${shadow} feet long. How tall is the ${tower}?`,
    mode: "cut", unit: "feet", answer: String(answer), step: "1", maxLength: rulerFor(answer),
    bridge: `${h} ${DIVIDE} ${s} ${TIMES} ${shadow} = ${answer}`,
    explain: `Same sun, same shape: the ${post} is ${h} ${DIVIDE} ${s} as tall as its shadow, so the ${tower} is ${h} ${DIVIDE} ${s} ${TIMES} ${shadow} = ${answer}.`,
  };
};

// ---- trig-ratios ----------------------------------------------------------------------------

/** [sin, cos, tan] of each angle in whole degrees, in hundredths (rounded to two places). */
export const TRIG_TABLE: Record<number, readonly [number, number, number]> = {
  10: [17, 98, 18], 15: [26, 97, 27], 20: [34, 94, 36], 25: [42, 91, 47], 30: [50, 87, 58], 35: [57, 82, 70],
  40: [64, 77, 84], 50: [77, 64, 119], 55: [82, 57, 143], 60: [87, 50, 173], 65: [91, 42, 214], 70: [94, 34, 275],
  75: [97, 26, 373],
};
const TRIG_ANGLES: readonly (readonly number[])[] = [
  [30, 40, 50, 60],
  [20, 25, 30, 35, 40, 50, 55, 60, 65, 70],
  [20, 25, 30, 35, 40, 50, 55, 60, 65, 70],
  [10, 15, 20, 25, 30, 35, 40, 50, 55, 60, 65, 70, 75],
  [10, 15, 20, 25, 30, 35, 40, 50, 55, 60, 65, 70, 75],
];
/** Which ratios each level may ask, as the choice ladder does. */
const TRIG_RATIOS: readonly (readonly ("sin" | "cos" | "tan")[])[] = [
  ["sin"], ["sin", "cos"], ["sin", "cos"], ["sin", "cos", "tan"], ["sin", "cos", "tan"],
];
/** A village's rafter or ramp is no longer than this, and no ladder or ramp rises higher (feet). */
const LENGTH_MAX = 40;
/** A ramp's or ladder's run: a believable length for the tangent reading. */
const RUN_MAX = 30;
const STEEP_FROM = 50;

const trigRatios: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const ratio = pick(rng, TRIG_RATIOS[L]);
  const deg = pick(rng, TRIG_ANGLES[L]);
  const hundredths = TRIG_TABLE[deg][ratio === "sin" ? 0 : ratio === "cos" ? 1 : 2];
  // The rise (tan) stays within LENGTH_MAX, so a steep angle takes a short run: 75 degrees is at most 10 feet.
  const longest = ratio === "tan" ? Math.min(RUN_MAX, TRIG_HYP_MAX[L], Math.floor((LENGTH_MAX * 100) / hundredths))
    : Math.min(LENGTH_MAX, TRIG_HYP_MAX[L]);
  const length = randInt(rng, 4, longest);
  const value = decString(hundredths, 2);
  const stated = `${ratio} ${deg}° ${value === "0.5" ? "=" : "≈"} ${value}`;
  const answer = decString(length * hundredths, 2);
  const lead = ratio === "sin" ? `The rafter is ${length} feet long and rises at ${deg}°`
    : ratio === "cos" ? `The ramp is ${length} feet long and rises at ${deg}°`
      : deg >= STEEP_FROM ? `The ladder's foot is ${length} feet from the wall, and it leans at ${deg}°`
        : `The ramp's run is ${length} feet along the ground, and it rises at ${deg}°`;
  const ask = ratio === "sin" ? "How high does it rise?" : ratio === "cos" ? "How far does it reach along the ground?" : "How high does it reach?";
  return {
    kind: "measure", id: `${skillId}:cut:${ratio}${deg}:${length}`, skillId,
    prompt: `${lead} (${stated}). ${ask}`,
    mode: "cut", unit: "feet", answer, tolerance: "0.01", step: "0.01", maxLength: rulerFor(Number(answer)),
    bridge: `${length} ${TIMES} ${value} = ${answer}`,
    explain: ratio === "tan"
      ? `Tangent is up over along: the rise is the run times tan ${deg}°, ${length} ${TIMES} ${value} = ${answer}.`
      : `${ratio === "sin" ? "Sine is up over slope" : "Cosine is along over slope"}: the answer is the slope times ${ratio} ${deg}°, ${length} ${TIMES} ${value} = ${answer}.`,
  };
};

// ---- quad-formula ---------------------------------------------------------------------------

/** The biggest side of a square yard, per level; level 0 is squares only. */
const SQUARE_SIDE_MAX = [10, 12, 12, 15, 15];
/** A rectangle joins at level 1 (half the draws), and takes over from level 2. */
const RECT_SHARE = [0, 0.5, 1, 1, 1];

const quadFormula: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const step = stepFor(L);
  if (rng() >= RECT_SHARE[L]) {
    const side = randInt(rng, 3, SQUARE_SIDE_MAX[L]);
    const area = side * side;
    return {
      kind: "measure", id: `${skillId}:cut:sq:${area}`, skillId,
      prompt: `A square yard is paved with ${area} flagstones, one to each square foot. How long is one side?`,
      mode: "cut", unit: "feet", answer: String(side), step, maxLength: rulerFor(side),
      bridge: `x ${TIMES} x = ${area}, so x = ${side}`,
      explain: `A square's area is its side times itself: x ${TIMES} x = ${area}, and the positive root of x² = ${area} is ${side}.`,
    };
  }
  const half = L >= HALVES_FROM && rng() < 0.35;
  const d = randInt(rng, 1, QUAD_ROOT_HIGH[L]);
  // twice the width: a half-foot width has an odd twice. The area is t * (t + 2d) / 4, in exact hundredths below.
  const twice = half ? 2 * randInt(rng, 2, QUAD_ROOT_HIGH[L] + 1) + 1 : 2 * randInt(rng, 2, QUAD_ROOT_HIGH[L] + 2);
  const x = halfString(twice);
  const area = decString(25 * twice * (twice + 2 * d), 2);
  return {
    kind: "measure", id: `${skillId}:cut:rect:${d}-${area}`, skillId,
    prompt: `A floor covers ${area} square feet and is ${feet(d)} longer than it is wide. How wide is it?`,
    mode: "cut", unit: "feet", answer: x, step, maxLength: rulerFor(twice / 2),
    bridge: `x ${TIMES} (x + ${d}) = ${area}, so x = ${x}`,
    explain: `Call the width x, so the length is x + ${d}: x(x + ${d}) = ${area}. Only a positive width makes a floor, and that root is ${x}.`,
  };
};

// ---- poly-ops -------------------------------------------------------------------------------

/** Subtraction inside a factor joins at this level; expanded floors (EXPANDED_SHARE) at level 3; chests at CHEST_FROM. */
const MINUS_FROM = 1;
const CHEST_FROM = 4;
const CHEST_SPAN = 4;
const EXPANDED_SHARE = [0, 0, 0, 0.6, 0.4];
const CHEST_SHARE = 0.3;

/** A factor x + p or x - p that stays at least 1 at this x. */
const factor = (rng: () => number, L: number, x: number, span: number): number => {
  const minus = L >= MINUS_FROM && rng() < 0.4;
  return minus ? -randInt(rng, 1, Math.min(span, x - 1)) : randInt(rng, 1, span);
};
const factorText = (p: number) => `x ${p < 0 ? MINUS : "+"} ${Math.abs(p)}`;

const polyOps: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  for (let attempt = 0; ; attempt++) {
    if (attempt > 400) throw new Error(`could not draw a polynomial at level ${level}`);
    const x = randInt(rng, 3, 8);
    const roll = rng();
    if (roll < EXPANDED_SHARE[L]) {
      const span = POLY_SPAN[L];
      const P = factor(rng, L, x, span);
      const Q = factor(rng, L, x, span);
      const b = P + Q;
      const c = P * Q;
      const value = x * x + b * x + c;
      if (b === 0 || value < 4) continue;
      const bText = Math.abs(b) === 1 ? "x" : `${Math.abs(b)}x`;
      const bWork = Math.abs(b) === 1 ? String(x) : `${Math.abs(b)} ${TIMES} ${x}`;
      return {
        kind: "measure", id: `${skillId}:cut:exp:${b}-${c}@${x}`, skillId,
        prompt: `The mason's floor covers x² ${b < 0 ? MINUS : "+"} ${bText} ${c < 0 ? MINUS : "+"} ${Math.abs(c)} square feet. If x = ${x}, how many square feet is that?`,
        mode: "cut", unit: "square feet", answer: String(value), step: "1", maxLength: rulerFor(value),
        bridge: `${x}² ${b < 0 ? MINUS : "+"} ${bWork} ${c < 0 ? MINUS : "+"} ${Math.abs(c)} = ${value}`,
        explain: `Put ${x} in for x: ${x}² is ${x * x}, the middle term is ${b * x}, and the last is ${c}, so ${value}.`,
      };
    }
    const chest = L >= CHEST_FROM && rng() < CHEST_SHARE / (1 - EXPANDED_SHARE[L]);
    const span = chest ? CHEST_SPAN : POLY_SPAN[L];
    const ps = chest ? [factor(rng, L, x, span), factor(rng, L, x, span), factor(rng, L, x, span)] : [factor(rng, L, x, span), factor(rng, L, x, span)];
    const values = ps.map((p) => x + p);
    const value = values.reduce((acc, v) => acc * v, 1);
    if (value < 4) continue;
    const written = ps.map((p) => `(${factorText(p)})`).join("");
    return {
      kind: "measure", id: `${skillId}:cut:fac:${ps.map((p) => (p < 0 ? p : `+${p}`)).join("")}@${x}`, skillId,
      prompt: chest
        ? `The joiner's chest holds ${written} cubic feet. If x = ${x}, how many cubic feet is that?`
        : `The mason's frame covers ${written} square feet. If x = ${x}, how many square feet is that?`,
      mode: "cut", unit: chest ? "cubic feet" : "square feet", answer: String(value), step: "1", maxLength: rulerFor(value),
      bridge: `${ps.map((p) => `(${x} ${p < 0 ? MINUS : "+"} ${Math.abs(p)})`).join(` ${TIMES} `)} = ${value}`,
      explain: `Put ${x} in for x in each bracket, ${values.join(` ${TIMES} `)}, then multiply: ${value}.`,
    };
  }
};

// ---- sequences ------------------------------------------------------------------------------

/** The share of level-2 rows that count down ("each row after has d fewer"). */
const DOWN_SHARE = 0.5;
/** The share of level-4 rows that halve. */
const HALF_SHARE = 0.3;
const CAIRN = "Row 1 of the cairn has";

const sequences: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const base = { kind: "measure" as const, skillId, mode: "cut" as const, unit: "stones", step: "1" };

  if (L < 3) {
    const n = randInt(rng, 5, SEQ_TERM_MAX[L]);
    const d = randInt(rng, 2, SEQ_DIFF_MAX[L]);
    if (L === 2 && rng() < DOWN_SHARE) {
      const end = randInt(rng, 2, 12);
      const a = end + (n - 1) * d;
      return {
        ...base, id: `${skillId}:cut:down:${a}-${d}@${n}`,
        prompt: `${CAIRN} ${stones(a)}, and each row after has ${d} fewer. How many stones are in row ${n}?`,
        answer: String(end), maxLength: rulerFor(a),
        bridge: `${a} ${MINUS} ${n - 1} ${TIMES} ${d} = ${end}`,
        explain: `Each of the ${n - 1} rows after the first takes off ${d}: ${a} ${MINUS} ${n - 1} ${TIMES} ${d} = ${end}.`,
      };
    }
    const a = randInt(rng, 1, SEQ_START_MAX[L]);
    const answer = a + (n - 1) * d;
    return {
      ...base, id: `${skillId}:cut:arith:${a}+${d}@${n}`,
      prompt: `${CAIRN} ${stones(a)}, and each row after has ${d} more. How many stones are in row ${n}?`,
      answer: String(answer), maxLength: rulerFor(answer),
      bridge: `${a} + ${n - 1} ${TIMES} ${d} = ${answer}`,
      explain: `Each of the ${n - 1} rows after the first adds ${d}: ${a} + ${n - 1} ${TIMES} ${d} = ${answer}.`,
    };
  }
  if (L >= 4 && rng() < HALF_SHARE) {
    const n = randInt(rng, 3, 5);
    const end = randInt(rng, 2, 9);
    const a = end * 2 ** (n - 1);
    return {
      ...base, id: `${skillId}:cut:half:${a}@${n}`,
      prompt: `${CAIRN} ${stones(a)}, and each row after has half as many as the one before. How many stones are in row ${n}?`,
      answer: String(end), maxLength: rulerFor(a),
      bridge: `${a} ${DIVIDE} 2${sup(n - 1)} = ${end}`,
      explain: `Row ${n} has been halved ${n - 1} times: ${a} ${DIVIDE} 2${sup(n - 1)} = ${end}.`,
    };
  }
  for (let attempt = 0; ; attempt++) {
    if (attempt > 400) throw new Error(`could not draw a geometric row at level ${level}`);
    const n = randInt(rng, 5, SEQ_TERM_MAX[L]);
    const a = randInt(rng, 2, SEQ_START_MAX[L]);
    const r = randInt(rng, 2, SEQ_RATIO_MAX);
    const answer = a * r ** (n - 1);
    if (answer > SEQ_TERM_VALUE_MAX) continue;
    return {
      ...base, id: `${skillId}:cut:geo:${a}x${r}@${n}`,
      prompt: `${CAIRN} ${stones(a)}, and each row after has ${r} times as many as the one before. How many stones are in row ${n}?`,
      answer: String(answer), maxLength: rulerFor(answer),
      bridge: `${a} ${TIMES} ${r}${sup(n - 1)} = ${answer}`,
      explain: `Row ${n} has been multiplied by ${r} ${n - 1} times: ${a} ${TIMES} ${r}${sup(n - 1)} = ${answer}.`,
    };
  }
};

// ---- unit-circle ----------------------------------------------------------------------------

/** The special angles round the circle, in the choice generator's order; the first `REACH - 1` of them (0 is not asked). */
const CIRCLE_DEGREES = [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const RADIANS_FROM = 3;
const WHEEL_RADIUS_MAX = 12;
const CART_RADIUS_MAX = 4;

const unitCircle: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const deg = pick(rng, CIRCLE_DEGREES.slice(0, UNIT_CIRCLE_REACH[L] - 1));
  const g = gcd(deg, 180);
  const [p, q] = [deg / g, 180 / g]; // the angle is p/q of pi
  const radians = L >= RADIANS_FROM && rng() < 0.5;
  // A radius that makes r * p / q a whole number of feet, so the answer is exact in hundredths.
  const radii: number[] = [];
  for (let r = q; r <= WHEEL_RADIUS_MAX; r += q) if (r >= 2) radii.push(r);
  const r = pick(rng, radii);
  const k = (r * p) / q;
  const answer = decString(314 * k, 2);
  const cart = r <= CART_RADIUS_MAX;
  const angle = radians ? `${p > 1 ? p : ""}π${q > 1 ? `/${q}` : ""}` : `${deg}°`;
  const working = radians
    ? `${r}${p > 1 ? ` ${TIMES} ${p}` : ""} ${TIMES} 3.14${q > 1 ? ` ${DIVIDE} ${q}` : ""}`
    : `${r} ${TIMES} 3.14 ${TIMES} ${deg} ${DIVIDE} 180`;
  return {
    kind: "measure", id: `${skillId}:cut:${deg}${radians ? "r" : "d"}@${r}`, skillId,
    prompt: `A ${cart ? "cart" : "water"} wheel of radius ${r} feet turns through ${angle}. ${cart ? "How far does it roll?" : "How far does a paddle travel?"} Use 3.14 for π.`,
    mode: "cut", unit: "feet", answer, tolerance: "0.01", step: "0.01", maxLength: rulerFor(k * 3.14),
    bridge: `${working} = ${answer}`,
    explain: `The arc is the radius times the angle in radians (${deg}° is ${p > 1 ? p : ""}π${q > 1 ? `/${q}` : ""}): ${working} = ${answer}.`,
  };
};

export const G912_BENCH: Record<string, BenchGenerator> = {
  "one-step-eq": oneStepEq, "systems-eq": systemsEq,
  "similar-tri": similarTri, "trig-ratios": trigRatios,
  "quad-formula": quadFormula, "poly-ops": polyOps,
  sequences, "unit-circle": unitCircle,
};
