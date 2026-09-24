/**
 * THE ROAD'S LAMPS — where a hero's lifetime gleams go (spec D12.2).
 *
 * The spec lit "the road's lamp posts" of the flat 64-unit village, one per 25 lifetime gleams,
 * and counted them from that village's seeded lanterns. The island has no such row: its few
 * lanterns stand alone at places. So the Ring gets a road of its own to light — the one it runs
 * out along first:
 *
 *   - **The west road**, from the cobbles beside the arch, out past the last houses and along the
 *     track to the Ringstones, whose own lantern already burns at the far end. It is the road a
 *     lap starts down, so a child running the Ring runs past every lamp they have lit, and the
 *     first lamp stands a few steps west of the arch, where it can be seen from the spawn.
 *   - **In road order**, nearest the village first: progress grows OUTWARD along the road, and a
 *     child can see how far their light has got.
 *   - **Twelve lamps.** 300 gleams light the whole road — a season of recesses, not a year — and
 *     one lamp lit of twelve is a real, visible step (the spec's open question 6: "if one lit lamp
 *     does not show, the honest fix is fewer lamps"). The jar (1000) is the longer arc.
 *   - **On the south side of the track**, the side the child comes from: clear of every wall,
 *     tree and stone with the village at its biggest (`lamps.test.ts`), on dry ground, a step off
 *     the Ring's line, and never inside a course post's ring.
 *   - **Never solid** (D12.13): nothing here can wedge a child.
 *
 * Purely cosmetic: a lit lamp unlocks nothing, gates nothing, and is never spent (D12.2).
 *
 * Pure: no three.js. The positions are fixed for everyone — the Ring is the same road for every
 * hero — and only how many are lit is a hero's own.
 */

import { pointAlong, routeLength, VILLAGE_TRACKS } from "../travel";
import { POSTS, type Vec2 } from "./course";

/** How many lamps stand along the road. 12 × 25 = 300 gleams to light the whole road. */
export const LAMP_COUNT = 12;
/** How far apart they stand along the road. */
export const LAMP_SPACING = 3.5;
/** The first lamp's distance along the west track from where it leaves the cobbles (x = 0, z = 4). */
export const LAMP_FIRST = 5.5;
/** How far to the side of the track a lamp stands: out of the way of a runner, near enough to read as "the road's". */
export const LAMP_SIDE = 2.2;
/** A lamp never stands this close to a course post: the post's own ring and lantern would crowd it. */
export const LAMP_POST_GAP = 3.5;

export type RoadLamp = {
  /** 0-based, in road order: lamp 0 is the first to light. */
  index: number;
  x: number;
  z: number;
};

/** The west track, from where it leaves the cobbles: the road the Ring runs out along first. */
function westRoad(): Vec2[] {
  // VILLAGE_TRACKS.ringstones starts at the hub on the cobbles and turns west at (0, 4).
  return VILLAGE_TRACKS.ringstones.slice(1);
}

/**
 * The lamps, in the order they light. Every `LAMP_SPACING` along the west road from `LAMP_FIRST`,
 * on its south side, skipping any spot that would crowd a course post.
 */
export function roadLamps(): RoadLamp[] {
  const road = westRoad();
  const len = routeLength(road);
  const out: RoadLamp[] = [];
  for (let d = LAMP_FIRST; out.length < LAMP_COUNT && d <= len; d += LAMP_SPACING) {
    const { p, dir } = pointAlong(road, d);
    // South of a westward road: the left-hand normal of its direction, (dir.z, -dir.x), flipped.
    const x = p.x + dir.z * LAMP_SIDE;
    const z = p.z - dir.x * LAMP_SIDE;
    if (POSTS.some((q) => Math.hypot(q.position.x - x, q.position.z - z) < LAMP_POST_GAP)) continue;
    out.push({ index: out.length, x, z });
  }
  return out;
}

let shared: RoadLamp[] | null = null;
/** The one row of lamps, memoised. */
export function ringLamps(): readonly RoadLamp[] {
  return (shared ??= roadLamps());
}
