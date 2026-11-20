/**
 * The K-4 locks (F2). Two skills, each a mix of puzzles the level steers:
 *
 * - `logic-k1`: `pattern` (a repeat with blanks, filled from a tray) and `sort1` (shapes into two
 *   bins by one stated attribute).
 * - `logic-g23`: `shapes3` (a 3x3 grid of three shapes, each once per row and column), `balance`
 *   (put stones on the pan to match a weight) and `sort2` (a 2x2 sort by two attributes).
 *
 * Levels 0-4 set the size and the givens. Generators are seeded and pure (the `Rng` only), and every
 * id spells out the puzzle's parameters, so one id is one puzzle: anything the rng chose is in the
 * id, and everything else (the prompt, the solution) follows from it.
 *
 * Every task checks out before it is returned: a pattern's blanks have exactly one answer under the
 * shortest-repeat rule (counted by trying every tray combination against `checkLock`), and a grid
 * has exactly one completion. The test solver (`solver.ts`) re-proves both by brute force.
 */
import { randInt, shuffle, type Rng } from "@/lib/utils/drill-generators";
import { checkLock, type LockResponse, type LockShape } from "../lock-rules";
import type { LockTask } from "../types";
import type { LockGenerator } from "./index";
import {
  ATTR_WORD, SAFE_PALETTES, SHAPE_VOCAB, VALUES, makeShape, tokenCode, tokenKey, tokenName, valueLabel,
  type Attr, type ColorId, type ShapeId, type SizeId,
} from "./shapes";

type Of<P extends LockTask["puzzle"]> = Extract<LockTask, { puzzle: P }>;

export const clampLevel = (level: number): number => (Number.isFinite(level) ? Math.min(4, Math.max(0, Math.floor(level))) : 0);
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
/** `n` distinct picks from `xs`, in a random order. */
export const sample = <T>(rng: Rng, xs: readonly T[], n: number): T[] => shuffle([...xs], rng).slice(0, n);
/** Roll one of `options`, each with its weight. */
export function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((a, [, w]) => a + w, 0);
  let roll = rng() * total;
  for (const [value, w] of options) if ((roll -= w) < 0) return value;
  return options[options.length - 1][0];
}

// ---------------------------------------------------------------------------------------------
// pattern

type PatternStep = {
  /** Repeat units to choose from: AB, ABB or ABC. */
  units: readonly string[];
  /** Shapes shown, as [fewest, most]. */
  shown: readonly [number, number];
  blanks: number;
  /** Blanks at the end ("What comes next?"), or anywhere. */
  tail: boolean;
  /** Whether a token may differ in both shape and colour. */
  both: boolean;
};

/** K: one blank, 4-6 shapes shown. From level 3 (grade 1 and up): two blanks. */
const PATTERN_STEPS: readonly PatternStep[] = [
  { units: ["AB"], shown: [4, 4], blanks: 1, tail: true, both: false },
  { units: ["AB", "ABB"], shown: [4, 5], blanks: 1, tail: true, both: false },
  { units: ["AB", "ABB", "ABC"], shown: [4, 6], blanks: 1, tail: false, both: false },
  { units: ["AB", "ABB", "ABC"], shown: [4, 6], blanks: 2, tail: true, both: true },
  { units: ["AB", "ABB", "ABC"], shown: [5, 6], blanks: 2, tail: false, both: true },
];
/** Always works: an AB repeat with its last place blank. */
const SAFE_PATTERN: PatternStep = PATTERN_STEPS[0];

/** Every way to put tray shapes in `blanks` places, as response cells (1 + tray index). */
function* trayFills(blanks: number, tray: number): Generator<number[]> {
  const total = tray ** blanks;
  for (let n = 0; n < total; n++) yield Array.from({ length: blanks }, (_, b) => 1 + (Math.floor(n / tray ** b) % tray));
}

