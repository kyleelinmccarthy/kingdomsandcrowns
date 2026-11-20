/**
 * Lock puzzles: their data, their responses and their rules (R-F1, R-F3, R-F4). Pure and
 * client-safe: types and plain functions only, no server import. The server's `lockKind` grades
 * with it; the lock's face (F4) marks broken rules with it.
 *
 * ## Responses
 *
 * Every puzzle answers with `{ puzzle, cells: number[] }`: one whole number per answerable place,
 * at most 25, where **0 is always "nothing here yet"** and anything else is 1 + an index, or a value:
 *
 * | puzzle             | one cell per                     | a cell holds                                       |
 * |--------------------|----------------------------------|----------------------------------------------------|
 * | `pattern`          | blank (`null`) in `sequence`, in order | 1 + the `tray` index put there                |
 * | `sort1`, `sort2`, `sort` | item, in order             | 1 + the bin index (`sort2`: bin = 2 × row + col)   |
 * | `shapes3`          | square, row by row (9)           | 1 + the `symbols` index                            |
 * | `cage4`, `cage5`   | square, row by row (16, 25)      | the number 1..n                                    |
 * | `nono5`            | square, row by row (25)          | 1 filled, 2 marked empty (a mark counts as empty)  |
 * | `logic3`, `logic4` | row (person), in order           | 1 + the `cols` index they are matched with         |
 * | `balance`          | weight, in order                 | 1 on the pan, 0 off                                |
 *
 * Because a sort's response is one bin per item by position, an item can be placed at most once:
 * a second placement would be an extra cell, which no response of the right length can hold.
 * Givens (`shapes3`, and `cage4`/`cage5` when they have them) are written in the response's own
 * values, 0 for an open square, and a response must repeat them unchanged.
 *
 * ## What the client can judge, and what only the server can (the sort split)
 *
 * A lock's rules are part of its view: cages, clues, run clues, the weight, the shown repeat. So
 * `checkLock(view, r)` judges everything the view shows, and the surface can mark a broken rule
 * without the server revealing anything. A sort is the exception: which bin an item belongs in IS
 * the answer, so it stays on the server (`fits`, never in the view). For `sort1`, `sort2` and `sort`
 * `checkLock` can report only the unplaced items (`empty`), never a wrong bin, and its `ok` means
 * "complete, as far as the view can see". The server's `isCorrect` adds `sortBroken(task.fits, …)`.
 *
 * ## Rule ids (`broken`), stable for the surface to highlight
 *
 * `row:r`, `col:c` (grids; for a logic grid `col:c` is an item given twice), `cage:i` (index into
 * `cages`), `clue:i` (index into `clues`), `blank:k` (a pattern blank, index into the response),
 * `sum` (balance), `item:i` (a sort item, server-only), and `response` (the response does not fit
 * the puzzle at all). Ids come in that order: rows, columns, cages, clues.
 *
 * A row, column or cage is judged only once it is full, except that a repeat in a row or column is
 * broken as soon as it is there. `empty` counts the places still blank (for a nonogram, the squares
 * still to fill across its rows; for a balance, 1 while the pan is empty).
 */

export const LOCK_PUZZLES = ["pattern", "sort1", "sort2", "shapes3", "balance", "cage4", "cage5", "logic3", "logic4", "nono5", "sort"] as const;
/** `sort` is the subject sort (science and vocabulary pools); `sort1`/`sort2` sort abstract shapes. */
export type LockPuzzle = (typeof LOCK_PUZZLES)[number];

/** The most cells any lock's response holds (a 5×5 grid). */
export const LOCK_MAX_CELLS = 25;

export const LOCK_SHAPES = ["circle", "square", "triangle", "star", "heart", "diamond"] as const;
export const LOCK_COLORS = ["red", "blue", "yellow", "green", "purple", "orange"] as const;
/** An abstract token drawn on the lock's face: patterns, shape sorts and the shape grid. */
export type LockShape = { shape: (typeof LOCK_SHAPES)[number]; color: (typeof LOCK_COLORS)[number]; size?: "big" | "small" };

/** A KenKen cage: its squares (row-major indexes), operation and target. `-` and `÷` take two squares, `=` one. */
export type LockCage = { cells: number[]; op: "+" | "-" | "×" | "÷" | "="; target: number };

/** A logic-grid clue: row `a[0]` is (or is not) matched with column `a[1]`, with the words shown. */
export type LogicClue = { type: "is" | "isNot"; a: [number, number]; text: string };

