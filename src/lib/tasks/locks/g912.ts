/**
 * The grade 9-12 locks (F3): `logic-g912` draws 5x5 number cages and 4x4 logic grids (the builders
 * in `g58.ts`, at the larger size) and 5x5 nonograms, a third each.
 *
 * **Nonograms.** A picture from a small library of simple figures (house, tree, crown, heart, arrow,
 * key, cup), mirrored or moved at random, with a square or two flipped at its edge from level 1, so
 * it still reads as a shape rather than noise. The clues are its row and column runs (`[]` for an
 * empty line). It is kept only when a line-by-line solver fills the whole board from the clues alone,
 * which proves the answer is unique and means it can be solved without guessing; it has at least 8
 * filled squares and is never solid. Bounded tries, then the safe fallback (a boat).
 */
import { randInt, type Rng } from "@/lib/utils/drill-generators";
import type { LockTask } from "../types";
import { cageTask, logicTask, type CageStep, type LogicStep } from "./g58";
import type { LockGenerator } from "./index";
import { clampLevel, pick, weighted } from "./k4";

const SIDE = 5;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------------------------------------
// nonograms

/** The figures, drawn on a 5x5 board (`#` filled). Some leave a row or column free, so they can move. */
const FIGURES: Record<string, readonly string[]> = {
  house: ["..#..", ".###.", "#####", "##.##", "##.##"],
  tree: ["..#..", ".###.", "#####", "..#..", "..#.."],
  crown: ["#.#.#", "#.#.#", "#####", "#####", "....."],
  heart: [".#.#.", "#####", "#####", ".###.", "..#.."],
  arrow: ["..#..", ".###.", "#.#.#", "..#..", "..#.."],
  key: ["###..", "#.###", "###.#", ".....", "....."],
  cup: ["#####", "#####", ".###.", "..#..", ".###."],
};
const FIGURE_NAMES = Object.keys(FIGURES);

/** Squares flipped at the figure's edge, by level: [fewest, most]. */
const NONO_FLIPS: readonly (readonly [number, number])[] = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]];

const MIN_FILLED = 8;

/** The run lengths of filled squares along a line of 0/1; `[]` for an empty line. */
function runsOf(line: readonly number[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const x of [...line, 0]) {
    if (x === 1) n++;
    else if (n > 0) {
      out.push(n);
      n = 0;
    }
  }
  return out;
}

const rowOf = (cells: readonly number[], r: number) => range(SIDE).map((c) => cells[r * SIDE + c]);
const colOf = (cells: readonly number[], c: number) => range(SIDE).map((r) => cells[r * SIDE + c]);

/** Every line of five squares, as 0/1. */
const ALL_LINES: number[][] = range(1 << SIDE).map((m) => range(SIDE).map((i) => (m >> (SIDE - 1 - i)) & 1));
const sameRuns = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Whether the clues alone fill the board, line by line: each line keeps the fillings that fit its clue
 * and the squares already known, and a square every one of them agrees on becomes known. Solved to
 * the last square means exactly one answer, found without guessing.
 */
function lineSolves(rows: readonly number[][], cols: readonly number[][]): boolean {
  const grid: number[] = Array(SIDE * SIDE).fill(-1);
  const lines = [
    ...range(SIDE).map((r) => ({ at: range(SIDE).map((c) => r * SIDE + c), fits: ALL_LINES.filter((l) => sameRuns(runsOf(l), rows[r])) })),
    ...range(SIDE).map((c) => ({ at: range(SIDE).map((r) => r * SIDE + c), fits: ALL_LINES.filter((l) => sameRuns(runsOf(l), cols[c])) })),
  ];
  for (let changed = true; changed; ) {
    changed = false;
    for (const line of lines) {
      line.fits = line.fits.filter((l) => l.every((x, i) => grid[line.at[i]] === -1 || grid[line.at[i]] === x));
      if (line.fits.length === 0) return false;
      line.at.forEach((cell, i) => {
        if (grid[cell] !== -1) return;
        const v = line.fits[0][i];
        if (line.fits.every((l) => l[i] === v)) {
          grid[cell] = v;
          changed = true;
        }
      });
    }
  }
  return grid.every((x) => x !== -1);
}

/** The task for a picture. The id spells out the picture square by square; the clues follow from it. */
function nonoOf(name: string, cells: number[], flipped: boolean, skillId: string): LockTask {
  return {
    kind: "lock", id: `${skillId}:nono5:${name}:${cells.join("")}`, skillId, puzzle: "nono5",
    prompt: "Fill the squares so every line matches its numbers.",
    explain: flipped
      ? "Each number is a run of filled squares, in order along its line."
      : `Each number is a run of filled squares, in order along its line. The picture is a ${name}.`,
    rows: range(SIDE).map((r) => runsOf(rowOf(cells, r))),
    cols: range(SIDE).map((c) => runsOf(colOf(cells, c))),
    solution: { puzzle: "nono5", cells },
  };
}