function tryPattern(step: PatternStep, rng: Rng, skillId: string): Of<"pattern"> | null {
  const unit = pick(rng, step.units);
  const distinct = new Set(unit).size;
  const family = pick(rng, step.both ? (["shape", "color", "both"] as const) : (["shape", "color"] as const));

  // One shape per letter of the unit: they differ in shape, in colour, or in both.
  // Colours come from one colour-blind-safe palette, tray included: red and green never meet (RF-d).
  const palette = pick(rng, SAFE_PALETTES);
  const fixedColor = pick(rng, palette);
  const fixedShape = pick(rng, SHAPE_VOCAB);
  const shapes = sample(rng, SHAPE_VOCAB, distinct);
  const colors = sample(rng, palette, distinct);
  const letters = [...new Set(unit)];
  const tokenOf = (i: number): LockShape =>
    family === "shape" ? makeShape(shapes[i], fixedColor) : family === "color" ? makeShape(fixedShape, colors[i]) : makeShape(shapes[i], colors[i]);
  const unitTokens = [...unit].map((ch) => tokenOf(letters.indexOf(ch)));
  const answers = letters.map((_, i) => tokenOf(i));

  const shown = randInt(rng, step.shown[0], step.shown[1]);
  const length = shown + step.blanks;
  const blanks = step.tail
    ? Array.from({ length: step.blanks }, (_, i) => length - step.blanks + i)
    : sample(rng, Array.from({ length }, (_, i) => i), step.blanks).sort((a, b) => a - b);

  // The tray: the answers, plus near-miss shapes (same colour, or same shape) to fill 3-4 places.
  const answerKeys = new Set(answers.map(tokenKey));
  const near: LockShape[] = [];
  const far: LockShape[] = [];
  for (const shape of SHAPE_VOCAB) for (const color of palette) {
    const token = makeShape(shape, color);
    if (answerKeys.has(tokenKey(token))) continue;
    const isNear = family === "shape" ? color === fixedColor : family === "color" ? shape === fixedShape : true;
    (isNear ? near : far).push(token);
  }
  const trayLength = Math.max(distinct + 1, randInt(rng, 3, 4));
  const distractors = [...shuffle(near, rng), ...shuffle(far, rng)].slice(0, trayLength - distinct);
  const tray = shuffle([...answers, ...distractors], rng);

  const sequence = Array.from({ length }, (_, i): LockShape | null => (blanks.includes(i) ? null : unitTokens[i % unitTokens.length]));
  const intended = blanks.map((i) => 1 + tray.findIndex((s) => tokenKey(s) === tokenKey(unitTokens[i % unitTokens.length])));
  const solution: LockResponse = { puzzle: "pattern", cells: intended };

  // Exactly one answer under the shortest-repeat rule, and it is the intended one.
  const view = { puzzle: "pattern" as const, sequence, tray };
  let valid = 0;
  for (const cells of trayFills(step.blanks, tray.length)) if (checkLock(view, { puzzle: "pattern", cells }).ok) valid++;
  if (valid !== 1 || !checkLock(view, solution).ok) return null;

  const atEnd = blanks.every((b, i) => b === length - blanks.length + i);
  const id = `${skillId}:pat:${unitTokens.map(tokenCode).join(",")}:${length}:${blanks.join(",")}:${tray.map(tokenCode).join(",")}`;
  return {
    kind: "lock", id, skillId, puzzle: "pattern",
    prompt: atEnd ? "What comes next?" : step.blanks === 1 ? "What fits in the empty spot?" : "What fits in the empty spots?",
    explain: `The pattern repeats: ${unitTokens.map(tokenName).join(", ")}.`,
    sequence, tray, solution,
  };
}

function patternTask(level: number, rng: Rng, skillId: string): LockTask {
  const step = PATTERN_STEPS[level];
  for (let attempt = 0; attempt < 60; attempt++) {
    const t = tryPattern(step, rng, skillId);
    if (t) return t;
  }
  // Terminates: SAFE_PATTERN (AB, four shown, the fifth blank) has exactly one answer, so it never fails.
  for (;;) {
    const t = tryPattern(SAFE_PATTERN, rng, skillId);
    if (t) return t;
  }
}

// ---------------------------------------------------------------------------------------------
// sorts

/** A shape with the attribute values given, filling the rest from the puzzle's own small palette. */
type Palette = { shapes: ShapeId[]; colors: ColorId[] };

function sortItem(attrs: Partial<Record<Attr, string>>, palette: Palette, rng: Rng, withSize: boolean): LockShape {
  const shape = (attrs.shape as ShapeId | undefined) ?? pick(rng, palette.shapes);
  const color = (attrs.color as ColorId | undefined) ?? pick(rng, palette.colors);
  return makeShape(shape, color, withSize ? (attrs.size as SizeId) : undefined);
}

/** Two values of an attribute to sort by; colours come from one colour-blind-safe palette (RF-d). */
const valuesFor = (rng: Rng, attr: Attr): string[] => sample(rng, attr === "color" ? pick(rng, SAFE_PALETTES) : VALUES[attr], 2);

const SORT1_COUNTS = [6, 6, 7, 7, 8];
const SORT2_COUNTS = [6, 7, 8, 8, 8];

