/**
 * The grade 3-5 bench (R-C3): `area-perimeter`, `frac-unit`, `frac-equiv`, `mul-multi`,
 * `frac-addsub` and `dec-ops`.
 *
 * - area-perimeter (cut): the stone round a footing, or the flagstones that pave a floor.
 * - frac-unit (cut): a 1-foot piece cut into n equal parts; one part is 1/n.
 * - frac-equiv (assemble): a reduced fraction built from two pieces whose denominators nest
 *   (1/2 + 1/4 = 3/4), so renaming one piece in the other's parts is the whole task.
 * - mul-multi (cut): `r` rows of `c` stones, with the digit shapes of the choice ladder.
 * - frac-addsub (assemble or cut, drawn): unlike denominators summed (1/3 + 1/6 = 1/2), or a plank
 *   with a piece cut off (7/8 − 1/4 = 5/8).
 * - dec-ops (assemble or cut, drawn): decimal lengths summed (1.25 + 0.5 = 1.75), or taken away.
 *
 * Sizes ride the range tables the choice generators use for the same skills (`RECT_MAX`,
 * `MUL_SHAPES`, `EQUIV_DENOM_MAX`, `ADDSUB_*`, `DEC_*`), so a level means the same difficulty either
 * way. `frac-unit` keeps its own denominators: the choice table repeats one set on alternate rungs,
 * and a cut has one answer per denominator, so each rung here needs five or more of them.
 *
 * Values are stored as reduced "a/b" strings or decimal strings (no float ever holds a length that
 * is graded), and the prompt's flavour is a function of the parameters alone, so one id is always
 * one task. A cut's stepper counts on a finer grid than its answer can be (half the common
 * denominator of the lengths in play, or the level's own decimal place for dec-ops, with at least two steps left), so no answer is ever a single press.
 */
import { gcd, randInt, shuffle } from "@/lib/utils/drill-generators";
import {
  ADDSUB_DENOM_MAX, ADDSUB_IMPROPER, ADDSUB_LIKE, ADDSUB_PAST_ONE, DEC_PLACES, DEC_WHOLE_MAX,
  EQUIV_DENOM_MAX, MUL_SHAPES, RECT_MAX, frac,
} from "@/lib/utils/generators/intermediate";
import type { MeasurePiece, MeasureTask } from "../types";
import type { BenchGenerator } from "./index";

const level4 = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));
const MINUS = "−";
const TIMES = "×";
const DIVIDE = "÷";

// ---- lengths as text ------------------------------------------------------------------------

const numeric = (v: string) => {
  const [n, d] = v.split("/");
  return d === undefined ? Number(n) : Number(n) / Number(d);
};
/** The reduced denominator of a stored fraction string; a whole number has 1. */
const denOf = (v: string) => (v.includes("/") ? Number(v.split("/")[1]) : 1);
const numOf = (v: string) => Number(v.split("/")[0]);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** "1 foot", "3/4 foot", "5/4 feet", "0.5 feet": a part of a foot, or one foot, is singular for a fraction. */
const feetText = (v: string) => {
  const x = numeric(v);
  const singular = v.includes("/") ? x <= 1 : x === 1;
  return `${v} ${singular ? "foot" : "feet"}`;
};

// ---- area-perimeter -------------------------------------------------------------------------

const STONEMASON = "The stonemason";