/** A subject-sort item. Where it belongs is not here: that is the answer (`SortFits`). */
export type SortItem = { id: string; label: string };

/** K–1. A repeat of shapes with blanks (`null`), filled from the tray. */
export type PatternView = { puzzle: "pattern"; sequence: (LockShape | null)[]; tray: LockShape[] };
/** K–1. Shapes into bins by one stated attribute ("Red" | "Blue"). */
export type Sort1View = { puzzle: "sort1"; items: LockShape[]; bins: string[] };
/** 2–4. Shapes into a 2×2 grid of bins by two attributes; bin = 2 × row + col. */
export type Sort2View = { puzzle: "sort2"; items: LockShape[]; rows: [string, string]; cols: [string, string] };
/** 2–4. A 3×3 grid of three shapes, each once per row and column. */
export type Shapes3View = { puzzle: "shapes3"; symbols: LockShape[]; givens: number[] };
/** 2–4. Put weights on the pan to balance `target`; any set that sums to it is right. */
export type BalanceView = { puzzle: "balance"; weights: number[]; target: number; unit?: string };
/** 5–8. A 4×4 KenKen. */
export type Cage4View = { puzzle: "cage4"; cages: LockCage[]; givens?: number[] };
/** 9–12. A 5×5 KenKen. */
export type Cage5View = { puzzle: "cage5"; cages: LockCage[]; givens?: number[] };
/** 5–8. Three people, three items, clues; each person has one item. */
export type Logic3View = { puzzle: "logic3"; rows: string[]; cols: string[]; clues: LogicClue[] };
/** 9–12. Four people, four items. */
export type Logic4View = { puzzle: "logic4"; rows: string[]; cols: string[]; clues: LogicClue[] };
/** 9–12. A 5×5 nonogram: the run lengths of each row and column, top to bottom and left to right; `[]` for an empty line. */
export type Nono5View = { puzzle: "nono5"; rows: number[][]; cols: number[][] };
/** Science and vocabulary sorts from the pools: bin names and items, never which item goes where. */
export type SortView = { puzzle: "sort"; categories: string[]; items: SortItem[] };

/** What the lock's face is shown: the puzzle and every rule, never a solution or a sort's answer. */
export type LockView =
  | PatternView | Sort1View | Sort2View | Shapes3View | BalanceView | Cage4View | Cage5View | Logic3View | Logic4View | Nono5View | SortView;

export type LockViewOf<P extends LockPuzzle> = Extract<LockView, { puzzle: P }>;

export type SortPuzzle = "sort1" | "sort2" | "sort";
/** Server-only, on each sort: the bins (0-based indexes) each item may go in. Usually one; an item that honestly fits two lists both. */
export type SortFits = { fits: number[][] };

/** A lock's puzzle data as the server stores it: the view's fields, plus `fits` on a sort. */
export type LockPuzzleData = { [P in LockPuzzle]: P extends SortPuzzle ? LockViewOf<P> & SortFits : LockViewOf<P> }[LockPuzzle];

/** What the child hands back: one number per cell, 0 for blank (see the table above). */
export type LockResponse = { [P in LockPuzzle]: { puzzle: P; cells: number[] } }[LockPuzzle];

export type LockCheck = { ok: boolean; broken: string[]; empty: number };

const GRID_SIDE = { shapes3: 3, cage4: 4, cage5: 5, nono5: 5 } as const;

/** Whether a puzzle is one of the sorts: the ones whose answer (`fits`) only the server holds. */
export const isSort = (p: LockPuzzle): p is SortPuzzle => p === "sort1" || p === "sort2" || p === "sort";

/** How many cells a response to this view holds, and the largest value a cell may take. */
export function lockSize(v: LockView): { cells: number; max: number } {
  switch (v.puzzle) {
    case "pattern": return { cells: v.sequence.filter((s) => s === null).length, max: v.tray.length };
    case "sort1": return { cells: v.items.length, max: v.bins.length };
    case "sort2": return { cells: v.items.length, max: 4 };
    case "sort": return { cells: v.items.length, max: v.categories.length };
    case "shapes3": return { cells: 9, max: v.symbols.length };
    case "balance": return { cells: v.weights.length, max: 1 };
    case "cage4": case "cage5": return { cells: GRID_SIDE[v.puzzle] ** 2, max: GRID_SIDE[v.puzzle] };
    case "nono5": return { cells: 25, max: 2 };
    case "logic3": case "logic4": return { cells: v.rows.length, max: v.cols.length };
  }
}