function sort1Task(level: number, rng: Rng, skillId: string): LockTask {
  // Colour first; shape from level 1; size from level 2.
  const attr = pick(rng, level === 0 ? (["color"] as const) : level === 1 ? (["color", "shape"] as const) : (["color", "shape", "size"] as const));
  const values = valuesFor(rng, attr);
  const n = SORT1_COUNTS[level];
  // Each bin gets at least two shapes.
  const inFirst = randInt(rng, 2, n - 2);
  const palette: Palette = { shapes: sample(rng, SHAPE_VOCAB, 3), colors: sample(rng, pick(rng, SAFE_PALETTES), 2) };
  const bins = shuffle([...Array(inFirst).fill(0), ...Array(n - inFirst).fill(1)] as number[], rng);
  const items = bins.map((b) => sortItem({ [attr]: values[b] }, palette, rng, attr === "size"));
  const labels = values.map((v) => valueLabel(attr, v));
  const id = `${skillId}:sort1:${attr}:${values.map((v) => VALUES[attr].indexOf(v)).join(".")}:${items.map(tokenCode).join(",")}`;
  return {
    kind: "lock", id, skillId, puzzle: "sort1",
    prompt: `Sort the shapes by ${ATTR_WORD[attr]}.`,
    explain: `Put each shape with the ${ATTR_WORD[attr]} it has: ${labels[0]} or ${labels[1]}.`,
    items, bins: labels, fits: bins.map((b) => [b]),
    solution: { puzzle: "sort1", cells: bins.map((b) => b + 1) },
  };
}

function sort2Task(level: number, rng: Rng, skillId: string): LockTask {
  // Shape and colour first; any two of the three attributes from level 2.
  const [rowAttr, colAttr]: [Attr, Attr] =
    level < 2 ? (rng() < 0.5 ? ["shape", "color"] : ["color", "shape"]) : (sample(rng, ["color", "shape", "size"] as const, 2) as [Attr, Attr]);
  const rowValues = valuesFor(rng, rowAttr);
  const colValues = valuesFor(rng, colAttr);
  const withSize = rowAttr === "size" || colAttr === "size";
  // The attribute not being sorted by stays the same on every shape, so it never distracts.
  const palette: Palette = { shapes: [pick(rng, SHAPE_VOCAB)], colors: [pick(rng, pick(rng, SAFE_PALETTES))] };
  const n = SORT2_COUNTS[level];
  // Every bin gets a shape; the rest are anywhere.
  const bins = shuffle([0, 1, 2, 3, ...Array.from({ length: n - 4 }, () => randInt(rng, 0, 3))], rng);
  const items = bins.map((b) =>
    sortItem({ [rowAttr]: rowValues[b >> 1], [colAttr]: colValues[b & 1] }, palette, rng, withSize),
  );
  const rows = rowValues.map((v) => valueLabel(rowAttr, v)) as [string, string];
  const cols = colValues.map((v) => valueLabel(colAttr, v)) as [string, string];
  const idx = (attr: Attr, vs: string[]) => vs.map((v) => VALUES[attr].indexOf(v)).join(".");
  const id = `${skillId}:sort2:${rowAttr}-${colAttr}:${idx(rowAttr, rowValues)}:${idx(colAttr, colValues)}:${items.map(tokenCode).join(",")}`;
  return {
    kind: "lock", id, skillId, puzzle: "sort2",
    prompt: `Sort the shapes by ${ATTR_WORD[rowAttr]} and ${ATTR_WORD[colAttr]}.`,
    explain: `Each shape goes where its ${ATTR_WORD[rowAttr]} and its ${ATTR_WORD[colAttr]} meet.`,
    items, rows, cols, fits: bins.map((b) => [b]),
    solution: { puzzle: "sort2", cells: bins.map((b) => b + 1) },
  };
}

// ---------------------------------------------------------------------------------------------
// shapes3

/** Every 3x3 Latin square over 1..3, row-major: there are 12. */
const LATIN3: number[][] = (() => {
  const perms = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
  const out: number[][] = [];
  for (const a of perms) for (const b of perms) for (const c of perms) {
    if ([0, 1, 2].every((i) => new Set([a[i], b[i], c[i]]).size === 3)) out.push([...a, ...b, ...c]);
  }
  return out;
})();

/** How many Latin squares agree with the givens (0 = open). Generator-side; the test solver re-proves it. */
const completions = (givens: number[]): number => LATIN3.filter((sq) => givens.every((g, i) => g === 0 || sq[i] === g)).length;

const GRID_GIVENS = [5, 4, 4, 3, 3];

function shapes3Task(level: number, rng: Rng, skillId: string): LockTask {
  const shapes = sample(rng, SHAPE_VOCAB, 3);
  const colors = sample(rng, pick(rng, SAFE_PALETTES), 3);
  const symbols = shapes.map((s, i) => makeShape(s, colors[i]));
  const solved = pick(rng, LATIN3);
  const want = GRID_GIVENS[level];
  // Keep the rolls going until the givens leave exactly one board; if that ever failed, give one more.
  let givens: number[] = [];
  for (let attempt = 0, count = want; ; attempt++) {
    if (attempt > 0 && attempt % 300 === 0) count++;
    const at = sample(rng, Array.from({ length: 9 }, (_, i) => i), count);
    givens = solved.map((v, i) => (at.includes(i) ? v : 0));
    if (completions(givens) === 1) break;
  }
  return {
    kind: "lock", id: `${skillId}:grid:${symbols.map(tokenCode).join(",")}:${givens.join("")}`, skillId, puzzle: "shapes3",
    prompt: "Put each shape once in every row and column.",
    explain: "Every row and every column has each of the three shapes once.",
    symbols, givens, solution: { puzzle: "shapes3", cells: solved },
  };
}

