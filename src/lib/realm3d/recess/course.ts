/**
 * THE RING — recess's lap course on the 3D island.
 *
 * The flat Realm's lap was eight points on a ±12 ring round a 40-unit lawn, and a later re-plot of
 * the village put two of them on buildings. The "recess that counts" spec
 * (`docs/superpowers/specs/2026-09-10-realm-recess-that-counts-design.md`) moved it onto the flat
 * village's road graph; the 3D island has no such graph inside the village, only the five tracks
 * out to the five authored places. So the Ring is laid on the island as it really is:
 *
 *   - **It starts and ends at an arch in the village**, across the cobbles nine steps in front of
 *     where every visit starts (the spawn looks north up the cobbles, so the arch is square in
 *     front of the camera, never behind it). A lap goes through it northward, out and home.
 *   - **Out along the west track** to the Ringstones, **across the fell** to Highcairn, **behind the
 *     castle**, **round the far side of Longwater**, down to **Farfurrow**, across the fields to
 *     **Appleway**, and **home up the south road** into the village. Every one of the five places
 *     is on it, so a lap is also a tour: "a gleam out by Longwater is a reason to go to Longwater".
 *   - **Every leg is a straight run a child can hold W down for**: `course.test.ts` walks every
 *     segment against the village at its biggest (every building raised, the citadel standing) and
 *     every tree and stone on the island, for the walker's body and a rider's, and against the
 *     water. A re-plot that puts something across the Ring fails there, not in front of a child.
 *   - **The lap is budgeted, not accidental** (spec D12.5): 35–48 s on foot at the island's walking
 *     pace, so one lap is about a ninth of a five-minute visit. The same test guards it. A mount's
 *     job is real here too (D5): a Wyrm runs it in about eighteen seconds.
 *
 * Posts are named for where they stand, so the HUD can say where the next one is. `COURSE_ID`
 * is the version of the road: move a post and bump it, and every stored best becomes a record on
 * a course that no longer exists — `mergeRecess` (`lib/realm/recess/record.ts`) then clears the
 * bests with a message rather than letting an old time stand on a new road (D12.12).
 *
 * Pure: no three.js, no world. The world is only read by the test that proves the Ring is clear.
 */

import { rideSpeed, ISLAND_WALK } from "../riding";
import { MOUNTS } from "@/lib/utils/avatar-catalog";

export type Vec2 = { x: number; z: number };

export type CoursePost = {
  /** 0-based, in running order. The HUD says "post 1" for index 0. */
  index: number;
  id: string;
  /** Where it stands, for a sentence: "the Ringstones", "behind the castle". */
  name: string;
  position: Vec2;
};

export type LapCourse = {
  id: string;
  /** The arch: the start and the finish line. */
  arch: Vec2;
  posts: readonly CoursePost[];
  /** The whole closed polyline a lap runs, arch → posts → the village corners → arch. */
  path: readonly Vec2[];
  /** Distance along `path` at each of its points (`cum[0] = 0`, the last is `lengthUnits`). */
  cum: readonly number[];
  /** Distance along `path` at each post, in post order. */
  postAt: readonly number[];
  lengthUnits: number;
};

/** Bump whenever a post, the arch or a corner moves: stored bests are bests on THIS road. */
export const COURSE_ID = "island-ring-1";
/** How close to a post counts as passing it. The island is run at 11 units a second. */
export const POST_RADIUS = 3;
/** The arch is a little wider: it is also the finish line, and it spans the lane. */
export const ARCH_RADIUS = 3.5;
/** The arch's pillars stand this far east and west of its middle, either side of the cobbles. */
export const ARCH_HALF_SPAN = 2.6;
export const COURSE_MIN_SECONDS = 35;
export const COURSE_MAX_SECONDS = 48;

/**
 * Across the cobbles where the lanes cross, between the well and the mill: nine steps straight in
 * front of the spawn, square to the camera, so the first thing a child sees is the gate the Ring
 * starts through. Every lap goes through it northward: out from the spawn side, and home the same
 * way, up the south road.
 */
export const ARCH: Vec2 = { x: 0, z: 5 };

