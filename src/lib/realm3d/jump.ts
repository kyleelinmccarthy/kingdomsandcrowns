/**
 * SPIKE — the hero's vertical, as arithmetic. No three.js, so it is testable.
 *
 * Tuned for an eight-year-old's timing rather than for realism: a short, hard hop with a quick
 * fall. A floaty jump is one a child cannot aim, because by the time they can see where they
 * are going to land they have already stopped being able to change it.
 *
 *   rise  = JUMP_SPEED² / (2 · GRAVITY)  ≈ 1.5 units, about the hero's own chest height
 *   hang  = 2 · JUMP_SPEED / GRAVITY     ≈ 0.6 s, tip to toe
 *
 * The solver in `collision.ts` is HORIZONTAL only — it never pushes anyone down or up. Gravity
 * here does the vertical, and the two agree through one rule: a wall blocks while the feet are
 * below its top, and `supportHeight` puts the feet on the highest top they have cleared. So a
 * jump cannot carry the hero into a house (its walls are 3.1 and the jump reaches 1.5) and
 * landing on a garden bed lands ON it.
 */

import { supportHeight, type Collider } from "./collision";

export const GRAVITY = 34;
export const JUMP_SPEED = 10;
/**
 * A hop still allowed for this long after walking off an edge. Every platformer has one; without
 * it a child who presses jump at the lip of a step gets nothing and blames the game.
 */
export const COYOTE_TIME = 0.12;

export type Vertical = {
  /** Foot height, world y. */
  y: number;
  /** Vertical speed, units per second. */
  vy: number;
  grounded: boolean;
  /** Seconds since the feet last left solid ground. */
  airborne: number;
};

export function makeVertical(y: number): Vertical {
  return { y, vy: 0, grounded: true, airborne: 0 };
}

/** True when a jump press should be honoured: on the ground, or only just off it. */
export function canJump(v: Vertical): boolean {
  return v.vy <= 0 && (v.grounded || v.airborne <= COYOTE_TIME);
}

/** The impulse. Returns whether it took, so the caller can play a sound or a squash. */
export function tryJump(v: Vertical): boolean {
  if (!canJump(v)) return false;
  v.vy = JUMP_SPEED;
  v.grounded = false;
  v.airborne = COYOTE_TIME + 1; // no second hop off the same take-off
  return true;
}

/**
 * One frame of gravity, then a clamp onto whatever is under the hero at (x, z). `terrainY` is
 * the heightfield; `colliders` are the solids they might be standing on top of. Mutates `v`.
 *
 * The rise and fall are the exact arc under constant gravity, not a step of it, so a jump is the
 * same height at 30 frames a second as at 144 — a slow laptop's child clears the same garden bed.
 */
export function stepVertical(
  v: Vertical,
  dt: number,
  x: number,
  z: number,
  terrainY: number,
  colliders: readonly Collider[],
  radius?: number,
): Vertical {
  const was = v.y;
  if (dt > 0) {
    v.y += v.vy * dt - 0.5 * GRAVITY * dt * dt;
    v.vy -= GRAVITY * dt;
  }
  // Only tops the feet were already above count as ground, so a ledge the hero is passing in
  // front of never yanks them up onto it.
  const floor = supportHeight(x, z, terrainY, colliders, radius, Math.max(v.y, was));
  if (v.y <= floor) {
    v.y = floor;
    v.vy = 0;
    v.grounded = true;
    v.airborne = 0;
  } else {
    v.grounded = false;
    v.airborne += dt;
  }
  return v;
}
