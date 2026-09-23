/**
 * THE HERO'S FEET, as events: a footfall, leaving the ground, landing.
 *
 * The scene already runs a stride cycle — `bob`, the phase the legs, the cape and the head-bob
 * all read — so a footfall is simply that phase crossing a multiple of π while the hero is on the
 * ground and moving: the same instant the figure's foot comes down on screen. Nothing new is
 * simulated and nothing is allocated; the scene calls `strideTick` once a frame with numbers it
 * already has, and the bus hears about it a few times a second.
 *
 * No `three`: it is arithmetic, and it is tested.
 */

import type { FeetHandlers } from "@/lib/realm3d/hud-bus";

export type Stride = {
  /** Which half-cycle of the stride the feet were in last frame. */
  half: number;
  grounded: boolean;
  /** Seconds since the feet left the ground. */
  air: number;
};

/** A drop shorter than this is a kerb or a stair, not a landing. */
export const LAND_MIN_AIR = 0.18;

export function makeStride(): Stride {
  return { half: 0, grounded: true, air: 0 };
}

/**
 * One frame of the feet. `phase` is the stride phase (radians, forwards or backwards), `x`/`z`
 * where the hero stands, for the ground under the step. Fires `onStep` on each footfall and
 * `onLand` when the hero comes down after a real fall or jump. (`onJump` is the scene's to fire,
 * because only it knows a jump press was honoured.)
 */
export function strideTick(s: Stride, feet: FeetHandlers, phase: number, grounded: boolean, moving: boolean, dt: number, x: number, z: number): void {
  const half = Math.floor(phase / Math.PI);
  if (!grounded) {
    s.air += dt;
  } else {
    // A landing is its own sound; the footfall that would have coincided with it is swallowed.
    if (!s.grounded && s.air >= LAND_MIN_AIR) feet.onLand(s.air);
    else if (moving && half !== s.half) feet.onStep(x, z);
    s.air = 0;
  }
  s.grounded = grounded;
  s.half = half;
}
