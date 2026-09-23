/**
 * THE CHILD'S HANDS ON THE REALM — the arithmetic of the mouse camera and the walk.
 *
 * Deliberately NOT a three.js module: the scene runs all of this inside `useFrame` and inside
 * pointer handlers, and every rule here is one a child feels directly, so every one of them is
 * tested with no WebGL. Nothing here allocates; anything that returns more than a number writes
 * into a caller-owned object.
 *
 * ## The scheme (fixed, and the frame's hints and pause menu describe exactly this)
 *
 *   - WASD walks relative to the CAMERA. A and D strafe.
 *   - Left-drag orbits the camera round the hero; the hero does not turn.
 *   - Right-drag orbits the camera AND turns the hero to face where the camera looks.
 *   - The wheel zooms, clamped. Vertical drag pitches, clamped.
 *   - Space jumps, E interacts, 1–9 cast. Esc is the frame's.
 *
 * ## The facing rule, and the bug it replaces
 *
 * The body used to face the MOVEMENT direction, damped with `MathUtils.damp` on the raw angle.
 * Two faults, one symptom ("they keep flipping around back and forth"):
 *
 *   1. `atan2` hands back (-π, π], and due north — straight into the screen at spawn — is
 *      exactly the seam. Walking north with a touch of A or D flips the target between +π-ε and
 *      -π+ε, and a plain damp between those goes the LONG way, through 0, which is facing the
 *      camera. So the hero spun a full half-turn every time a strafe key was tapped.
 *   2. Even turned the short way, facing the movement direction means a strafe turns the body
 *      sideways and a backpedal turns it round to face the lens. With a mouse camera that is
 *      the wrong read: the child is looking where the camera looks, and S means "back up".
 *
 * The rule now (`moveIntent`), with F the camera's forward on the ground:
 *
 *   - any forward input (W, W+A, W+D): face the way you are going — F, or F turned 45°.
 *   - backward input (S, S+A, S+D): BACKPEDAL — face away from the motion, so the body faces F
 *     (or F turned 45° the mirror way) and walks backwards; the legs run their cycle in reverse.
 *   - pure strafe (A or D alone): face F and sidestep.
 *   - no input: hold whatever facing you had.
 *
 * So while walking the body is never more than 45° off the camera's forward, the target can
 * never be across the ±π seam from where the body is by more than that, and every turn is taken
 * the short way round by `turnToward`. Strafing and backpedalling cannot flip the body.
 */

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

/** Radians per pixel of drag. Pitch is slower: a child drags sideways far more than up. */
export const YAW_PER_PX = 0.0062;
export const PITCH_PER_PX = 0.0042;
/** Per wheel "pixel": one notch (~100) is a tenth or so of the boom. */
export const ZOOM_PER_PX = 0.0011;

export function clampPitch(p: number): number {
  return p < PITCH_MIN ? PITCH_MIN : p > PITCH_MAX ? PITCH_MAX : p;
}

export function clampDist(d: number): number {
  return d < DIST_MIN ? DIST_MIN : d > DIST_MAX ? DIST_MAX : d;
}

/**
 * A mouse drag, in pixels. Drag right looks right; drag down looks down (the camera rises).
 *
 * Looking right means the camera's forward turns clockwise seen from above. Forward is
 * `-(sin yaw, cos yaw)`, which turns ANTI-clockwise as yaw grows — hence the minus.
 */
export function orbitDrag(o: Orbit, dxPx: number, dyPx: number): Orbit {
  o.yaw = wrapAngle(o.yaw - dxPx * YAW_PER_PX);
  o.pitch = clampPitch(o.pitch + dyPx * PITCH_PER_PX);
  return o;
}

/** A wheel event's `deltaY`. Positive (scroll down / towards you) pulls the camera back. */
export function orbitZoom(o: Orbit, deltaY: number): Orbit {
  o.dist = clampDist(o.dist * Math.exp(deltaY * ZOOM_PER_PX));
  return o;
}

/** The boom's horizontal reach and its rise, for an orbit. Writes into `out`. */
export function boomOffset(out: { h: number; y: number }, pitch: number, dist: number): { h: number; y: number } {
  out.h = dist * Math.cos(pitch);
  out.y = dist * Math.sin(pitch);
  return out;
}

/**
 * How high over the ground under it the camera insists on sitting, by pitch. The old fixed
 * 3.5 was right for a camera looking down at 43°; a camera the child has lowered to look out
 * at the horizon would be shoved up by it and made to look down again, fighting their hand.
 */
export function terrainClearance(pitch: number): number {
  const t = Math.min(1, Math.max(0, (pitch - 0.15) / 0.55));
  return 1.1 + (3.5 - 1.1) * t * t * (3 - 2 * t);
}

/**
 * Whether the camera may swing ITSELF round an obstruction this frame.
 *
 * The swinging boom (see `pickBoom`) exists so a hero who walks behind a roof is not lost. But
 * a camera that turns itself while the child is turning it is a camera fighting their hand, and
 * one that turns itself the instant they let go undoes what they just chose. So it only helps
 * when the child has not touched the camera for `ASSIST_GRACE` seconds; while they are steering
 * it, an obstruction pulls the boom IN along the line they chose instead of swinging it.
 */
export const ASSIST_GRACE = 1.6;

export function swingAllowed(dragging: boolean, now: number, lastDragAt: number): boolean {
  return !dragging && now - lastDragAt >= ASSIST_GRACE;
}

/* ------------------------------------------------------------------ the walk */

/** Held movement keys. */
export type MoveKeys = { f: boolean; b: boolean; l: boolean; r: boolean };

export type MoveIntent = {
  /** Unit direction on the ground, or 0,0 when standing. */
  x: number;
  z: number;
  moving: boolean;
  /** The body's facing target, in the `atan2(dx, dz)` basis; NaN means hold what you have. */
  face: number;
  /** Walking backwards: the legs run in reverse and the pace drops. */
  back: boolean;
};

export function makeMoveIntent(): MoveIntent {
  return { x: 0, z: 0, moving: false, face: Number.NaN, back: false };
}

/** How much slower a backpedal is than a walk. Enough to feel, not enough to be a chore. */
export const BACKPEDAL = 0.72;

/**
 * Keys plus the camera's yaw → where to walk and which way to face. See the file header for
 * the facing rule. Writes into `out`.
 */
export function moveIntent(out: MoveIntent, yaw: number, k: MoveKeys): MoveIntent {
  const fb = (k.f ? 1 : 0) - (k.b ? 1 : 0);
  const s = (k.r ? 1 : 0) - (k.l ? 1 : 0);
  // Camera forward and right, on the ground.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let dx = fx * fb + rx * s;
  let dz = fz * fb + rz * s;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    out.x = 0;
    out.z = 0;
    out.moving = false;
    out.face = Number.NaN;
    out.back = false;
    return out;
  }
  dx /= len;
  dz /= len;
  out.x = dx;
  out.z = dz;
  out.moving = true;
  out.back = fb < 0;
  if (fb > 0) out.face = Math.atan2(dx, dz);
  else if (fb < 0) out.face = Math.atan2(-dx, -dz);
  else out.face = Math.atan2(fx, fz);
  return out;
}

/** The facing that looks where the camera looks: what a right-drag turns the hero to. */
export function cameraFacing(yaw: number): number {
  return Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
}
