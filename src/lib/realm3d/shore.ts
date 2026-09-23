/**
 * THE EDGE OF THE WATER — how a child is stopped by the sea without being stopped by a wall.
 *
 * ## The problem, and why the obvious answer is a bug
 *
 * The realm is an island. Something has to stop an eight-year-old walking west until the ground
 * runs out. The cheap answer is an invisible wall at the waterline, and every child who has ever
 * met one knows exactly what it is: the game stopped working. They push against it, they try to
 * find the gap, and they learn that the sea is scenery painted on a barrier.
 *
 * So the rule here is about the GROUND, not about a line on the map:
 *
 *   - you may walk into water up to `WADE_DEPTH` below the surface — a bit over knee-deep on a
 *     2.3-unit hero, which is a real thing to do: you stand in the shallows, the water is drawn
 *     over your boots, you can follow the beach out round a sandbar;
 *   - you may not take a step whose destination is DEEPER than that. Not "you may not cross this
 *     line" — the test is on the ground you would arrive at, so what refuses you is the drop-off.
 *
 * And it is refused axis by axis, exactly as `slideMove` refuses a wall, which is the whole
 * difference in feel: walking straight out to sea stops you, walking at the water at an angle
 * slides you ALONG the shore. A child pushing at the sea gets a beach walk, not a buzzer.
 *
 * The same rule does the lakes and the tarn for free, because inland water in this realm is the
 * same surface at the same level as the sea — it is simply ground that went below it.
 *
 * ## Deliberately NOT a three.js module
 *
 * The scene runs this inside `useFrame`; it has to be testable with no WebGL, and it allocates
 * nothing — the result is written into a caller-owned point.
 */

import { SEA_LEVEL } from "./worldgen";

export type Pt = { x: number; z: number };

/**
 * How far below the waterline a child will go before the ground refuses them.
 *
 * 1.3 on a 2.3-unit hero is mid-thigh: unmistakably IN the water — the wading is visible from
 * the camera, the walk slows, the surface cuts across the legs — and still plainly a paddle
 * rather than a swim. Deeper and the figure is a head floating on a plane, which is worse than
 * being stopped; shallower and the beach is one stride wide and reads as a line, not a shore.
 */
export const WADE_DEPTH = 1.3;

/** How deep the water is at a point, 0 on dry land. */
export function waterDepth(groundY: number, sea: number = SEA_LEVEL): number {
  return groundY < sea ? sea - groundY : 0;
}

/** True when the ground here is deeper than a child will wade. */
export function tooDeep(groundY: number, sea: number = SEA_LEVEL, wade: number = WADE_DEPTH): boolean {
  return groundY < sea - wade;
}

/**
 * One frame of motion against the water, resolved axis by axis so that a blocked axis is dropped
 * and the other still runs. Writes into `out` and returns it; allocates nothing.
 *
 * `groundAt` is the terrain height function — the SAME one the mesh was built from, or the child
 * will be refused somewhere the water does not look deep.
 *
 * A step is only ever refused for being too deep, never for being wet, and a hero who is already
 * out of their depth (dropped there, or the ground moved) is never frozen: if both axes are
 * refused we let the whole step through, because being stuck in the sea is the one outcome worse
 * than swimming.
 */
/** `tooDeep` at a point, against a level that may vary. A plain function: no closure per call. */
function deepAt(
  x: number,
  z: number,
  groundAt: (x: number, z: number) => number,
  sea: number | ((x: number, z: number) => number),
  wade: number,
): boolean {
  return tooDeep(groundAt(x, z), typeof sea === "number" ? sea : sea(x, z), wade);
}

export function shoreMove(
  out: Pt,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  groundAt: (x: number, z: number) => number,
  sea: number | ((x: number, z: number) => number) = SEA_LEVEL,
  wade: number = WADE_DEPTH,
): Pt {
  // The surface is one number for the sea, and a function where the realm has water standing
  // above it in a basin of its own (Longwater, the millstream, the mill pool). Both are the same
  // rule: what refuses you is the ground being too far under the water that is actually there.
  const stuck = deepAt(fromX, fromZ, groundAt, sea, wade);
  let x = toX;
  if (!stuck && deepAt(x, fromZ, groundAt, sea, wade)) x = fromX;
  let z = toZ;
  if (!stuck && deepAt(x, z, groundAt, sea, wade)) z = fromZ;
  out.x = x;
  out.z = z;
  return out;
}

/**
 * What the water does to a child's pace, as a multiplier on walking speed.
 *
 * Wading has to COST something or the shallows are just differently-coloured grass. It is also
 * the only warning a child gets that they are running out of shore, and a slowdown they can feel
 * under their hands is a kinder warning than a stop they cannot predict. Down to 45% at the
 * deepest a child may go — slow enough to feel like water, quick enough that walking back out is
 * not a punishment.
 */
export function wadeSpeed(depth: number, wade: number = WADE_DEPTH): number {
  if (depth <= 0) return 1;
  const t = Math.min(1, depth / wade);
  return 1 - 0.55 * t;
}
