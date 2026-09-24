/**
 * A MOUNT'S BODY IN THE SOLVER — so a pony's muzzle stops at a wall instead of in it.
 *
 * The rider was one circle (`RIDE_RADIUS`, 0.8 round the saddle), and a mount is long: ridden
 * head-on at a cottage its nose went a metre into the plaster, and turned beside a wall its head
 * or rump swept through it. A single circle big enough to cover the animal would shut every
 * lane in the village, so the body is three circles along the way it faces:
 *
 *   - the saddle circle, `RIDE_RADIUS`, which is still the one every old guarantee is about —
 *     the escape rule in `collision.ts` (a body that grew where it stands may always move out
 *     or along, never further in), `settleRider`, the Doorstep rescue, a knock's shove;
 *   - a HEAD circle, out along the facing, just covering the muzzle;
 *   - a RUMP circle, behind, just covering the hindquarters (a swishing tail is let be).
 *
 * The two ends obey the same rule as the saddle: a step that would take either of them further
 * into anything solid is refused on that axis (`slideBody`), so riding at a wall stops the nose
 * at the wall and riding along it still slides.
 *
 * TURNING is the new part, because a turn moves the ends without moving the rider. Turning in
 * place beside a wall, the mount shuffles: the saddle is eased away from whatever the head or
 * rump turned into, through the ordinary solver so the saddle itself never goes in anywhere
 * (`turnBody`). Only where there is no room to shuffle — a slot narrower than the animal is
 * long — is the turn held back, and even then any part of it that fits is taken; the mount can
 * still go forward and back along the slot, so nobody is ever trapped by it.
 *
 * Scale: the mounts are drawn `MOUNT_SCALE` times their modelled size (they read too small at
 * the game's default camera), and every number here is at that scale.
 *
 * Not a three.js module. Nothing here allocates.
 */

import { blocks, penetration, slideMove, stepBlocked, type Collider, type Pt } from "./collision";
import type { RideBus } from "./riding";

/** How much bigger than modelled the mounts are drawn. Everything a mount's size touches reads this. */
export const MOUNT_SCALE = 1.25;

/**
 * The ends of a body, from the saddle: the head circle's centre `fore` ahead with radius
 * `foreR` (so the muzzle is at `fore + foreR`), the rump circle's `hind` behind with `hindR`.
 */
export type MountBody = { fore: number; foreR: number; hind: number; hindR: number };

/** At the modelled size (`mount-figure.tsx`), measured off each body's muzzle and rump. */
const MODELLED: Record<string, MountBody> = {
  pony: { fore: 1.29, foreR: 0.36, hind: 0.58, hindR: 0.42 },
  donkey: { fore: 1.19, foreR: 0.36, hind: 0.53, hindR: 0.42 },
  goat: { fore: 0.92, foreR: 0.33, hind: 0.42, hindR: 0.4 },
  stag: { fore: 1.07, foreR: 0.33, hind: 0.5, hindR: 0.4 },
  boar: { fore: 0.8, foreR: 0.35, hind: 0.43, hindR: 0.42 },
  direwolf: { fore: 1.1, foreR: 0.35, hind: 0.45, hindR: 0.4 },
  gryphon: { fore: 1.05, foreR: 0.35, hind: 0.5, hindR: 0.4 },
  wyrm: { fore: 1.52, foreR: 0.38, hind: 1.35, hindR: 0.4 },
};

const SCALED: Record<string, MountBody> = Object.fromEntries(
  Object.entries(MODELLED).map(([id, b]) => [
    id,
    { fore: b.fore * MOUNT_SCALE, foreR: b.foreR * MOUNT_SCALE, hind: b.hind * MOUNT_SCALE, hindR: b.hindR * MOUNT_SCALE },
  ]),
);

/** A mount's body at the size it is drawn. An unknown id is a pony, as the figure is. */
export function mountBody(id: string | null | undefined): MountBody {
  return (id && SCALED[id]) || SCALED.pony;
}