const areaPerimeter: BenchGenerator = (level, rng, skillId) => {
  const max = RECT_MAX[level4(level)];
  const wantPerimeter = rng() < 0.5;
  const w = randInt(rng, 2, max);
  const d = randInt(rng, 2, max);
  if (wantPerimeter) {
    const answer = 2 * (w + d);
    return {
      kind: "measure", id: `${skillId}:cut:per:${w}x${d}`, skillId,
      prompt: `${STONEMASON} is laying stone round a footing ${w} by ${d} feet. How many feet of stone will it take?`,
      mode: "cut", unit: "feet", quantity: "length", answer: String(answer), step: "1", maxLength: String(5 * max),
      bridge: `${w} + ${d} + ${w} + ${d} = ${answer}`,
      explain: `The footing has sides of ${w}, ${d}, ${w} and ${d}. Walk all the way round: ${w} + ${d} + ${w} + ${d} = ${answer} feet.`,
    };
  }
  const answer = w * d;
  return {
    kind: "measure", id: `${skillId}:cut:area:${w}x${d}`, skillId,
    prompt: `${STONEMASON} is paving a floor ${w} by ${d} feet with flagstones, each 1 foot square. How many flagstones?`,
    mode: "cut", unit: "flagstones", quantity: "area", answer: String(answer), step: "1", maxLength: String(max * (max + 1)),
    bridge: `${w} ${TIMES} ${d} = ${answer}`,
    explain: `${w} rows of ${d} flagstones fill the floor: ${w} ${TIMES} ${d} = ${answer}.`,
  };
};

// ---- frac-unit ------------------------------------------------------------------------------

/** Who cuts what: the part's name is part of the id, so a rung offers more than five distinct tasks. */
const UNIT_THINGS = [
  { who: "The carpenter", thing: "beam" },
  { who: "The joiner", thing: "plank" },
  { who: "The rope-maker", thing: "rope" },
  { who: "The weaver", thing: "ribbon" },
];
/** Grade 3 names halves to eighths (3.NF.1); twelfths join the upper rungs. All divide 24. */
const UNIT_DENOMS = [[2, 3, 4, 6], [2, 3, 4, 6, 8], [3, 4, 6, 8, 12], [4, 6, 8, 12, 3], [6, 8, 12, 4, 3]];
/** Every denominator above divides 24, so the answer sits on this grid but is never one step. */
const UNIT_STEP = "1/24";

const fracUnit: BenchGenerator = (level, rng, skillId) => {
  const pool = UNIT_DENOMS[level4(level)];
  const n = pool[randInt(rng, 0, pool.length - 1)];
  const { who, thing } = UNIT_THINGS[randInt(rng, 0, UNIT_THINGS.length - 1)];
  const answer = `1/${n}`;
  return {
    kind: "measure", id: `${skillId}:cut:${n}:${thing}`, skillId,
    prompt: `${who} has a 1-foot ${thing}. Cut it into ${n} equal parts. How long is each part?`,
    mode: "cut", unit: "feet", quantity: "length", answer, step: UNIT_STEP, maxLength: "1",
    bridge: `1 ${DIVIDE} ${n} = ${answer}`,
    explain: `A foot cut into ${n} equal parts has parts of 1/${n} foot each: 1 ${DIVIDE} ${n} = ${answer}.`,
  };
};

// ---- mul-multi ------------------------------------------------------------------------------

/** A number of `digits` digits with no trailing zero (the product would be a place shift, not a multiplication). */
const digitsNumber = (rng: () => number, digits: number): number => {
  if (digits === 1) return randInt(rng, 2, 9);
  const n = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
  return n % 10 === 0 ? n + randInt(rng, 1, 9) : n;
};

/** 347 is 300 + 40 + 7: the parts of a number by place, zeros left out. */
const placeParts = (n: number): number[] =>
  String(n).split("").map((ch, i, all) => Number(ch) * 10 ** (all.length - 1 - i)).filter((p) => p > 0);

const mulMulti: BenchGenerator = (level, rng, skillId) => {
  const shape = MUL_SHAPES["mul-multi"][level4(level)];
  const c = digitsNumber(rng, shape.a);
  const r = digitsNumber(rng, shape.b);
  const product = r * c;
  // Split the multiplier when it has places of its own, otherwise the long number of stones.
  const [parts, whole] = r >= 10 ? [placeParts(r), c] : [placeParts(c), r];
  const working = parts.map((p) => `${p} ${TIMES} ${whole} = ${p * whole}`);
  return {
    kind: "measure", id: `${skillId}:cut:${r}x${c}`, skillId,
    prompt: `The mason lays ${r} rows of ${c} stones. How many stones is that in all?`,
    mode: "cut", unit: "stones", quantity: "count", answer: String(product), step: "1", maxLength: String(10 ** String(product).length),
    bridge: `${r} ${TIMES} ${c} = ${product}`,
    explain: `Split it by place: ${working.join(", ")}. Add them up: ${r} ${TIMES} ${c} = ${product}.`,
  };
};

