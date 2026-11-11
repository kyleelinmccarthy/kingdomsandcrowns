/**
 * THE BENCH'S DRAWING OF THE SITE — the front of the building, going up a piece per right answer.
 *
 * The villager's board covers the world during a side quest, so the bench carries its own small
 * elevation of the site (ruling R-C1): what already stands at the run's stage (`benchBase`), and the
 * pieces this run lays, in order (`benchPieces`), one for each bench task solved. The world's site
 * rises a stage when the board closes, as it always has; these are the same stages
 * (`site-stages.ts`) seen from the front:
 *
 *   to stage 1: the stone footing, two courses, the doorway left open;
 *   to stage 2: a sill on each run of footing, then the posts: corners, door posts, studs;
 *   to stage 3: the top plate across the posts (it is the lintel over the door), a corner brace
 *               each side, and a scaffold with its ladder beside the house;
 *   to stage 4: the roof frame: a king post on the plate, the ridge on it, a rafter each side;
 *   to finished: boards on the walls and the roof.
 *
 * A finished building is drawn whole, its scaffold gone, and a run there puts up a repair scaffold
 * and mends a board or two. Every piece rests on the ground or on a piece laid before it.
 *
 * Pure data, in the drawing's own units: x across, y up from the ground. Not a three.js module.
 */
import { SITE_STAGES, type PieceKind } from "./site-stages";

export type BenchShape =
  | { type: "box"; x: number; y: number; w: number; h: number }
  /** A timber at a slant (a brace, a rafter, a ladder), `t` thick, from one end to the other. */
  | { type: "strut"; x1: number; y1: number; x2: number; y2: number; t: number };

export type BenchPiece = {
  kind: PieceKind;
  /** What the piece is, for a screen reader ("a corner post"). */
  label: string;
  shape: BenchShape;
  /** Scaffolding comes down once the building is finished. */
  scaffold?: true;
};

/** The drawing's size, for its view box. */
export const BENCH_ELEVATION = { width: 250, height: 170 } as const;

const box = (kind: PieceKind, label: string, x: number, y: number, w: number, h: number): BenchPiece => ({ kind, label, shape: { type: "box", x, y, w, h } });
const strut = (kind: PieceKind, label: string, x1: number, y1: number, x2: number, y2: number, t: number): BenchPiece => ({
  kind, label, shape: { type: "strut", x1, y1, x2, y2, t },
});
const scaffold = (p: BenchPiece): BenchPiece => ({ ...p, scaffold: true });

// The house's front runs from x 50 to 190, with the doorway from 106 to 134.
const PAD_TOP = 3;
const COURSE = 6;
const FOOT_TOP = PAD_TOP + 2 * COURSE;
const SILL_TOP = FOOT_TOP + 5;
const POST_W = 5;
const PLATE_Y = 100;
const PLATE_TOP = PLATE_Y + 6;
const RIDGE_Y = 150;

const PAD = box("pad", "the levelled ground", 40, 0, 160, PAD_TOP);

const stone = (label: string, x: number, w: number, course: 0 | 1) => box("stone", label, x, PAD_TOP + course * COURSE, w, COURSE);
const FOOTING: BenchPiece[] = [
  stone("a corner stone", 50, 28, 0), stone("a footing stone", 78, 28, 0), stone("a footing stone", 134, 28, 0), stone("a corner stone", 162, 28, 0),
  // The second course is laid across the joints of the first, the way a mason bonds a wall.
  stone("a corner stone", 50, 14, 1), stone("a footing stone", 64, 28, 1), stone("a footing stone", 92, 14, 1),
  stone("a footing stone", 134, 14, 1), stone("a footing stone", 148, 28, 1), stone("a corner stone", 176, 14, 1),
];

const post = (label: string, x: number) => box("post", label, x, SILL_TOP, POST_W, PLATE_Y - SILL_TOP);
const FRAME: BenchPiece[] = [
  box("sill", "a sill beam", 50, FOOT_TOP, 56, SILL_TOP - FOOT_TOP), box("sill", "a sill beam", 134, FOOT_TOP, 56, SILL_TOP - FOOT_TOP),
  post("a corner post", 50), post("a corner post", 185), post("a door post", 101), post("a door post", 134), post("a stud", 75), post("a stud", 160),
];

const SCAFFOLD_TOP = 62;
const SCAFFOLD: BenchPiece[] = [
  box("post", "a scaffold leg", 204, 0, 4, SCAFFOLD_TOP), box("post", "a scaffold leg", 226, 0, 4, SCAFFOLD_TOP),
  box("board", "a scaffold plank", 200, SCAFFOLD_TOP, 34, 4),
  strut("ladder", "a ladder", 242, 0, 234, SCAFFOLD_TOP + 4, 4),
].map(scaffold);

const PLATES: BenchPiece[] = [
  box("plate", "the top plate", 50, PLATE_Y, 140, PLATE_TOP - PLATE_Y),
  strut("brace", "a corner brace", 66, SILL_TOP, 55, SILL_TOP + 22, 4), strut("brace", "a corner brace", 174, SILL_TOP, 185, SILL_TOP + 22, 4),
  ...SCAFFOLD,
];

const ROOF: BenchPiece[] = [
  box("post", "a king post", 117.5, PLATE_TOP, POST_W, RIDGE_Y - PLATE_TOP),
  box("ridge", "the ridge beam", 113, RIDGE_Y, 14, 6),
  strut("rafter", "a rafter", 50, PLATE_TOP, 120, RIDGE_Y + 6, 5), strut("rafter", "a rafter", 190, PLATE_TOP, 120, RIDGE_Y + 6, 5),
];

const wallBoard = (label: string, x: number) => box("board", label, x, SILL_TOP, 46, PLATE_Y - SILL_TOP);
const roofBoard = (label: string, x: number) => strut("board", label, x, PLATE_TOP, 120, RIDGE_Y + 10, 8);
const FINISH: BenchPiece[] = [wallBoard("a wall board", 55), wallBoard("a wall board", 139), roofBoard("a roof board", 50), roofBoard("a roof board", 190)];

const REPAIR: BenchPiece[] = [...SCAFFOLD, roofBoard("a new roof board", 190), wallBoard("a new wall board", 139)];

/** What each stage's run lays, from stage 0 (a bare pad) to stage 4 (the roof frame, to be boarded). */
const GROUPS = [FOOTING, FRAME, PLATES, ROOF, FINISH];

const clampStage = (stage: number) => Math.min(SITE_STAGES - 1, Math.max(0, Math.floor(stage) || 0));

/** What already stands on the site at `stage`; a finished building whole, without its scaffold. */
export function benchBase(stage: number, complete: boolean): BenchPiece[] {
  if (complete) return [PAD, ...GROUPS.flat()].filter((p) => !p.scaffold);
  return [PAD, ...GROUPS.slice(0, clampStage(stage)).flat()];
}

/** The pieces a run at `stage` lays, in order, one per bench task solved; at a finished building, the repair. */
export function benchPieces(stage: number, complete: boolean): BenchPiece[] {
  return complete ? REPAIR : GROUPS[clampStage(stage)];
}