/** A figure's squares (0/1, row-major), mirrored at random and moved within the free rows and columns. */
function placed(name: string, rng: Rng): number[] {
  let rows = FIGURES[name].map((line) => [...line].map((ch) => (ch === "#" ? 1 : 0)));
  if (rng() < 0.5) rows = rows.map((line) => [...line].reverse());
  const filledRows = range(SIDE).filter((r) => rows[r].includes(1));
  const filledCols = range(SIDE).filter((c) => rows.some((line) => line[c] === 1));
  const dr = randInt(rng, -filledRows[0], SIDE - 1 - filledRows[filledRows.length - 1]);
  const dc = randInt(rng, -filledCols[0], SIDE - 1 - filledCols[filledCols.length - 1]);
  const cells: number[] = Array(SIDE * SIDE).fill(0);
  rows.forEach((line, r) => line.forEach((x, c) => {
    if (x === 1) cells[(r + dr) * SIDE + c + dc] = 1;
  }));
  return cells;
}

/** Squares on the figure's edge: each has a neighbour of the other kind, so flipping one keeps the shape. */
function edges(cells: number[]): number[] {
  return range(SIDE * SIDE).filter((i) => {
    const r = Math.floor(i / SIDE);
    const c = i % SIDE;
    const near = [r > 0 ? i - SIDE : -1, r < SIDE - 1 ? i + SIDE : -1, c > 0 ? i - 1 : -1, c < SIDE - 1 ? i + 1 : -1].filter((j) => j >= 0);
    return near.some((j) => cells[j] !== cells[i]);
  });
}

function tryNono(level: number, rng: Rng, skillId: string): LockTask | null {
  const name = pick(rng, FIGURE_NAMES);
  const cells = placed(name, rng);
  const [lo, hi] = NONO_FLIPS[level];
  const flips = randInt(rng, lo, hi);
  for (let k = 0; k < flips; k++) {
    const at = pick(rng, edges(cells));
    cells[at] = 1 - cells[at];
  }
  const filled = cells.filter((x) => x === 1).length;
  if (filled < MIN_FILLED || filled === SIDE * SIDE) return null;
  const t = nonoOf(name, cells, flips > 0, skillId);
  return t.puzzle === "nono5" && lineSolves(t.rows, t.cols) ? t : null;
}

const NONO_TRIES = 40;

function nonoTask(level: number, rng: Rng, skillId: string): LockTask {
  for (let attempt = 0; attempt < NONO_TRIES; attempt++) {
    const t = tryNono(level, rng, skillId);
    if (t) return t;
  }
  return fallbackNono(skillId);
}

/** The safe nonogram, a boat: outside the library, so its id says when it was used (line-solvable; the catalog tests prove it). */
const SAFE_BOAT = ["..#..", "..##.", "..#..", "#####", ".###."];

export function fallbackNono(skillId: string): LockTask {
  return nonoOf("boat", SAFE_BOAT.flatMap((line) => [...line].map((ch) => (ch === "#" ? 1 : 0))), false, skillId);
}

// ---------------------------------------------------------------------------------------------
// the skill

/** 5x5 cages: `+ ×` with more single squares and givens at first, then `−`, then `÷`. */
const G912_CAGES: readonly CageStep[] = [
  { sizes: [3, 5, 2], pair: ["+", "×"], trio: ["+", "×"], givens: 2, maxGivens: 6 },
  { sizes: [2, 5, 3], pair: ["+", "×", "-"], trio: ["+", "×"], givens: 1, maxGivens: 5 },
  { sizes: [2, 5, 3], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 1, maxGivens: 5 },
  { sizes: [1, 5, 3], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 0, maxGivens: 4 },
  { sizes: [1, 4, 4], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 0, maxGivens: 4 },
];

/** 4x4 logic grids: up to two "is" anchors at first, eliminations only at the top. */
const LOGIC4_STEPS: readonly LogicStep[] = [
  { maxIs: 2, keepIs: true },
  { maxIs: 2, keepIs: false },
  { maxIs: 1, keepIs: true },
  { maxIs: 1, keepIs: false },
  { maxIs: 0, keepIs: false },
];

const logicG912: LockGenerator = (level, rng, skillId) => {
  const l = clampLevel(level);
  const kind = weighted(rng, [["cage", 1], ["nono", 1], ["logic", 1]] as const);
  if (kind === "cage") return cageTask(5, G912_CAGES[l], rng, skillId);
  return kind === "nono" ? nonoTask(l, rng, skillId) : logicTask(4, LOGIC4_STEPS[l], rng, skillId);
};

export const G912_LOCKS: Record<string, LockGenerator> = { "logic-g912": logicG912 };