// ---- fractions: frac-equiv and frac-addsub --------------------------------------------------

type Relation = "nested" | "unlike";
type Split = { x: string; y: string; mark: string; D: number };
type Cutting = { beam: string; off: string; left: string };

const memo = <T>(cache: Map<string, T>, key: string, build: () => T): T => {
  let v = cache.get(key);
  if (v === undefined) { v = build(); cache.set(key, v); }
  return v;
};

const SPLITS = new Map<string, Split[]>();
/**
 * Every way to build a mark less than one whole (or past it, `pastOne`) from two different pieces
 * in unlike denominators. The pieces are whole numbers of 1/D, so the sum is exact; written in
 * lowest terms they get their own denominators ("2/8" is "1/4"). `nested` keeps one denominator a
 * multiple of the other (1/2 and 1/4), the pure renaming case; a piece past one needs `improper`.
 */
function splits(denMax: number, pastOne: boolean, improper: boolean, relation: Relation): Split[] {
  return memo(SPLITS, `${denMax}|${pastOne}|${improper}|${relation}`, () => {
    const out: Split[] = [];
    for (let D = 4; D <= denMax; D++) {
      for (let N = 3; N <= (pastOne ? 2 * D - 1 : D - 1); N++) {
        if (N % D === 0) continue; // a whole mark
        for (let i = 1; 2 * i < N; i++) {
          const j = N - i; // j > i, so the pair is counted once and the pieces differ
          if (!improper && j >= D) continue;
          const x = frac(i, D), y = frac(j, D);
          const qx = denOf(x), qy = denOf(y);
          if (qx < 2 || qy < 2 || qx === qy) continue;
          if (relation === "nested" && qx % qy !== 0 && qy % qx !== 0) continue;
          out.push({ x, y, mark: frac(N, D), D });
        }
      }
    }
    return out;
  });
}

const DECOYS = new Map<string, string[]>();
/**
 * Fractions that can pad an offer for a mark built on `D`ths: not whole, past one only when improper,
 * and in the same family as the pieces (a denominator that divides 2D), so the pieces that belong
 * cannot be picked out by their denominators alone.
 */
function fractionDecoys(D: number, denMax: number, improper: boolean): string[] {
  return memo(DECOYS, `${D}|${denMax}|${improper}`, () => {
    const seen = new Set<string>();
    for (let q = 2; q <= denMax; q++) {
      if ((2 * D) % q !== 0) continue;
      for (let p = 1; p <= (improper ? q + Math.floor(q / 2) : q - 1); p++) {
        const s = frac(p, q);
        if (denOf(s) >= 2) seen.add(s);
      }
    }
    return [...seen];
  });
}

/** The end of a working line: a full stop, or ", which is 1/3." when the sum still reduces. */
const again = (n: number, d: number, reduced: string) => (`${n}/${d}` === reduced ? "." : `, which is ${reduced}.`);

type Trade = { who: string; thing: string };
const TRADES: Record<string, Trade> = {
  "frac-equiv": { who: "The joiner", thing: "rail" },
  "frac-addsub": { who: "The roofer", thing: "batten" },
  "dec-ops": { who: "The cooper", thing: "strap" },
};