/**
 * The body the mover has right now, or null for the one circle: only while fully in the saddle
 * and steering. Getting on and off, the mount is walking in or standing still (the saddle circle
 * and `settleRider` cover it); on a fast-travel ride the road is the route, tested clear.
 */
export function bodyFor(ride: RideBus | null | undefined): MountBody | null {
  if (!ride || !ride.mount || ride.phase !== "on" || ride.travelling) return null;
  return mountBody(ride.mount.id);
}

/**
 * How far the body reaches from the saddle along the unit direction (dx, dz), facing `yaw`: the
 * front of whatever part of it leads that way. A door counts the push from there, not from the
 * saddle — the nose is what touches the door.
 */
export function bodyReach(body: MountBody | null, yaw: number, dx: number, dz: number, r: number): number {
  if (!body) return r;
  const along = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  return Math.max(r, along * body.fore + body.foreR, -along * body.hind + body.hindR);
}

/* ------------------------------------------------------------------ moving */

/** Whether a step of the saddle from (fx, fz) to (x, z), facing `yaw`, is refused for any part. */
function bodyBlocked(solids: readonly Collider[], fx: number, fz: number, x: number, z: number, yaw: number, r: number, body: MountBody | null, feetY: number): boolean {
  if (stepBlocked(solids, fx, fz, x, z, r, feetY)) return true;
  if (!body) return false;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const hx = s * body.fore;
  const hz = c * body.fore;
  if (stepBlocked(solids, fx + hx, fz + hz, x + hx, z + hz, body.foreR, feetY)) return true;
  const bx = -s * body.hind;
  const bz = -c * body.hind;
  return stepBlocked(solids, fx + bx, fz + bz, x + bx, z + bz, body.hindR, feetY);
}

/**
 * `slideMove` for a mount's whole body: one axis at a time, an axis dropped if any part of the
 * body would go further into something. With no body it IS `slideMove`. Writes into `out`.
 */
export function slideBody(
  out: Pt,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  yaw: number,
  solids: readonly Collider[],
  r: number,
  body: MountBody | null,
  feetY: number = -Infinity,
): Pt {
  if (!body) return slideMove(out, fromX, fromZ, toX, toZ, solids, r, feetY);
  let x = toX;
  if (bodyBlocked(solids, fromX, fromZ, x, fromZ, yaw, r, body, feetY)) x = fromX;
  let z = toZ;
  if (bodyBlocked(solids, x, fromZ, x, z, yaw, r, body, feetY)) z = fromZ;
  out.x = x;
  out.z = z;
  return out;
}

/* ------------------------------------------------------------------ the two ends */

const PUSH: Pt = { x: 0, z: 0 };
const STEP: Pt = { x: 0, z: 0 };
/** Set by `endPush` when some end is THROUGH a thing (the push is straight back along the body). */
let through = false;

/** How thick the neck is, for `neckThrough`. */
const NECK = 0.15;

/** Whether the segment from the saddle (sx, sz) to an end (x, z) crosses `c` (strictly between them). */
function neckThrough(c: Collider, sx: number, sz: number, x: number, z: number): boolean {
  const ux = x - sx;
  const uz = z - sz;
  if (c.round) {
    const len2 = ux * ux + uz * uz || 1;
    const t = ((c.x - sx) * ux + (c.z - sz) * uz) / len2;
    if (t <= 0 || t >= 1) return false;
    const qx = sx + ux * t - c.x;
    const qz = sz + uz * t - c.z;
    const reach = c.hw + NECK;
    return qx * qx + qz * qz < reach * reach;
  }
  for (let k = 1; k <= 3; k++) {
    const t = k * 0.25;
    if (Math.abs(sx + ux * t - c.x) < c.hw + NECK && Math.abs(sz + uz * t - c.z) < c.hd + NECK) return true;
  }
  return false;
}

/**
 * One end circle, at (x, z) with radius `r`, against the solids: adds the saddle's way out to
 * `acc` and returns its deepest overlap. The way out is off the face the end is in — unless that
 * would drive the saddle at the thing (a trunk the mount's neck is through, a thin wall its head
 * is past: getting on facing a tree does that), when it is straight back along the body, away
 * from that end: (bx, bz).
 */