const givensOf = (v: LockView): number[] | undefined =>
  v.puzzle === "shapes3" || v.puzzle === "cage4" || v.puzzle === "cage5" ? v.givens : undefined;

/** Whether `r` is a response to this puzzle: its puzzle, its size, whole numbers in range, the givens kept. */
export function responseFits(v: LockView, r: LockResponse): boolean {
  if (!r || r.puzzle !== v.puzzle || !Array.isArray(r.cells)) return false;
  const { cells, max } = lockSize(v);
  if (r.cells.length !== cells || cells === 0 || cells > LOCK_MAX_CELLS) return false;
  if (!r.cells.every((x) => Number.isInteger(x) && x >= 0 && x <= max)) return false;
  const givens = givensOf(v);
  return !givens || givens.every((g, i) => g === 0 || r.cells[i] === g);
}

/** Row-major lines of a `side`×`side` grid: rows then columns, each as cell indexes. */
function lines(side: number): { rows: number[][]; cols: number[][] } {
  const at = Array.from({ length: side }, (_, i) => i);
  return { rows: at.map((r) => at.map((c) => r * side + c)), cols: at.map((c) => at.map((r) => r * side + c)) };
}

/** Latin rows and columns: a line is broken once it repeats a value. */
function latinBroken(side: number, cells: number[]): string[] {
  const { rows, cols } = lines(side);
  const repeats = (line: number[]) => {
    const vs = line.map((i) => cells[i]).filter((x) => x !== 0);
    return new Set(vs).size !== vs.length;
  };
  return [...rows.flatMap((l, i) => (repeats(l) ? [`row:${i}`] : [])), ...cols.flatMap((l, i) => (repeats(l) ? [`col:${i}`] : []))];
}

/** Whether a full cage's values reach its target. `-` and `÷` read either way round. */
function cageHolds(c: LockCage, vs: number[]): boolean {
  switch (c.op) {
    case "=": return vs.length === 1 && vs[0] === c.target;
    case "+": return vs.reduce((a, b) => a + b, 0) === c.target;
    case "×": return vs.reduce((a, b) => a * b, 1) === c.target;
    case "-": return vs.length === 2 && Math.abs(vs[0] - vs[1]) === c.target;
    case "÷": {
      if (vs.length !== 2) return false;
      const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
      return lo > 0 && hi === lo * c.target;
    }
    default: return false;
  }
}

function checkGrid(v: Shapes3View | Cage4View | Cage5View, cells: number[]): LockCheck {
  const side = GRID_SIDE[v.puzzle];
  const broken = latinBroken(side, cells);
  if (v.puzzle !== "shapes3") {
    v.cages.forEach((c, i) => {
      if (!c.cells.every((j) => Number.isInteger(j) && j >= 0 && j < cells.length)) return void broken.push(`cage:${i}`);
      const vs = c.cells.map((j) => cells[j]);
      if (vs.every((x) => x !== 0) && !cageHolds(c, vs)) broken.push(`cage:${i}`);
    });
  }
  return done(broken, cells.filter((x) => x === 0).length);
}

/** The run lengths of filled squares along a line. */
function runs(line: number[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const x of line) {
    if (x === 1) n++;
    else if (n > 0) {
      out.push(n);
      n = 0;
    }
  }
  if (n > 0) out.push(n);
  return out;
}

const sameRuns = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkNonogram(v: Nono5View, cells: number[]): LockCheck {
  const { rows, cols } = lines(5);
  let short = 0;
  // A line short of its clue's total is unfinished, not wrong; one at or over it is judged.
  const judge = (line: number[], clue: number[] | undefined, id: string, out: string[], count: boolean) => {
    const want = (clue ?? []).filter((x) => x > 0);
    const total = want.reduce((a, b) => a + b, 0);
    const vs = line.map((i) => cells[i]);
    const filled = vs.filter((x) => x === 1).length;
    if (filled < total) {
      if (count) short += total - filled;
      return;
    }
    if (!sameRuns(runs(vs), want)) out.push(id);
  };
  const broken: string[] = [];
  rows.forEach((l, i) => judge(l, v.rows[i], `row:${i}`, broken, true));
  cols.forEach((l, i) => judge(l, v.cols[i], `col:${i}`, broken, false));
  return done(broken, short);
}