// ---------------------------------------------------------------------------------------------
// balance

type BalanceStep = { count: number; max: number; used: readonly [number, number] };
const BALANCE_STEPS: readonly BalanceStep[] = [
  { count: 4, max: 5, used: [2, 2] },
  { count: 4, max: 6, used: [2, 2] },
  { count: 5, max: 8, used: [2, 3] },
  { count: 5, max: 9, used: [2, 3] },
  { count: 6, max: 10, used: [2, 3] },
];

/** Index sets of every size `k`, in order. */
function combos(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  const out: number[][] = [];
  for (let first = 0; first <= n - k; first++) for (const rest of combos(n - first - 1, k - 1)) out.push([first, ...rest.map((i) => i + first + 1)]);
  return out;
}

/** The stored answer: the fewest stones that balance, the first such set in order. A function of the puzzle alone. */
function smallestBalance(weights: number[], target: number): number[] | null {
  for (let k = 1; k <= weights.length; k++) {
    const hit = combos(weights.length, k).find((c) => c.reduce((a, i) => a + weights[i], 0) === target);
    if (hit) return weights.map((_, i) => (hit.includes(i) ? 1 : 0));
  }
  return null;
}

function balanceOf(weights: number[], target: number, cells: number[], skillId: string): LockTask {
  const on = weights.filter((_, i) => cells[i] === 1);
  return {
    kind: "lock", id: `${skillId}:bal:${weights.join(",")}=${target}`, skillId, puzzle: "balance",
    prompt: "Make both sides weigh the same.",
    explain: `${on.join(" + ")} weigh the same as ${target}.`,
    weights, target, unit: "stones", solution: { puzzle: "balance", cells },
  };
}

/** Always a good balance: 1 + 4 makes 5, 2 + 4 is the tempting near miss, no stone is 5. */
const SAFE_BALANCE = { weights: [1, 2, 3, 4], target: 5, cells: [1, 0, 0, 1] };

function balanceTask(level: number, rng: Rng, skillId: string): LockTask {
  const step = BALANCE_STEPS[level];
  for (let attempt = 0; attempt < 200; attempt++) {
    const weights = sample(rng, Array.from({ length: step.max }, (_, i) => i + 1), step.count).sort((a, b) => a - b);
    const used = sample(rng, weights, randInt(rng, step.used[0], step.used[1]));
    const target = used.reduce((a, b) => a + b, 0);
    // Not trivial: no single stone does it, and not the whole pile; a pair that is one off tempts.
    if (weights.includes(target) || target >= weights.reduce((a, b) => a + b, 0)) continue;
    const pairs = weights.flatMap((a, i) => weights.slice(i + 1).map((b) => a + b));
    if (!pairs.some((s) => Math.abs(s - target) === 1)) continue;
    const cells = smallestBalance(weights, target);
    if (cells) return balanceOf(weights, target, cells, skillId);
  }
  return balanceOf(SAFE_BALANCE.weights, SAFE_BALANCE.target, SAFE_BALANCE.cells, skillId);
}

// ---------------------------------------------------------------------------------------------
// the two skills

/** `logic-k1`: pattern and sort1, half and half. */
const logicK1: LockGenerator = (level, rng, skillId) => {
  const l = clampLevel(level);
  return rng() < 0.5 ? patternTask(l, rng, skillId) : sort1Task(l, rng, skillId);
};

/** The mix of `logic-g23` by level: [sort2, balance, shapes3]. The grid takes more of the play as the level climbs. */
const G23_MIX: readonly (readonly [number, number, number])[] = [[3, 3, 2], [3, 3, 3], [2, 3, 3], [2, 2, 4], [2, 2, 4]];

const logicG23: LockGenerator = (level, rng, skillId) => {
  const l = clampLevel(level);
  const [s, b, g] = G23_MIX[l];
  const kind = weighted(rng, [["sort2", s], ["balance", b], ["shapes3", g]] as const);
  return kind === "sort2" ? sort2Task(l, rng, skillId) : kind === "balance" ? balanceTask(l, rng, skillId) : shapes3Task(l, rng, skillId);
};

export const K4_LOCKS: Record<string, LockGenerator> = { "logic-k1": logicK1, "logic-g23": logicG23 };
