/**
 * THE RULES OF A ROOM — walking, reaching, leaving and looking, indoors.
 *
 * The island's collision (`collision.ts`) is a horizontal solver that ignores how high a solid
 * STARTS: a wall is a wall from the ground up. That is right outdoors, where nothing hangs over
 * anyone's head, and wrong in a room with a gallery or a lookout floor: the hero must walk UNDER
 * the lookout and still be stopped by its rail once up on it. So a room blocks only what is
 * between the hero's feet and the top of their head (`roomBlocks`), and everything else — stepping
 * up a stair, landing on a pew, `pushOut`, gravity — is the island's own arithmetic, unchanged.
 *
 * The camera needs none of the island's boom tricks: a room is cut away instead. Every wall
 * between the camera and the room's middle is hidden (`hiddenWalls`), so the camera can sit
 * outside the room, look in over the knee-high course, and never fight a wall.
 *
 * Not a three.js module, and nothing here allocates per frame.
 */

import { overlaps, STEP_UP, HERO_RADIUS, type Collider, type Pt } from "./collision";
import type { LookLimits } from "./controls";
import { DOOR_PUSH } from "./doorways";
import type { InteractSpot } from "./interact";
import { edgeDistance, RELEASE_MARGIN, SWITCH_MARGIN } from "./interact";
import type { RoomPlan, WallSide } from "./interiors";

/** The hero, head to toe. A solid that starts above this over the feet is walked under. */
export const HERO_HEIGHT = 2.3;

/** Does solid `c` stop a hero at (x, z) whose feet are at `feetY`? */
export function roomBlocks(c: Collider, x: number, z: number, r: number, feetY: number): boolean {
  if (feetY >= c.top - STEP_UP) return false; // on top of it, or stepping up onto it
  if (feetY + HERO_HEIGHT <= c.base) return false; // over the hero's head
  return overlaps(c, x, z, r);
}

function anyRoomBlock(solids: readonly Collider[], x: number, z: number, r: number, feetY: number): boolean {
  for (let i = 0; i < solids.length; i++) if (roomBlocks(solids[i], x, z, r, feetY)) return true;
  return false;
}

/** `slideMove`, with head room: one axis at a time, so a wall is slid along rather than stuck to. */
export function roomSlide(out: Pt, fromX: number, fromZ: number, toX: number, toZ: number, solids: readonly Collider[], r: number, feetY: number): Pt {
  let x = toX;
  if (anyRoomBlock(solids, x, fromZ, r, feetY)) x = fromX;
  let z = toZ;
  if (anyRoomBlock(solids, x, z, r, feetY)) z = fromZ;
  out.x = x;
  out.z = z;
  return out;
}

/** Is a hero at (x, z) standing inside something solid at their own height? The spawn test. */
export function roomBuried(solids: readonly Collider[], x: number, z: number, feetY: number, r: number = HERO_RADIUS): boolean {
  return anyRoomBlock(solids, x, z, r - 0.05, feetY);
}

/**
 * Is the hero walking out of the door? The door is in the south wall at `plan.door`; walking
 * into it (south, +z) with the body at the wall is leaving, as walking into a door outside is
 * arriving.
 */
export function leavingRoom(plan: Pick<RoomPlan, "D" | "door">, x: number, z: number, mz: number, feetY: number, r: number = HERO_RADIUS): boolean {
  if (mz < DOOR_PUSH || feetY > 0.6) return false;
  if (Math.abs(x - plan.door.x) > plan.door.hw) return false;
  // A step's width from the wall: the solver stops a walker up to one frame's step short of it.
  return z + r > plan.D / 2 - 0.55;
}

/* ------------------------------------------------------------------ what E reaches */

/** Which floor each spot is on, in the same order as the spots. */
export type RoomSpots = { spots: InteractSpot[]; floors: number[] };

/**
 * Three things to press E at in a room: whoever keeps it, the one thing in it to use, and the way
 * out. Built once per room; each spot carries its own prebuilt target, as the island's do.
 */