function checkLogic(v: Logic3View | Logic4View, cells: number[]): LockCheck {
  const broken: string[] = [];
  v.cols.forEach((_, c) => {
    if (cells.filter((x) => x === c + 1).length > 1) broken.push(`col:${c}`);
  });
  v.clues.forEach((clue, i) => {
    const [row, col] = clue.a;
    const has = cells[row] === col + 1;
    const holds = clue.type === "is"
      ? (cells[row] === 0 || has) && !cells.some((x, r) => r !== row && x === col + 1)
      : !has;
    if (!holds) broken.push(`clue:${i}`);
  });
  return done(broken, cells.filter((x) => x === 0).length);
}

function checkBalance(v: BalanceView, cells: number[]): LockCheck {
  if (cells.every((x) => x === 0)) return done([], 1);
  const sum = cells.reduce((a, x, i) => a + (x === 1 ? v.weights[i] : 0), 0);
  return done(sum === v.target ? [] : ["sum"], 0);
}

/**
 * The repeat is the shortest one the shown shapes allow: the smallest period `p` (shorter than the
 * sequence) at which no two shown shapes in the same place of the repeat differ. "A B C A _" repeats
 * every 3 (so B), and "A _ A _" every 1 (so A, not "A B A B": the shortest rule wins). A blank breaks
 * it when it differs from the shape shown at its place in the repeat, or, where none is shown, from
 * another filled blank there. So "A B _ A B _" takes any shape in both blanks, as long as they agree.
 * With no period possible at all the puzzle itself is broken (`repeat`).
 */
function checkPattern(v: PatternView, cells: number[]): LockCheck {
  const key = (s: LockShape) => `${s.shape}/${s.color}/${s.size ?? ""}`;
  const blanks = v.sequence.flatMap((s, i) => (s === null ? [i] : []));
  const empty = cells.filter((x) => x === 0).length;
  const len = v.sequence.length;
  const placesOf = (p: number) => Array.from({ length: p }, (_, r) => Array.from({ length: Math.ceil((len - r) / p) }, (_, k) => r + k * p));
  const shownAt = (place: number[]) => [...new Set(place.flatMap((i) => (v.sequence[i] ? [key(v.sequence[i]!)] : [])))];
  let places: number[][] | null = null;
  for (let p = 1; p < len && !places; p++) if (placesOf(p).every((place) => shownAt(place).length <= 1)) places = placesOf(p);
  if (!places) return done(["repeat"], empty);

  const filledWith = (i: number): string | null => {
    const pick = cells[blanks.indexOf(i)];
    return pick > 0 && v.tray[pick - 1] ? key(v.tray[pick - 1]) : null;
  };
  const broken = new Set<number>();
  for (const place of places) {
    const want = shownAt(place)[0];
    const filled = place.filter((i) => v.sequence[i] === null && filledWith(i) !== null);
    for (const i of filled) {
      const clash = want !== undefined ? filledWith(i) !== want : filled.some((j) => filledWith(j) !== filledWith(i));
      if (clash) broken.add(blanks.indexOf(i));
    }
  }
  return done([...broken].sort((a, b) => a - b).map((k) => `blank:${k}`), empty);
}

const done = (broken: string[], empty: number): LockCheck => ({ ok: broken.length === 0 && empty === 0, broken, empty });

/**
 * Judge a response against what the view shows (see the module note). Pure: the lock's face calls
 * it to mark broken rules, and the server calls it inside `isCorrect`.
 */
export function checkLock(v: LockView, r: LockResponse): LockCheck {
  if (!responseFits(v, r)) return { ok: false, broken: ["response"], empty: 0 };
  const cells = r.cells;
  if (isSort(v.puzzle)) return done([], cells.filter((x) => x === 0).length);
  switch (v.puzzle) {
    case "pattern": return checkPattern(v, cells);
    case "shapes3": case "cage4": case "cage5": return checkGrid(v, cells);
    case "nono5": return checkNonogram(v, cells);
    case "logic3": case "logic4": return checkLogic(v, cells);
    case "balance": return checkBalance(v, cells);
    default: return { ok: false, broken: ["response"], empty: 0 };
  }
}

/** Server-side, for a sort: each placed item outside the bins it fits (`item:i`). Unplaced items are `empty`, not broken. */
export function sortBroken(fits: readonly (readonly number[])[], cells: readonly number[]): string[] {
  return cells.flatMap((x, i) => (x !== 0 && !(fits[i] ?? []).includes(x - 1) ? [`item:${i}`] : []));
}