function fractionAssemble(rng: () => number, skillId: string, denMax: number, pastOne: boolean, improper: boolean, relation: Relation): MeasureTask {
  const pool = splits(denMax, pastOne, improper, relation);
  const { x, y, mark, D } = pool[randInt(rng, 0, pool.length - 1)];
  const used = new Set([x, y, mark]);
  const decoys = shuffle(fractionDecoys(D, denMax, improper).filter((v) => !used.has(v)), rng).slice(0, randInt(rng, 2, 3));
  const values = shuffle([x, y, ...decoys], rng);
  const pieces: MeasurePiece[] = values.map((v) => ({ label: feetText(v), value: v }));
  const { who, thing } = TRADES[skillId];
  const L = lcm(denOf(x), denOf(y));
  const a = (numOf(x) * L) / denOf(x), b = (numOf(y) * L) / denOf(y);
  return {
    kind: "measure", id: `${skillId}:asm:${mark}=${values.join(",")}`, skillId,
    prompt: `${who} needs a ${thing} ${feetText(mark)} long. Pick the pieces that make it.`,
    mode: "assemble", unit: "feet", pieces, target: { label: feetText(mark), value: mark },
    solution: [values.indexOf(x), values.indexOf(y)].sort((p, q) => p - q),
    bridge: `${x} + ${y} = ${mark}`,
    explain: `${feetText(x)} and ${feetText(y)} make ${feetText(mark)}. Rename them in ${L}ths: ${a}/${L} + ${b}/${L} = ${a + b}/${L}${again(a + b, L, mark)}`,
  };
}

const CUTTINGS = new Map<string, Cutting[]>();
/**
 * Every plank with a piece cut off whose leftover is a fraction. `like` keeps the beam's and the cut's
 * denominators equal (7/8 − 3/8); otherwise they differ (7/8 − 1/4). A beam past one is improper.
 */
function cuttings(denMax: number, improper: boolean, like: boolean): Cutting[] {
  return memo(CUTTINGS, `${denMax}|${improper}|${like}`, () => {
    const out: Cutting[] = [];
    for (let D = 3; D <= denMax; D++) {
      for (let N = 2; N <= (improper ? 2 * D - 1 : D - 1); N++) {
        if (N % D === 0) continue;
        for (let i = 1; i < N; i++) {
          const beam = frac(N, D), off = frac(i, D), left = frac(N - i, D);
          if (denOf(beam) < 2 || denOf(off) < 2 || denOf(left) < 2) continue;
          if ((denOf(beam) === denOf(off)) !== like) continue;
          out.push({ beam, off, left });
        }
      }
    }
    return out;
  });
}

function fractionCut(rng: () => number, skillId: string, denMax: number, improper: boolean, like: boolean): MeasureTask {
  const pool = cuttings(denMax, improper, like);
  const { beam, off, left } = pool[randInt(rng, 0, pool.length - 1)];
  const { who, thing } = TRADES[skillId];
  const L = lcm(denOf(beam), denOf(off));
  const a = (numOf(beam) * L) / denOf(beam), b = (numOf(off) * L) / denOf(off);
  return {
    kind: "measure", id: `${skillId}:cut:${beam}-${off}`, skillId,
    prompt: `${who} has a ${thing} ${feetText(beam)} long. Cut off ${feetText(off)}. How long is the piece that's left?`,
    mode: "cut", unit: "feet", quantity: "length", answer: left, step: `1/${2 * L}`, maxLength: beam,
    bridge: `${beam} ${MINUS} ${off} = ${left}`,
    explain: `Take ${off} from ${beam}. With matching parts that is ${a}/${L} ${MINUS} ${b}/${L} = ${a - b}/${L}${again(a - b, L, left)}`,
  };
}

const fracEquiv: BenchGenerator = (level, rng, skillId) =>
  fractionAssemble(rng, skillId, EQUIV_DENOM_MAX[level4(level)], false, false, "nested");

const fracAddsub: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const denMax = ADDSUB_DENOM_MAX[L];
  return rng() < 0.5
    ? fractionAssemble(rng, skillId, denMax, ADDSUB_PAST_ONE[L], ADDSUB_IMPROPER[L], "unlike")
    : fractionCut(rng, skillId, denMax, ADDSUB_IMPROPER[L], ADDSUB_LIKE[L]);
};

// ---- dec-ops --------------------------------------------------------------------------------

