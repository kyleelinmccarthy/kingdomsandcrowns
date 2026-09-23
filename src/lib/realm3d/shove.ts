/**
 * A SHOVE — the hero moved by something that is not the child's hands: a blob's knock-back, a
 * cursed stone pushing them off its footprint. It goes through the same water and the same walls
 * as a walk, with the body and the depth limit the mover actually has right now (a mount's, when
 * riding: `rideRadius`, `wadeLimit`), because a shove that uses the walking numbers can leave a
 * rider inside a wall or carry them out past where their mount can stand.
 *
 * One difference from a walk, on purpose. A walker already out of their depth is let through
 * anything (`shoreMove`: being stuck in the sea is worse than swimming). A shove is not the
 * child's choice, so it never carries anyone DEEPER than they were once they are past the limit:
 * toward the shore, or along it, runs; further out does not.
 *
 * Not a three.js module; allocates nothing.
 */

import { slideMove, type Collider, type Pt } from "./collision";

const WET: Pt = { x: 0, z: 0 };

function depth(x: number, z: number, groundAt: (x: number, z: number) => number, levelAt: (x: number, z: number) => number): number {
  const d = levelAt(x, z) - groundAt(x, z);
  return d > 0 ? d : 0;
}

/** Whether moving from (fx, fz) to (x, z) takes someone further out than they may be shoved. */
function refused(
  fx: number,
  fz: number,
  x: number,
  z: number,
  groundAt: (x: number, z: number) => number,
  levelAt: (x: number, z: number) => number,
  wade: number,
): boolean {
  const to = depth(x, z, groundAt, levelAt);
  return to > wade && to > depth(fx, fz, groundAt, levelAt);
}

export function shoveMove(
  out: Pt,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  groundAt: (x: number, z: number) => number,
  levelAt: (x: number, z: number) => number,
  solids: readonly Collider[],
  r: number,
  wade: number,
  feetY: number,
  half: number,
): Pt {
  const tx = toX < -half ? -half : toX > half ? half : toX;
  const tz = toZ < -half ? -half : toZ > half ? half : toZ;
  // The water, axis by axis, as a walk resolves it.
  let x = tx;
  if (refused(fromX, fromZ, x, fromZ, groundAt, levelAt, wade)) x = fromX;
  let z = tz;
  if (refused(x, fromZ, x, z, groundAt, levelAt, wade)) z = fromZ;
  WET.x = x;
  WET.z = z;
  // Then the walls, with the body the mover has now.
  return slideMove(out, fromX, fromZ, WET.x, WET.z, solids, r, feetY);
}
