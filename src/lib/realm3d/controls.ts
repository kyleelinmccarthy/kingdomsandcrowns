/**
 * THE CHILD'S HANDS ON THE REALM — the arithmetic of the mouse camera and the walk.
 *
 * Deliberately NOT a three.js module: the scene runs all of this inside `useFrame` and inside
 * input handlers, and every rule here is one a child feels directly, so every one of them is
 * tested with no WebGL. Nothing here allocates; anything that returns more than a number writes
 * into a caller-owned object.
 *
 * ## The scheme (the frame's hints, the pause menu and the tutorial describe exactly this)
 *
 * The owner: "it should feel more like minecraft/world of warcraft where you can move
 * dynamically with wasd with strafing and using the mouse to control the camera".
 *
 *   - THE MOUSE IS THE CAMERA. Click the world and the mouse is captured: from then on moving it
 *     turns the camera left and right and tilts it up and down, with no button held. Esc frees
 *     it. While it is free, holding the RIGHT button and dragging turns the camera too, as in
 *     World of Warcraft, so the HUD stays clickable. Every source goes through one door, `lookBy`,
 *     in screen pixels, scaled by the child's own sensitivity and invert setting.
 *   - The wheel zooms and the pitch is the child's, both clamped. NOTHING ELSE MOVES THE CAMERA.
 *     It does not swing round a roof, duck under a canopy, rise over a tower or come in along a
 *     blocked line: what stands between it and the child turns see-through instead
 *     (`see-through.ts`). The one thing the lens does on its own is stay above the ground
 *     (`chaseLens`), and that only ever raises it — never brings it nearer, never turns it.
 *   - WASD walks relative to the CAMERA. A and D are true strafes, S is a backpedal, and a
 *     diagonal is no faster than straight. How the body gets up to speed is `locomotion.ts`.
 *   - The body faces where the camera looks while it moves and while the mouse has the camera;
 *     with the mouse free and no drag, a standing body keeps its facing (`bodyFacing`).
 *   - Space jumps, E interacts, 1–9 cast. Esc is the frame's.
 *
 * ## Why facing the heading cannot flip
 *
 * The body once faced its MOVEMENT direction, damped with `MathUtils.damp` on the raw angle, and
 * "they keep flipping around back and forth": `atan2` hands back (-π, π], due north — straight
 * into the screen at spawn — is exactly the seam, and a plain damp across it goes the LONG way,
 * through facing the camera. Now a moving body faces the camera's heading whatever the keys are,
 * so a strafe or a backpedal never asks it to turn at all, and every turn there is (the mouse
 * swinging the heading round) is taken the short way by `turnToward`.
 */

import type { LookSettings } from "./hud-bus";

/* ------------------------------------------------------------------ angles */

const TAU = Math.PI * 2;

/** An angle folded into (-π, π]. */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r <= -Math.PI) r += TAU;
  return r;
}

/** Signed shortest difference `to - from`, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/**
 * Exponential turn toward `target`, always the short way round, and the result kept wrapped so
 * the stored rotation never grows without bound. `lambda` is the same rate `MathUtils.damp`
 * takes: larger is snappier.
 */
export function turnToward(current: number, target: number, lambda: number, dt: number): number {
  return wrapAngle(current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt)));
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/* -------------------------------------------------------------- the camera */

/**
 * The boom the child steers. `yaw` is where the camera sits round the hero (0 = due south of
 * them, looking north); `pitch` is its elevation above the horizontal; `dist` is its length.
 */
export type Orbit = { yaw: number; pitch: number; dist: number };

/** The shot the owner approved: 21 back and 19.5 up. */
export const DEFAULT_PITCH = Math.atan2(19.5, 21);
export const DEFAULT_DIST = Math.hypot(19.5, 21);

/**
 * Low enough to stand on a summit and look OUT across the island rather than down at your own
 * boots; high enough to see the village as a map. 0.1 rad is six degrees over the horizon.
 */
export const PITCH_MIN = 0.1;
export const PITCH_MAX = 1.3;
/** In to about a house-length, out to where the village is a model on a table. */
export const DIST_MIN = 11;
export const DIST_MAX = 44;

/** Radians per pixel of mouse at sensitivity 1. Pitch is slower: a child looks sideways far more than up. */
export const YAW_PER_PX = 0.0062;
export const PITCH_PER_PX = 0.0042;
/** Per wheel "pixel": one notch (~100) is a tenth or so of the boom. */
export const ZOOM_PER_PX = 0.0011;

/** How far the child may tilt and zoom: the island's, or a room's (`room-rules.ts`). */
export type LookLimits = { pitchMin: number; pitchMax: number; distMin: number; distMax: number };
export const ISLAND_LOOK: LookLimits = { pitchMin: PITCH_MIN, pitchMax: PITCH_MAX, distMin: DIST_MIN, distMax: DIST_MAX };

/**
 * A look, in screen pixels: the mouse moved (captured), or dragged with the right button (free).
 * Right looks right; up looks up — the camera sinks toward the horizon — unless the child plays
 * inverted. `s` is the frame's settings, read at every move so a change applies at once.
 *
 * Looking right means the camera's forward turns clockwise seen from above. Forward is
 * `-(sin yaw, cos yaw)`, which turns ANTI-clockwise as yaw grows — hence the minus.
 */