function endPush(acc: Pt, solids: readonly Collider[], sx: number, sz: number, x: number, z: number, r: number, bx: number, bz: number, feetY: number): number {
  let worst = 0;
  for (let i = 0; i < solids.length; i++) {
    const c = solids[i];
    if (!blocks(c, x, z, r, feetY)) continue;
    const pen = penetration(c, x, z, r);
    if (pen <= 0) continue;
    if (pen > worst) worst = pen;
    const dx = x - c.x;
    const dz = z - c.z;
    let nx = 0;
    let nz = 0;
    if (c.round) {
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      nx = dx / d;
      nz = dz / d;
    } else if (c.hw + r - Math.abs(dx) < c.hd + r - Math.abs(dz)) {
      nx = dx < 0 ? -1 : 1;
    } else {
      nz = dz < 0 ? -1 : 1;
    }
    // THROUGH it — the neck (or the loins) crossing it between the saddle and this end — the only
    // way out is back along the body; off its face would drive the saddle into it.
    if (neckThrough(c, sx, sz, x, z)) {
      nx = bx;
      nz = bz;
      through = true;
    }
    acc.x += nx * pen;
    acc.z += nz * pen;
  }
  return worst;
}

/**
 * How far into anything the head and rump are, at (x, z) facing `yaw` (the deeper of the two),
 * and the saddle's way out of it, written into `acc`.
 */
function endsPush(acc: Pt, solids: readonly Collider[], x: number, z: number, yaw: number, body: MountBody, feetY: number): number {
  acc.x = 0;
  acc.z = 0;
  through = false;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const a = endPush(acc, solids, x, z, x + s * body.fore, z + c * body.fore, body.foreR, -s, -c, feetY);
  const b = endPush(acc, solids, x, z, x - s * body.hind, z - c * body.hind, body.hindR, s, c, feetY);
  return a > b ? a : b;
}

/** How far into anything the head or rump is, at (x, z) facing `yaw`. */
export function endsDepth(solids: readonly Collider[], x: number, z: number, yaw: number, body: MountBody, feetY: number = -Infinity): number {
  return endsPush(PUSH, solids, x, z, yaw, body, feetY);
}

/** A hair past touching, so the next frame's step does not start on the line. */
const CLEAR = 0.01;

/**
 * Eases the saddle so the head and rump, facing `yaw`, are out of what they are in — through the
 * ordinary solver, so the saddle never goes into anything on the way. A few passes, for a corner,
 * and never a pass that leaves the ends deeper than the one before (between close trunks a shove
 * out of one can be a shove into the next). Writes the saddle into `out`; returns how deep the
 * ends still are.
 */
function fitAt(out: Pt, x: number, z: number, yaw: number, solids: readonly Collider[], r: number, body: MountBody, feetY: number): number {
  out.x = x;
  out.z = z;
  let depth = endsPush(PUSH, solids, x, z, yaw, body, feetY);
  for (let pass = 0; pass < 4 && depth > 0; pass++) {
    // Backing an end out of a thing it is through goes deeper before it comes out: that one is
    // let run (it is always straight back, so it cannot swing between two trunks).
    const backing = through;
    const d = Math.hypot(PUSH.x, PUSH.z);
    if (d < 1e-9) break; // pinned from both sides: nothing to ease toward
    const k = (d + CLEAR) / d;
    slideMove(STEP, out.x, out.z, out.x + PUSH.x * k, out.z + PUSH.z * k, solids, r, feetY);
    if (STEP.x === out.x && STEP.z === out.z) break;
    const px = PUSH.x;
    const pz = PUSH.z;
    const next = endsPush(PUSH, solids, STEP.x, STEP.z, yaw, body, feetY);
    if (next >= depth && !backing) {
      PUSH.x = px;
      PUSH.z = pz;
      break;
    }
    out.x = STEP.x;
    out.z = STEP.z;
    depth = next;
  }
  return depth;
}

