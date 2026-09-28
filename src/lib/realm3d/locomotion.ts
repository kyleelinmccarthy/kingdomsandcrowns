/**
 * HOW THE BODY MOVES — the hero's speed over the ground, as arithmetic.
 *
 * The owner: "the movement in game is still a bit clunky — it should feel more like
 * minecraft/world of warcraft where you can move dynamically". The walk used to be a switch: a
 * held key was full speed on the frame it went down and nothing on the frame it came up. Now
 * the body has a VELOCITY, and the keys only say what velocity it wants:
 *
 *   - Standing to full speed takes `SPEED_UP` (a tenth of a second) and full speed to standing
 *     takes `SLOW_DOWN` (0.08 s): quick enough that nothing is ice, long enough that a start and
 *     a stop read as a body with weight rather than a sprite switching on and off. The grip is a
 *     constant acceleration, the mover's OWN full speed over those times, so a pony at a gallop
 *     gets going and pulls up in the same tenth of a second a child does.
 *   - In the air the body keeps what it had. Let go of the keys mid-jump and it carries on;
 *     hold them and it can still be steered, at `AIR_GRIP` of the ground's grip — enough to aim
 *     a landing, not enough to turn round in mid-air.
 *   - Whatever the world refuses (a wall, the shore, the island's edge) takes the speed that ran
 *     into it (`keepMotion`), so a child pressed against a house slides along it at the pace of
 *     the part of their walk that goes along it, and does not shoot off the corner.
 *
 * FRAME-RATE INDEPENDENT, exactly. Each frame's step is the closed form of constant acceleration
 * toward a target — including the moment inside the frame when the target is reached — so 30,
 * 60 and 144 frames a second walk the same path at the same speeds (the test proves it to 1e-9).
 * A slow laptop and a fast one give a child the same jump over the same stream.
 *
 * Pure, three-free, and nothing here allocates: every result is written into a caller's object.
 */

import type { Pt } from "./collision";

/** Seconds from standing to full speed. */
export const SPEED_UP = 0.1;
/** Seconds from full speed to standing. */
export const SLOW_DOWN = 0.08;
/** How much of the ground's grip the body has in the air, steering toward what is wanted. */
export const AIR_GRIP = 0.35;

/** A body's velocity on the ground plane, units a second. */
export type Motion = { vx: number; vz: number };

export function makeMotion(): Motion {
  return { vx: 0, vz: 0 };
}

/**
 * One frame. The velocity moves toward `(wantX, wantZ)` at the mover's grip, and the step the
 * body takes this frame is written into `out`, integrated exactly.
 *
 * `top` is the mover's own full speed on flat, dry ground (a child's walk, a mount's gallop): it
 * sets the grip, so every mover takes the same time to get going and to stop, whatever it is
 * asked for this frame (a wade, a backpedal).
 */
export function stepMotion(m: Motion, out: Pt, wantX: number, wantZ: number, top: number, grounded: boolean, dt: number): Pt {
  const wanting = wantX !== 0 || wantZ !== 0;
  // Braking is the ground's alone: in the air, nothing wanted means the body keeps what it has.
  const grip = wanting ? ((grounded ? 1 : AIR_GRIP) * top) / SPEED_UP : grounded ? top / SLOW_DOWN : 0;
  const dx = wantX - m.vx;
  const dz = wantZ - m.vz;
  const gap = Math.hypot(dx, dz);
  if (gap <= grip * dt) {
    // It gets there inside this frame: `t` seconds of speeding up (or slowing down) along the
    // gap, then the rest of the frame at exactly what it wanted.
    const t = grip > 0 ? gap / grip : 0;
    out.x = m.vx * t + 0.5 * dx * t + wantX * (dt - t);
    out.z = m.vz * t + 0.5 * dz * t + wantZ * (dt - t);
    m.vx = wantX;
    m.vz = wantZ;
    return out;
  }
  // The whole frame is spent getting there.
  const a = grip / gap;
  out.x = m.vx * dt + 0.5 * dx * a * dt * dt;
  out.z = m.vz * dt + 0.5 * dz * a * dt * dt;
  m.vx += dx * a * dt;
  m.vz += dz * a * dt;
  return out;
}

/**
 * The world had its say on this frame's step: `want` is what `stepMotion` asked for, `got` what
 * the solver, the shore and the island's edge allowed. An axis the world cut short loses its
 * speed, so the body is not left pushing into a wall at a run.
 */
export function keepMotion(m: Motion, wantDx: number, wantDz: number, gotDx: number, gotDz: number): void {
  if (Math.abs(gotDx - wantDx) > 1e-6) m.vx = 0;
  if (Math.abs(gotDz - wantDz) > 1e-6) m.vz = 0;
}

/* ------------------------------------------------------------------ the legs */

/**
 * What the legs make of a motion, for a body facing `facing` (the `atan2(dx, dz)` basis):
 * `speed` is how much of a full stride (0 standing, 1 at full pace), `lateral` how much of it is
 * sideways (+1 a sidestep to the body's right, -1 to its left) and `back` whether the body is
 * backing up — so a strafe steps sideways and a backpedal runs the stride in reverse, whatever
 * the keys were: the legs read where the body is actually going.
 */
export type Stride = { speed: number; lateral: number; back: boolean };

export function makeStride(): Stride {
  return { speed: 0, lateral: 0, back: false };
}

/** How far behind the body's front the travel must point to be a backpedal, as a share of the speed. */
const BACK_AT = 0.25;

export function readStride(out: Stride, v: { vx: number; vz: number }, facing: number, top: number): Stride {
  const speed = Math.hypot(v.vx, v.vz);
  if (speed < 1e-6) {
    out.speed = 0;
    out.lateral = 0;
    out.back = false;
    return out;
  }
  const sin = Math.sin(facing);
  const cos = Math.cos(facing);
  // Forward is (sin, cos); the body's right, with y up, is (-cos, sin).
  const ahead = v.vx * sin + v.vz * cos;
  const right = -v.vx * cos + v.vz * sin;
  out.speed = Math.min(1, speed / top);
  out.lateral = right / speed;
  out.back = ahead < -BACK_AT * speed;
  return out;
}

/**
 * How fast the stride's phase turns, radians a second: a walking body's legs cycle at 9 (3 in the
 * air), backwards when it backs up; a standing one only breathes.
 */
export function strideRate(s: Stride, grounded: boolean): number {
  if (s.speed < 0.05) return 2;
  return (grounded ? 9 : 3) * (s.back ? -1 : 1);
}

/** How far the hips turn into a full sidestep: enough that the legs are seen to step sideways. */
export const HIP_TURN = 0.9;

/**
 * The hips' turn off the body's facing, radians, in three.js's +y sense (positive swings the legs
 * toward the body's left), so the stride runs the way the body is actually going: a strafe to the
 * right swings the legs to the right; backing up to the right swings them the other way, because
 * the stride itself runs backwards then (`strideRate`). Square walking straight, and standing.
 */
export function hipTurn(s: Stride): number {
  if (s.speed < 0.05) return 0;
  return -(s.back ? -1 : 1) * s.lateral * HIP_TURN;
}