/** The eight posts, in running order. Each stands on open ground a lap reaches in a straight run. */
export const POSTS: readonly CoursePost[] = [
  { index: 0, id: "west-track", name: "the west track", position: { x: -30, z: 2.6 } },
  { index: 1, id: "ringstones", name: "the Ringstones", position: { x: -54, z: 0 } },
  { index: 2, id: "highcairn", name: "Highcairn", position: { x: -32, z: -38 } },
  { index: 3, id: "castle-back", name: "behind the castle", position: { x: 6, z: -52 } },
  { index: 4, id: "far-shore", name: "the far shore of Longwater", position: { x: 38, z: -66 } },
  { index: 5, id: "east-bank", name: "the east end of Longwater", position: { x: 70, z: -56 } },
  { index: 6, id: "farfurrow", name: "Farfurrow", position: { x: 56, z: -2 } },
  { index: 7, id: "appleway", name: "Appleway", position: { x: -3, z: 57 } },
];

/**
 * Home from Appleway: up the south road to the gate, onto the cobbles and north through the arch —
 * the way the village's own south track comes in.
 */
const HOME: readonly Vec2[] = [
  { x: 0, z: 19 },
  { x: 0, z: 13 },
];

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function courseLength(path: readonly Vec2[]): number {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++) n += dist(path[i], path[i + 1]);
  return n;
}

/** The Ring. Built once; every caller (the scene, the HUD, the server's check) reads the same one. */
export function buildLapCourse(): LapCourse {
  const path: Vec2[] = [ARCH, ...POSTS.map((p) => p.position), ...HOME, ARCH];
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  return {
    id: COURSE_ID,
    arch: ARCH,
    posts: POSTS,
    path,
    cum,
    // Post i is path point i + 1.
    postAt: POSTS.map((_, i) => cum[i + 1]),
    lengthUnits: cum[cum.length - 1],
  };
}

let shared: LapCourse | null = null;
/** The one course, memoised. */
export function ringCourse(): LapCourse {
  return (shared ??= buildLapCourse());
}

/** How long a lap takes at an even `speed` (units a second), following the path exactly. */
export function expectedLapSeconds(course: LapCourse, speed: number): number {
  return course.lengthUnits / speed;
}

/** The island's walking pace and the fastest mount's riding pace, in units a second. */
export const WALK_SPEED = ISLAND_WALK;
export const MAX_RIDE_SPEED = Math.max(...MOUNTS.map((m) => rideSpeed(m)));

/**
 * The fastest a lap could physically be: the whole path at the fastest mount's pace, less a fifth
 * for corners cut and a run-up through the arch. A time under this did not happen (a jumped
 * clock, or a made-up request), and the server refuses it.
 */
export function minLapMs(course: LapCourse): number {
  return Math.floor((course.lengthUnits / MAX_RIDE_SPEED) * 1000 * 0.8);
}

/** A point `d` along the course path (wrapped to one lap), written into `out`. No allocation. */
export function pointAt(course: LapCourse, d: number, out: Vec2): Vec2 {
  const L = course.lengthUnits;
  let t = d % L;
  if (t < 0) t += L;
  const { path, cum } = course;
  for (let i = 0; i < path.length - 1; i++) {
    if (t <= cum[i + 1] || i === path.length - 2) {
      const seg = cum[i + 1] - cum[i];
      const f = seg > 0 ? Math.min(1, (t - cum[i]) / seg) : 0;
      out.x = path[i].x + (path[i + 1].x - path[i].x) * f;
      out.z = path[i].z + (path[i + 1].z - path[i].z) * f;
      return out;
    }
  }
  out.x = path[0].x;
  out.z = path[0].z;
  return out;
}

/**
 * How far along the course a point is, 0..1, by the nearest segment — searched only from the leg
 * the hero is on (`fromPost`, the next post's index) back one, so a point on the home straight is
 * never mistaken for the start that it runs past.
 */
export function progressAlong(course: LapCourse, p: Vec2, nextPost = 0): number {
  const { path, cum } = course;
  // Path point i + 1 is post i; the leg INTO the next post starts at path point `nextPost`.
  const first = Math.max(0, nextPost - 1);
  const last = nextPost >= course.posts.length ? path.length - 2 : nextPost;
  let best = Infinity;
  let at = 0;
  for (let i = first; i <= last; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2)) : 0;
    const dx = a.x + vx * t - p.x;
    const dz = a.z + vz * t - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      at = cum[i] + (cum[i + 1] - cum[i]) * t;
    }
  }
  return at / course.lengthUnits;
}

/** The post the hero must reach next, or null once every post is passed (the arch is next). */
export function nextPost(course: LapCourse, passed: number): CoursePost | null {
  return passed >= 0 && passed < course.posts.length ? course.posts[passed] : null;
}
