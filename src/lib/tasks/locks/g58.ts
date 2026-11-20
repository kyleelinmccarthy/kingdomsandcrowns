/**
 * The grade 4-8 locks (F3), and the two puzzle builders the 9-12 band reuses at a larger size:
 *
 * - **Number cages** (`cage4`, and `cage5` for `g912.ts`): KenKen. A seeded random Latin square is cut
 *   into connected cages of 1-3 squares. A single square says `=`; a pair takes `+ − × ÷` (`÷` only
 *   when it divides evenly); a trio takes `+` or `×`. The level sets the cage sizes, the operations
 *   and the givens.
 * - **Logic grids** (`logic3`, `logic4`): n people, n items, and short clues that each state one
 *   pairing ("Ana does not play the lute.", "The baker wears the red cloak.").
 *
 * Both must have exactly ONE answer. The generators count answers with their own search before a
 * task is returned: a cage puzzle that allows two gets a given on a square the two answers disagree
 * on, until one is left (within the level's budget); a logic grid starts from every "not" fact,
 * which settles it, and drops clues one at a time while the answer stays unique, which leaves a
 * minimal set (dropping any clue left would let a second answer in). The test solver (`solver.ts`)
 * re-counts every one with the checker itself.
 *
 * Generation is bounded: after a fixed number of tries a generator returns its safe fallback, a
 * fixed puzzle that passes every check. Every id spells out the whole puzzle from what the child is
 * shown (never the answer: the id reaches the browser), so one id is one task.
 *
 * Skills: `logic-g45` is mostly cages, easy ones at the low levels (more single squares and givens,
 * `+` only), with some 3x3 logic grids; `logic-g68` is cages and logic grids half and half, the grids
 * starting at 3x3 with 3 clues and growing to 4x4 from level 1.
 */
import { shuffle, type Rng } from "@/lib/utils/drill-generators";
import type { LockCage, LogicClue } from "../lock-rules";
import type { LockTask } from "../types";
import type { LockGenerator } from "./index";
import { clampLevel, pick, range, sample, weighted } from "./util";

type CageOp = LockCage["op"];
export type CageSide = 4 | 5;


// ---------------------------------------------------------------------------------------------
// number cages

export type CageStep = {
  /** How likely a new cage is to hold 1, 2 or 3 squares. */
  sizes: readonly [number, number, number];
  /** The operations a two-square cage may take (`÷` only where it divides evenly). */
  pair: readonly ("+" | "-" | "×" | "÷")[];
  /** The operations a three-square cage may take. */
  trio: readonly ("+" | "×")[];
  /** Givens placed before the answer is counted. */
  givens: number;
  /** The most givens a puzzle may end with, counting the ones added to make the answer unique. */
  maxGivens: number;
};

/** A seeded random Latin square of side `n`, row-major, filled square by square in a random order of values. */
function randomLatin(n: number, rng: Rng): number[] {
  const cells: number[] = Array(n * n).fill(0);
  const free = (i: number, v: number) => {
    const r = Math.floor(i / n);
    const c = i % n;
    for (let k = 0; k < n; k++) if (cells[r * n + k] === v || cells[k * n + c] === v) return false;
    return true;
  };
  const go = (i: number): boolean => {
    if (i === n * n) return true;
    for (const v of shuffle(range(n).map((x) => x + 1), rng)) {
      if (!free(i, v)) continue;
      cells[i] = v;
      if (go(i + 1)) return true;
      cells[i] = 0;
    }
    return false;
  };
  go(0);
  return cells;
}