export function roomSpots(plan: RoomPlan, keeperName: string | null): RoomSpots {
  const spots: InteractSpot[] = [];
  const floors: number[] = [];
  if (plan.keeper && keeperName) {
    spots.push({ target: { kind: "villager", id: plan.keeper.villager, label: keeperName }, x: plan.keeper.x, z: plan.keeper.z, hw: 0.45, hd: 0.45, round: true, reach: 1.8, bias: 0.6, ring: 0.95 });
    floors.push(0);
  }
  const f = plan.fixture;
  spots.push({ target: { kind: "fixture", id: f.id, label: f.label, verb: f.verb }, x: f.x, z: f.z, hw: f.r, hd: f.r, round: true, reach: 1.5, bias: 0.3, ring: f.r + 0.55 });
  floors.push(f.floor);
  spots.push({ target: { kind: "door", id: "door", label: "outside", verb: "Go" }, x: plan.door.x, z: plan.D / 2, hw: plan.door.hw, hd: 0.2, round: false, reach: 1.4, bias: 0, ring: plan.door.hw + 0.4 });
  floors.push(0);
  return { spots, floors };
}

/** How far above or below a spot's floor a child can be and still reach it. */
export const LEVEL_REACH = 1.1;

/**
 * `pickSpot`, with floors: a telescope on the lookout is not in reach of a child standing under
 * it. Sticky in the same way — the current choice is held until something beats it by a margin.
 */
export function pickRoomSpot(rs: RoomSpots, x: number, z: number, feetY: number, current: number): number {
  const { spots, floors } = rs;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < spots.length; i++) {
    if (Math.abs(feetY - floors[i]) > LEVEL_REACH) continue;
    const s = spots[i];
    const d = edgeDistance(s, x, z);
    if (d > s.reach) continue;
    const score = d - s.bias;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (current >= 0 && current < spots.length && Math.abs(feetY - floors[current]) <= LEVEL_REACH) {
    const c = spots[current];
    const d = edgeDistance(c, x, z);
    if (d <= c.reach + RELEASE_MARGIN) {
      if (best < 0 || best === current) return current;
      if (bestScore > d - c.bias - SWITCH_MARGIN) return current;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ the cutaway */

export type Hidden = Record<WallSide, boolean>;

export function makeHidden(): Hidden {
  return { n: false, s: false, e: false, w: false };
}

/**
 * Which walls to cut away with the camera at (cx, cz), room-local. A wall goes as soon as the
 * camera is within `margin` of its inside face or anywhere past it, so the lens is never inside
 * a wall and never looking at the back of one. Writes into `out`; returns whether anything changed.
 */
export function hiddenWalls(out: Hidden, plan: Pick<RoomPlan, "W" | "D">, cx: number, cz: number, margin = 0.6): boolean {
  const n = cz < -plan.D / 2 + margin;
  const s = cz > plan.D / 2 - margin;
  const w = cx < -plan.W / 2 + margin;
  const e = cx > plan.W / 2 - margin;
  const changed = n !== out.n || s !== out.s || w !== out.w || e !== out.e;
  out.n = n;
  out.s = s;
  out.w = w;
  out.e = e;
  return changed;
}

/* ------------------------------------------------------------------ the camera */

/** The indoor boom: in closer than the island's, and never so low it looks under a table. */
export const ROOM_PITCH = 0.72;
export const ROOM_PITCH_MIN = 0.3;
export const ROOM_PITCH_MAX = 1.35;
export const ROOM_DIST = 12;
export const ROOM_DIST_MIN = 6;
export const ROOM_DIST_MAX = 22;

export function clampRoomPitch(p: number): number {
  return p < ROOM_PITCH_MIN ? ROOM_PITCH_MIN : p > ROOM_PITCH_MAX ? ROOM_PITCH_MAX : p;
}

export function clampRoomDist(d: number): number {
  return d < ROOM_DIST_MIN ? ROOM_DIST_MIN : d > ROOM_DIST_MAX ? ROOM_DIST_MAX : d;
}

/** The room's look limits, for the one mouse input the island and the rooms share (`lookBy`, `zoomBy`). */
export const ROOM_LOOK: LookLimits = { pitchMin: ROOM_PITCH_MIN, pitchMax: ROOM_PITCH_MAX, distMin: ROOM_DIST_MIN, distMax: ROOM_DIST_MAX };