/** A scaled integer as a decimal string with no trailing zero: 125 at two places is "1.25", 50 is "0.5". */
export const decString = (scaled: number, places: number): string => {
  const scale = 10 ** places;
  const whole = Math.floor(scaled / scale);
  const part = String(scaled % scale).padStart(places, "0").replace(/0+$/, "");
  return part ? `${whole}.${part}` : String(whole);
};

/** A length of 1..`places` decimal places, up to `maxWhole` feet, as an integer of 10^-places. */
const decLength = (rng: () => number, places: number, maxWhole: number): number => {
  const p = randInt(rng, 1, places);
  return randInt(rng, 1, maxWhole * 10 ** p) * 10 ** (places - p);
};

/** The leading operand: always reaching the last place (…5, not …0), so the sum shows the level's precision. */
const decLead = (rng: () => number, places: number, maxWhole: number, min = 1): number => {
  const v = randInt(rng, min, maxWhole * 10 ** places);
  return v - (v % 10) + randInt(rng, 1, 9);
};

const decOps: BenchGenerator = (level, rng, skillId) => {
  const L = level4(level);
  const places = DEC_PLACES[L];
  const maxWhole = DEC_WHOLE_MAX[L];
  const { who, thing } = TRADES[skillId];
  const str = (v: number) => decString(v, places);

  if (rng() < 0.5) {
    const x = decLead(rng, places, maxWhole);
    let y = decLength(rng, places, maxWhole);
    while (y === x) y = decLength(rng, places, maxWhole);
    const mark = x + y;
    const [lo, hi] = x < y ? [x, y] : [y, x];
    const used = new Set([x, y, mark]);
    const decoys: number[] = [];
    const want = randInt(rng, 2, 3);
    for (let tries = 0; tries < 200 && decoys.length < want; tries++) {
      const v = decLength(rng, places, maxWhole);
      if (!used.has(v)) { used.add(v); decoys.push(v); }
    }
    const values = shuffle([x, y, ...decoys], rng);
    const pieces: MeasurePiece[] = values.map((v) => ({ label: feetText(str(v)), value: str(v) }));
    return {
      kind: "measure", id: `${skillId}:asm:${str(mark)}=${values.map(str).join(",")}`, skillId,
      prompt: `${who} needs a ${thing} ${feetText(str(mark))} long. Pick the pieces that make it.`,
      mode: "assemble", unit: "feet", pieces, target: { label: feetText(str(mark)), value: str(mark) },
      solution: [values.indexOf(x), values.indexOf(y)].sort((p, q) => p - q),
      bridge: `${str(lo)} + ${str(hi)} = ${str(mark)}`,
      explain: `Line up the decimal points: ${str(lo)} + ${str(hi)} = ${str(mark)}.`,
    };
  }

  const a = decLead(rng, places, maxWhole, 10 ** places); // at least a foot, so a piece of 1..places places fits inside
  // The piece cut off is shorter than the beam, so something is left, and more than one step of the stepper.
  const bp = randInt(rng, 1, places);
  const unit = 10 ** (places - bp);
  const b = randInt(rng, 1, Math.floor((a - 2) / unit)) * unit; // what is left is at least two steps of the stepper (0.2 at tenths, 0.02 at hundredths)
  const left = a - b;
  return {
    kind: "measure", id: `${skillId}:cut:${str(a)}-${str(b)}`, skillId,
    prompt: `${who} has a ${thing} ${feetText(str(a))} long. Cut off ${feetText(str(b))}. How long is the piece that's left?`,
    mode: "cut", unit: "feet", quantity: "length", answer: str(left), step: places === 1 ? "0.1" : "0.01", maxLength: str(a),
    bridge: `${str(a)} ${MINUS} ${str(b)} = ${str(left)}`,
    explain: `Line up the decimal points: ${str(a)} ${MINUS} ${str(b)} = ${str(left)}.`,
  };
};

export const G35_BENCH: Record<string, BenchGenerator> = {
  "area-perimeter": areaPerimeter, "frac-unit": fracUnit,
  "frac-equiv": fracEquiv, "mul-multi": mulMulti,
  "frac-addsub": fracAddsub, "dec-ops": decOps,
};