const neighbours = (i: number, n: number): number[] => {
  const r = Math.floor(i / n);
  const c = i % n;
  return [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((j) => j >= 0);
};

/** Cut the board into connected cages of 1-3 squares, each cage's squares in order, cages in order of their first square. */
function partition(n: number, sizes: CageStep["sizes"], rng: Rng): number[][] {
  const owner: number[] = Array(n * n).fill(-1);
  const groups: number[][] = [];
  for (const start of shuffle(range(n * n), rng)) {
    if (owner[start] !== -1) continue;
    const want = weighted(rng, [[1, sizes[0]], [2, sizes[1]], [3, sizes[2]]] as const);
    const group = [start];
    owner[start] = groups.length;
    while (group.length < want) {
      const frontier = [...new Set(group.flatMap((i) => neighbours(i, n)))].filter((j) => owner[j] === -1).sort((a, b) => a - b);
      if (frontier.length === 0) break;
      const next = pick(rng, frontier);
      owner[next] = groups.length;
      group.push(next);
    }
    groups.push(group.sort((a, b) => a - b));
  }
  return groups.sort((a, b) => a[0] - b[0]);
}

function targetOf(op: CageOp, vs: number[]): number {
  switch (op) {
    case "=": return vs[0];
    case "+": return vs.reduce((a, b) => a + b, 0);
    case "×": return vs.reduce((a, b) => a * b, 1);
    case "-": return Math.abs(vs[0] - vs[1]);
    case "÷": return Math.max(...vs) / Math.min(...vs);
  }
}

/** The cage over `cells`, its operation rolled from what the step allows and what the values permit. */
function cageOver(cells: number[], solution: number[], step: CageStep, rng: Rng): LockCage {
  const vs = cells.map((i) => solution[i]);
  let op: CageOp;
  if (cells.length === 1) op = "=";
  else if (cells.length === 2) op = pick(rng, step.pair.filter((o) => o !== "÷" || Math.max(...vs) % Math.min(...vs) === 0));
  else op = pick(rng, step.trio);
  return { cells, op, target: targetOf(op, vs) };
}

/** Whether values meet a cage's rule: the same reading as the checker (`-` and `÷` either way round). */
function cageMet(c: LockCage, vs: number[]): boolean {
  if (c.op === "-" || c.op === "÷") return vs.length === 2 && targetOf(c.op, vs) === c.target;
  return targetOf(c.op, vs) === c.target;
}

/**
 * Up to `limit` answers to a cage puzzle. Each cage's possible fillings are listed first (its rule,
 * the givens, no repeat within a row or column of the cage); then cages are placed fewest-choices
 * first, with a bitmask per row and column, so the search never walks the n^(n²) boards.
 */
function solveCages(n: number, cages: readonly LockCage[], givens: readonly number[], limit: number): number[][] {
  const fillings = cages.map((c) => {
    const out: number[][] = [];
    const k = c.cells.length;
    for (let code = 0; code < n ** k; code++) {
      const vs = range(k).map((j) => 1 + (Math.floor(code / n ** j) % n));
      if (c.cells.some((cell, j) => givens[cell] !== 0 && givens[cell] !== vs[j])) continue;
      const clash = c.cells.some((a, x) => c.cells.some((b, y) => y > x && vs[x] === vs[y] && (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n)));
      if (!clash && cageMet(c, vs)) out.push(vs);
    }
    return out;
  });
  const order = range(cages.length).sort((a, b) => fillings[a].length - fillings[b].length);
  const rowMask: number[] = Array(n).fill(0);
  const colMask: number[] = Array(n).fill(0);
  const board: number[] = Array(n * n).fill(0);
  const found: number[][] = [];
  const go = (k: number) => {
    if (found.length >= limit) return;
    if (k === order.length) return void found.push([...board]);
    const c = cages[order[k]];
    for (const vs of fillings[order[k]]) {
      if (c.cells.some((cell, j) => (rowMask[Math.floor(cell / n)] | colMask[cell % n]) & (1 << vs[j]))) continue;
      c.cells.forEach((cell, j) => {
        rowMask[Math.floor(cell / n)] |= 1 << vs[j];
        colMask[cell % n] |= 1 << vs[j];
        board[cell] = vs[j];
      });
      go(k + 1);
      c.cells.forEach((cell, j) => {
        rowMask[Math.floor(cell / n)] &= ~(1 << vs[j]);
        colMask[cell % n] &= ~(1 << vs[j]);
        board[cell] = 0;
      });
    }
  };
  go(0);
  return found;
}

const OP_CODE: Record<CageOp, string> = { "=": "e", "+": "p", "-": "m", "×": "x", "÷": "d" };

/** The task for a finished cage puzzle. The id spells out the cages (a letter per square), their rules and the givens. */
function cageOf(n: CageSide, cages: LockCage[], givens: number[], solution: number[], skillId: string): LockTask {
  const layout: string[] = Array(n * n).fill("");
  cages.forEach((c, k) => c.cells.forEach((i) => (layout[i] = String.fromCharCode(97 + k))));
  const hasGivens = givens.some((g) => g !== 0);
  const id = `${skillId}:cage${n}:${layout.join("")}:${cages.map((c) => `${OP_CODE[c.op]}${c.target}`).join(".")}:${hasGivens ? givens.join("") : "-"}`;
  const base = {
    kind: "lock" as const, id, skillId,
    prompt: `Use 1 to ${n} once in each row and column.`,
    explain: `Every row and column holds 1 to ${n} once, and every cage makes its number.`,
    cages, ...(hasGivens ? { givens } : {}),
  };
  return n === 4
    ? { ...base, puzzle: "cage4", solution: { puzzle: "cage4", cells: solution } }
    : { ...base, puzzle: "cage5", solution: { puzzle: "cage5", cells: solution } };
}

/** At least half the board must be the child's to work out: neither given nor a single square. */
const enoughOpen = (n: number, cages: LockCage[], givens: number[]) =>
  cages.filter((c) => c.op !== "=").reduce((a, c) => a + c.cells.length, 0) - givens.filter((g) => g !== 0).length >= Math.ceil((n * n) / 2);

function tryCage(n: CageSide, step: CageStep, rng: Rng, skillId: string): LockTask | null {
  const solution = randomLatin(n, rng);
  const cages = partition(n, step.sizes, rng).map((cells) => cageOver(cells, solution, step, rng));
  const singles = new Set(cages.filter((c) => c.op === "=").flatMap((c) => c.cells));
  const givens: number[] = Array(n * n).fill(0);
  for (const i of sample(rng, range(n * n).filter((i) => !singles.has(i)), step.givens)) givens[i] = solution[i];
  for (;;) {
    const found = solveCages(n, cages, givens, 2);
    if (found.length === 1) break;
    if (givens.filter((g) => g !== 0).length >= step.maxGivens) return null;
    // Two answers: give a square they disagree on (never a single or a given: those are fixed in both).
    const at = pick(rng, range(n * n).filter((i) => found[0][i] !== found[1][i]));
    givens[at] = solution[at];
  }
  return enoughOpen(n, cages, givens) ? cageOf(n, cages, givens, solution, skillId) : null;
}

const CAGE_TRIES = 40;

/** A cage puzzle with exactly one answer: up to `CAGE_TRIES` seeded tries, then the safe fallback. */
export function cageTask(n: CageSide, step: CageStep, rng: Rng, skillId: string): LockTask {
  for (let attempt = 0; attempt < CAGE_TRIES; attempt++) {
    const t = tryCage(n, step, rng, skillId);
    if (t) return t;
  }
  return fallbackCage(n, skillId);
}

const rule = (cells: number[], op: CageOp, target: number): LockCage => ({ cells, op, target });

/**
 * Fixed cage puzzles, one per size, each with exactly one answer and no givens (the catalog tests
 * prove it). They use `+` and single squares only, so they suit every level of every skill.
 */
const SAFE_CAGES: Record<CageSide, { cages: LockCage[]; solution: number[] }> = {
  // 1 2 3 4
  // 2 3 4 1
  // 3 4 1 2
  // 4 1 2 3
  4: {
    cages: [
      rule([0, 4], "+", 3), rule([1], "=", 2), rule([2], "=", 3), rule([3, 7], "+", 5), rule([5], "=", 3),
      rule([6, 10], "+", 5), rule([8], "=", 3), rule([9, 12, 13], "+", 9), rule([11, 15], "+", 5), rule([14], "=", 2),
    ],
    solution: [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3],
  },
  // 5 1 2 4 3
  // 3 2 1 5 4
  // 2 5 4 3 1
  // 4 3 5 1 2
  // 1 4 3 2 5
  5: {
    cages: [
      rule([0, 1, 2], "+", 8), rule([3, 4], "+", 7), rule([5, 10], "+", 5), rule([6], "=", 2), rule([7], "=", 1),
      rule([8, 13], "+", 8), rule([9, 14], "+", 5), rule([11, 12], "+", 9), rule([15, 16, 21], "+", 11), rule([17, 18], "+", 6),
      rule([19], "=", 2), rule([20], "=", 1), rule([22, 23], "+", 5), rule([24], "=", 5),
    ],
    solution: [5, 1, 2, 4, 3, 3, 2, 1, 5, 4, 2, 5, 4, 3, 1, 4, 3, 5, 1, 2, 1, 4, 3, 2, 5],
  },
};

/** The safe cage puzzle of side `n`, for when the seeded tries run out. */
export function fallbackCage(n: CageSide, skillId: string): LockTask {
  const safe = SAFE_CAGES[n];
  return cageOf(n, safe.cages.map((k) => ({ ...k, cells: [...k.cells] })), Array(n * n).fill(0), [...safe.solution], skillId);
}

// ---------------------------------------------------------------------------------------------
// logic grids

/** Short, friendly names; and village folk, written "the baker" in a clue. */
const NAMES = ["Ana", "Ben", "Cy", "Dot", "Eli", "Fay", "Gus", "Ivy", "Kit", "Lou", "Max", "Nell", "Pip", "Rex", "Sam", "Tam"] as const;
const FOLK = ["baker", "smith", "miller", "weaver", "potter", "tailor", "shepherd", "fisher"] as const;

type Theme = { key: string; ask: string; items: readonly string[]; noun: (x: string) => string; is: string; isNot: string };
const THEMES: readonly Theme[] = [
  { key: "inst", ask: "Who plays which instrument?", items: ["lute", "drum", "harp", "horn", "fiddle", "pipe"], noun: (x) => x, is: "plays the", isNot: "does not play the" },
  { key: "cloak", ask: "Who wears which cloak?", items: ["red", "blue", "yellow", "purple", "grey", "white"], noun: (x) => `${x} cloak`, is: "wears the", isNot: "does not wear the" },
  { key: "pet", ask: "Who keeps which pet?", items: ["cat", "dog", "owl", "goat", "frog", "hen"], noun: (x) => x, is: "keeps the", isNot: "does not keep the" },
];

/**
 * A rung of logic grids: the grid's size, and how many "is" clues it keeps (one of `is`, at random;
 * never more than n − 2, so an elimination is always needed).
 *
 * The "is" count is the difficulty knob, because a minimal clue set has few shapes. Counted
 * exhaustively: a minimal 3x3 set is 1 "is" + 1 "not" (2 clues) or 3 "not"s; a minimal 4x4 set (at
 * most 2 "is") is 2 "is" + 1 "not", 1 "is" + 3 "not"s, or 6 "not"s.
 */
export type LogicStep = { n: 3 | 4; is: readonly number[] };

type Fact = { type: LogicClue["type"]; a: [number, number] };

const PERMS: Record<number, number[][]> = {};
function permsOf(n: number): number[][] {
  if (PERMS[n]) return PERMS[n];
  const out: number[][] = [];
  const go = (acc: number[]) => {
    if (acc.length === n) return void out.push(acc);
    for (let v = 0; v < n; v++) if (!acc.includes(v)) go([...acc, v]);
  };
  go([]);
  return (PERMS[n] = out);
}

/** How many matchings (person r has item p[r]) the facts allow, counting to 2 at most. */
function matchings(n: number, facts: readonly Fact[]): number {
  let count = 0;
  for (const p of permsOf(n)) {
    if (facts.every((f) => (p[f.a[0]] === f.a[1]) === (f.type === "is")) && ++count === 2) break;
  }
  return count;
}

type People = { key: "n" | "f"; picks: number[] };

const personLabel = (people: People, r: number) =>
  people.key === "n" ? NAMES[people.picks[r]] : FOLK[people.picks[r]][0].toUpperCase() + FOLK[people.picks[r]].slice(1);
const personSubject = (people: People, r: number) => (people.key === "n" ? NAMES[people.picks[r]] : `The ${FOLK[people.picks[r]]}`);

/** The task for a finished logic grid. The id spells out the people, the items and the clues. */
function logicOf(n: 3 | 4, people: People, theme: Theme, items: number[], facts: Fact[], answer: number[], skillId: string): LockTask {
  const nounOf = (col: number) => theme.noun(theme.items[items[col]]);
  const clues: LogicClue[] = facts.map((f) => ({
    type: f.type, a: [f.a[0], f.a[1]],
    text: `${personSubject(people, f.a[0])} ${f.type === "is" ? theme.is : theme.isNot} ${nounOf(f.a[1])}.`,
  }));
  const id = `${skillId}:logic${n}:${people.key}${people.picks.join(".")}:${theme.key}${items.join(".")}:${facts.map((f) => `${f.type === "is" ? "+" : "-"}${f.a[0]}${f.a[1]}`).join(",")}`;
  const base = {
    kind: "lock" as const, id, skillId, prompt: theme.ask,
    explain: range(n).map((r) => `${personSubject(people, r)} ${theme.is} ${nounOf(answer[r])}.`).join(" "),
    rows: range(n).map((r) => personLabel(people, r)), cols: range(n).map(nounOf), clues,
  };
  const cells = answer.map((col) => col + 1);
  return n === 3
    ? { ...base, puzzle: "logic3", solution: { puzzle: "logic3", cells } }
    : { ...base, puzzle: "logic4", solution: { puzzle: "logic4", cells } };
}

function tryLogic(step: LogicStep, rng: Rng, skillId: string): LockTask | null {
  const n = step.n;
  const answer = shuffle(range(n), rng);
  const people: People = rng() < 0.5 ? { key: "n", picks: sample(rng, range(NAMES.length), n) } : { key: "f", picks: sample(rng, range(FOLK.length), n) };
  const theme = pick(rng, THEMES);
  const items = sample(rng, range(theme.items.length), n);
  const isCount = Math.min(pick(rng, step.is), n - 2);
  const isFacts: Fact[] = sample(rng, range(n), isCount).map((r) => ({ type: "is", a: [r, answer[r]] }));
  const nots: Fact[] = range(n).flatMap((r) => range(n).filter((col) => col !== answer[r]).map((col): Fact => ({ type: "isNot", a: [r, col] })));
  // Every "not" fact settles the grid; drop facts one at a time while it stays settled, the "not"s
  // first so the "is" anchors stay. One pass leaves a minimal set: a fact kept once could not go,
  // and with fewer facts around it still can't.
  const order = [...shuffle(nots, rng), ...shuffle(isFacts, rng)];
  let kept = [...order];
  for (const f of order) {
    const without = kept.filter((k) => k !== f);
    if (matchings(n, without) === 1) kept = without;
  }
  if (kept.filter((f) => f.type === "is").length !== isCount || !kept.some((f) => f.type === "isNot")) return null;
  return logicOf(n, people, theme, items, shuffle(kept, rng), answer, skillId);
}

const LOGIC_TRIES = 20;

/** A logic grid with exactly one answer and a minimal clue set: up to `LOGIC_TRIES` tries, then the safe fallback. */
export function logicTask(step: LogicStep, rng: Rng, skillId: string): LockTask {
  for (let attempt = 0; attempt < LOGIC_TRIES; attempt++) {
    const t = tryLogic(step, rng, skillId);
    if (t) return t;
  }
  return fallbackLogic(step.n, skillId);
}

/**
 * Fixed logic grids, one per size, each with exactly one answer and a minimal clue set (the catalog
 * tests prove it). The 3x3 one has 3 clues, so it suits every level of both 4-8 skills.
 */
const SAFE_LOGIC: Record<3 | 4, { people: People; theme: number; items: number[]; facts: Fact[]; answer: number[] }> = {
  // Lou, Kit, Ivy; pipe, lute, drum. Ivy plays neither the pipe nor the lute, so the drum; Lou not the pipe, so the lute; Kit the pipe.
  3: {
    people: { key: "n", picks: [9, 8, 7] }, theme: 0, items: [5, 0, 1],
    facts: [{ type: "isNot", a: [2, 0] }, { type: "isNot", a: [0, 0] }, { type: "isNot", a: [2, 1] }], answer: [1, 0, 2],
  },
  // Tailor, smith, fisher, weaver; owl, hen, frog, dog. Tailor: hen. Weaver: not dog, not owl, so frog. Fisher: not owl, so dog. Smith: owl.
  4: {
    people: { key: "f", picks: [5, 1, 7, 3] }, theme: 2, items: [2, 5, 4, 1],
    facts: [{ type: "isNot", a: [3, 3] }, { type: "isNot", a: [3, 0] }, { type: "is", a: [0, 1] }, { type: "isNot", a: [2, 0] }],
    answer: [1, 0, 3, 2],
  },
};

/** The safe logic grid of size `n`, for when the seeded tries run out. */
export function fallbackLogic(n: 3 | 4, skillId: string): LockTask {
  const s = SAFE_LOGIC[n];
  return logicOf(n, s.people, THEMES[s.theme], [...s.items], s.facts.map((f) => ({ type: f.type, a: [f.a[0], f.a[1]] })), [...s.answer], skillId);
}

// ---------------------------------------------------------------------------------------------
// the two skills

/** `logic-g45`: easy cages (the low levels: + only, more single squares and givens), and some 3x3 logic grids. */
const G45_CAGES: readonly CageStep[] = [
  { sizes: [3, 5, 1], pair: ["+"], trio: ["+"], givens: 2, maxGivens: 5 },
  { sizes: [2, 5, 2], pair: ["+"], trio: ["+"], givens: 1, maxGivens: 4 },
  { sizes: [2, 5, 2], pair: ["+", "×"], trio: ["+", "×"], givens: 1, maxGivens: 4 },
  { sizes: [1, 5, 3], pair: ["+", "×", "-"], trio: ["+", "×"], givens: 0, maxGivens: 3 },
  { sizes: [1, 5, 3], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 0, maxGivens: 3 },
];

/** `logic-g68`: cages with every operation from level 2, fewer single squares as the level climbs. */
const G68_CAGES: readonly CageStep[] = [
  { sizes: [2, 5, 2], pair: ["+", "×"], trio: ["+", "×"], givens: 1, maxGivens: 4 },
  { sizes: [1, 5, 3], pair: ["+", "×", "-"], trio: ["+", "×"], givens: 0, maxGivens: 3 },
  { sizes: [1, 5, 3], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 0, maxGivens: 3 },
  { sizes: [1, 4, 4], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 0, maxGivens: 2 },
  { sizes: [1, 4, 5], pair: ["+", "×", "-", "÷"], trio: ["+", "×"], givens: 0, maxGivens: 2 },
];

/** `logic-g45`: 3x3 logic grids with an "is" anchor at first (2 clues), then eliminations only (3 clues). */
const G45_LOGIC: readonly LogicStep[] = [
  { n: 3, is: [1] },
  { n: 3, is: [1] },
  { n: 3, is: [1, 0] },
  { n: 3, is: [0] },
  { n: 3, is: [0] },
];

/**
 * `logic-g68`: at least 3 clues from the start, and a distinct step at every level. A 3x3 grid with
 * 3 clues is the hardest 3x3 there is, so the grid grows to 4x4 from level 1 and sheds its anchors.
 */
const G68_LOGIC: readonly LogicStep[] = [
  { n: 3, is: [0] },
  { n: 4, is: [2] },
  { n: 4, is: [1] },
  { n: 4, is: [1, 0] },
  { n: 4, is: [0] },
];

const logicG45: LockGenerator = (level, rng, skillId) => {
  const l = clampLevel(level);
  return weighted(rng, [["cage", 3], ["logic", 1]] as const) === "cage" ? cageTask(4, G45_CAGES[l], rng, skillId) : logicTask(G45_LOGIC[l], rng, skillId);
};

const logicG68: LockGenerator = (level, rng, skillId) => {
  const l = clampLevel(level);
  return rng() < 0.5 ? cageTask(4, G68_CAGES[l], rng, skillId) : logicTask(G68_LOGIC[l], rng, skillId);
};

export const G58_LOCKS: Record<string, LockGenerator> = { "logic-g45": logicG45, "logic-g68": logicG68 };