/** A head or rump this far into something is touching, not in it. */
export const ENDS_SLACK = 0.03;
/** The parts of a refused turn still tried, largest first. */
const TURN_TRIES = [1, 0.5, 0.25];

/**
 * One frame of the body turning from `fromYaw` toward `toYaw` (already rate-limited by the mover):
 * the mount shuffles its saddle clear of whatever its head or rump turned into. A turn the
 * shuffle cannot make room for — it would leave an end deeper in than it already was — is cut
 * back to the part that fits, or held this frame. Either way the ends are eased out of anything
 * they were already in (a knock, getting on beside a wall). Writes the saddle into `out`;
 * returns the facing taken.
 */
export function turnBody(
  out: Pt,
  x: number,
  z: number,
  fromYaw: number,
  toYaw: number,
  solids: readonly Collider[],
  r: number,
  body: MountBody,
  feetY: number = -Infinity,
): number {
  const before = endsDepth(solids, x, z, fromYaw, body, feetY);
  const allowed = (before > ENDS_SLACK ? before : ENDS_SLACK) + 1e-6;
  let delta = toYaw - fromYaw;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  let yaw = fromYaw;
  let depth = -1;
  if (Math.abs(delta) > 1e-9) {
    for (let i = 0; i < TURN_TRIES.length && depth < 0; i++) {
      const y = i === 0 ? toYaw : Math.atan2(Math.sin(fromYaw + delta * TURN_TRIES[i]), Math.cos(fromYaw + delta * TURN_TRIES[i]));
      const d = fitAt(out, x, z, y, solids, r, body, feetY);
      if (d <= allowed) {
        yaw = y;
        depth = d;
      }
    }
  }
  if (depth < 0) depth = fitAt(out, x, z, fromYaw, solids, r, body, feetY);
  // Still in something, and no shuffle gets it out (got on between two houses, knocked into a
  // corner): set down at the nearest spot where the whole body stands clear, as the Doorstep's
  // rescue sets a buried child. At once, not eased — the way there is through the walls — and
  // once clear it stays clear, since no step or turn is let take it back in.
  if (depth > ENDS_SLACK && freeBody(FREE, out.x, out.z, yaw, solids, r, body, feetY)) {
    out.x = FREE.x;
    out.z = FREE.z;
  }
  return yaw;
}

const FREE: Pt = { x: 0, z: 0 };

/** Whether the saddle at (x, z) is in anything. */
function saddleIn(solids: readonly Collider[], x: number, z: number, r: number, feetY: number): boolean {
  for (let i = 0; i < solids.length; i++) if (blocks(solids[i], x, z, r, feetY)) return true;
  return false;
}

/**
 * The nearest spot to (x, z), in widening rings, where the whole body facing `yaw` touches
 * nothing. False when there is none within six units (then the solver's own escape rule is all
 * there is, and it is enough to ride out).
 */
function freeBody(out: Pt, x: number, z: number, yaw: number, solids: readonly Collider[], r: number, body: MountBody, feetY: number): boolean {
  for (let ring = 1; ring <= 12; ring++) {
    const rad = ring * 0.5;
    const n = 8 + ring * 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const cx = x + Math.sin(a) * rad;
      const cz = z + Math.cos(a) * rad;
      if (saddleIn(solids, cx, cz, r, feetY)) continue;
      if (endsPush(PUSH, solids, cx, cz, yaw, body, feetY) > 0) continue;
      out.x = cx;
      out.z = cz;
      return true;
    }
  }
  return false;
}

/**
 * Where a mount stands still (parked by a door, or where the child got off), with its whole body
 * clear: the saddle already clear (`freeSpot`), eased until the head and rump are too.
 */
export function fitParked(out: Pt, x: number, z: number, yaw: number, solids: readonly Collider[], r: number, body: MountBody): Pt {
  turnBody(out, x, z, yaw, yaw, solids, r, body);
  return out;
}