export function lookBy(o: Orbit, dxPx: number, dyPx: number, s: LookSettings, lim: LookLimits = ISLAND_LOOK): Orbit {
  const k = s.sensitivity;
  o.yaw = wrapAngle(o.yaw - dxPx * YAW_PER_PX * k);
  o.pitch = clamp(o.pitch + (s.invertY ? -dyPx : dyPx) * PITCH_PER_PX * k, lim.pitchMin, lim.pitchMax);
  return o;
}

/** A wheel event's `deltaY`. Positive (scroll down / towards you) pulls the camera back. */
export function zoomBy(o: Orbit, deltaY: number, lim: LookLimits = ISLAND_LOOK): Orbit {
  o.dist = clamp(o.dist * Math.exp(deltaY * ZOOM_PER_PX), lim.distMin, lim.distMax);
  return o;
}

/**
 * The camera as the child holds it, beside the yaw (which the scene keeps in its own ref, read by
 * the HUD's cone and the spells). `held` is true while a mouse source has the camera — captured,
 * or a right-drag — and `lastLookAt` is when the last look arrived, in seconds.
 */
export type LookState = { pitch: number; dist: number; held: boolean; lastLookAt: number };

/** How long after the last look the body is still turning to follow it. */
export const LOOK_SETTLE = 0.3;

/**
 * Whether the child is looking with the mouse: it has the camera now, or moved it a moment ago —
 * so a body turning to follow a drag finishes its turn after the button comes up.
 */
export function looking(s: LookState, now: number): boolean {
  return s.held || now - s.lastLookAt < LOOK_SETTLE;
}

/**
 * How high over the ground under it the lens insists on sitting, by pitch. A camera the child
 * has lowered to look out at the horizon may sit low; one looking down sits higher.
 */
export function terrainClearance(pitch: number): number {
  const t = Math.min(1, Math.max(0, (pitch - 0.15) / 0.55));
  return 1.1 + (3.5 - 1.1) * t * t * (3 - 2 * t);
}

/**
 * Where the lens goes: on the child's own boom from (hx, anchorY, hz) — their yaw, their pitch,
 * their distance — raised only as far as the ground under it needs (`clear` over `groundAt`, when
 * there is ground; a room has none). It is never brought nearer and never turned: whatever stands
 * between the lens and the child is the see-through's business, not the camera's. Writes `out`.
 */
export function chaseLens<T extends { x: number; y: number; z: number }>(
  out: T,
  hx: number,
  anchorY: number,
  hz: number,
  yaw: number,
  pitch: number,
  dist: number,
  groundAt: ((x: number, z: number) => number) | null,
  clear: number,
): T {
  const h = dist * Math.cos(pitch);
  out.x = hx + h * Math.sin(yaw);
  out.z = hz + h * Math.cos(yaw);
  const y = anchorY + dist * Math.sin(pitch);
  out.y = groundAt ? Math.max(y, groundAt(out.x, out.z) + clear) : y;
  return out;
}

/* ------------------------------------------------------------------ the walk */

/** Held movement keys. */
export type MoveKeys = { f: boolean; b: boolean; l: boolean; r: boolean };

export type MoveIntent = {
  /** Unit direction on the ground, or 0,0 when standing. */
  x: number;
  z: number;
  moving: boolean;
  /** The body's facing target, in the `atan2(dx, dz)` basis: the camera's heading; NaN standing. */
  face: number;
  /** Walking backwards: the pace drops, and the legs read it as a backpedal. */
  back: boolean;
};

export function makeMoveIntent(): MoveIntent {
  return { x: 0, z: 0, moving: false, face: Number.NaN, back: false };
}

/** How much slower a backpedal is than a walk. Enough to feel, not enough to be a chore. */
export const BACKPEDAL = 0.72;

/**
 * Keys plus the camera's yaw → where to walk and which way to face. A and D strafe, S backs up,
 * and the body faces the camera's heading for all of them. Writes into `out`.
 */
export function moveIntent(out: MoveIntent, yaw: number, k: MoveKeys): MoveIntent {
  const fb = (k.f ? 1 : 0) - (k.b ? 1 : 0);
  const s = (k.r ? 1 : 0) - (k.l ? 1 : 0);
  // Camera forward and right, on the ground.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const dx = fx * fb + rx * s;
  const dz = fz * fb + rz * s;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    out.x = 0;
    out.z = 0;
    out.moving = false;
    out.face = Number.NaN;
    out.back = false;
    return out;
  }
  out.x = dx / len;
  out.z = dz / len;
  out.moving = true;
  out.back = fb < 0;
  out.face = Math.atan2(fx, fz);
  return out;
}

/** The facing that looks where the camera looks. */
export function cameraFacing(yaw: number): number {
  return Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
}

/**
 * Which way the body turns this frame, or NaN to hold it where it is.
 *
 *   - `steered`: something else has the reins — a fast-travel ride, the mount-up moment — and
 *     the body faces where it asks (`aim`), never where the camera looks.
 *   - moving: where it travels (`travel`: the camera's heading on foot; a mount going forward
 *     faces its own way, `rideFace`).
 *   - `looking` with the mouse: the camera's heading, so the child turns to look where they look.
 *   - otherwise the body keeps its facing, unless a cast or a doorway asks for one (`aim`).
 */
export function bodyFacing(travel: number, heading: number, looking: boolean, steered: boolean, aim: number): number {
  if (steered) return aim;
  if (travel === travel) return travel;
  if (looking) return heading;
  return aim;
}
