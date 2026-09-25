/**
 * Where the chase camera may stand when something tall is beside the child.
 *
 * Pure, and not a three.js module, for the same reason `collision.ts` is not: the Rig runs this
 * every frame and it has to be tested without a WebGL context. Nothing here allocates.
 *
 * THE BUG THIS ANSWERS. Standing by Sister Wren at the raised Chapel, the camera ended up pressed
 * into the child's back, low, looking at the chapel door. Three rules met there:
 *
 *   - A child standing still (or steering) keeps the direction they chose, so the Rig only asked
 *     "how clear is THIS line?" — and read one blocked line as a CEILING and ducked, in to 8.5 and
 *     down to 3.6, the canopy shot. By Wren the line was cut by the one pine on the chapel lawn;
 *     anywhere else, by a roof or a tower. A wall read as a lid.
 *   - The ducked line is lower still, so it met the same thing sooner, and a steered boom is
 *     allowed in to `CLOSEST` (2.6) — which, with the wall nearer than that, is inside the wall.
 *   - Walking, the old floor (`CAM_MIN`, 7.5 of a 29 boom) held the lens out past whatever cut
 *     the line, i.e. behind or inside the roof. By the mill and the castle gate the screen went
 *     black.
 *
 * A wall is not a ceiling. Something beside the child hides them from ONE side and from LOW down;
 * the sky over them is still open. So the answer to a wall is to go UP, on the child's own
 * bearing, before anything else:
 *
 *   1. LIFT. Raise the boom's pitch over the child's own, a step at a time, until the line clears
 *      the roof or the tower to a readable length. The direction is the child's; W still walks
 *      where they pointed; the world does not turn under them. It is the smallest change that
 *      works, because every building has a top and none of them has an end.
 *   2. TURN, only when no lift on their bearing is readable (pressed against the chapel's bell
 *      tower from the far side, say) and only when the camera is allowed to turn itself — never
 *      under a dragging hand. It is the same swing the walking assist makes, an offset over the
 *      child's yaw that never changes the way W walks.
 *   3. DUCK stays for what it was made for: a lid over the child, which is when no bearing at all
 *      is clear of the LIDS (`gatherLids`, `pickBoom` across every yaw), not when one line is.
 *
 * And the lens rides on the whole figure (`sightFraction`: eye and knee), never nearer than
 * `READ_DIST` once settled, and never inside a wall (`lensFrac`, `insideWall`).
 *
 * Fading the building was the third candidate. A house is its own mesh, so it could be faded
 * where trees cannot; it was still passed over. A see-through chapel with the child standing in
 * its wall is a stranger picture for an eight-year-old than a camera that rises over the roof,
 * and it leaves the lens inside the building, which is exactly the shot this file exists to end.
 */

import { clearFraction, pickBoom, type Boom, type Collider } from "./collision";
import { angleDelta, wrapAngle } from "./controls";

/**
 * The nearest the lens may settle to the child's eye and still show a child in a place. With the
 * scene's 46° lens, 5 units frames about 4.2 units top to bottom: the hero is half the frame, and
 * the doorway, the villager and the ground round them are the other half. The jam was 2.6.
 */
export const READ_DIST = 5;

/**
 * How far under the eye the second sight line starts. The eye alone is not the child: at a steep
 * lift a line can skim the eaves and see the top of a head while the roof hides the rest (found in
 * play by the mill). A shot reads only if both lines — eye, and knee — clear.
 */
export const FIGURE_DROP = 1;

/**
 * How much of a boom from the child's eye out to (ox, oy, oz) is clear for the whole FIGURE: the
 * eye's line and the knee's (`FIGURE_DROP` under it), whichever is cut first. This is what the
 * lens may ride on; the Rig shortens to it.
 */
export function sightFraction(
  hx: number,
  hy: number,
  hz: number,
  ox: number,
  oy: number,
  oz: number,
  occluders: readonly Collider[],
  count: number = occluders.length,
): number {
  const eye = clearFraction(hx, hy, hz, ox, oy, oz, occluders, count);
  if (eye <= 0) return 0;
  const knee = clearFraction(hx, hy - FIGURE_DROP, hz, ox, oy, oz, occluders, count);
  return knee < eye ? knee : eye;
}

/** Extra pitch tried over the child's own, in order. Small steps first: rise only as far as needed. */
const LIFT_STEPS = [0, 0.1, 0.2, 0.32, 0.45, 0.6, 0.75, 0.9, 1.1, 1.35];
/**
 * How steep a lift may go before a swing is the better shot (about 69°). Past this a child walking
 * by a house would be looking at their own hat; round the corner is the kinder view.
 */
export const LIFT_SOFT_MAX = 1.2;
/** How steep it may go when turning is not allowed, or turning found nothing better (about 81°). */
export const LIFT_HARD_MAX = 1.42;

/**
 * Yaw offsets tried when the camera may turn, nearest the child's own first — the same fan
 * `pickBoom` uses, so the camera swings no further than it must.
 */
const YAW_TRIES = [0, 0.32, -0.32, 0.64, -0.64, 0.98, -0.98, 1.32, -1.32, 1.7, -1.7, 2.1, -2.1, 2.5, -2.5, 2.9, -2.9, Math.PI];

/** How much more of the child's own line must be clear before a swung camera goes home to it. */
export const HOME_MARGIN = 0.15;

/** A line the camera could sit on: its bearing, how far over the child's pitch, and how much of it is clear. */
export type View = { yaw: number; lift: number; frac: number; readable: boolean };

/**
 * How much of its length the boom must keep, as a fraction, for a line to count as a readable
 * shot: never nearer than `READ_DIST`, never nearer than the Rig's own floor (`minFrac`, so the
 * floor never has to push the lens through what cut the line), and — the old "good enough" —
 * never under `goodFrac` of the boom.
 */
export function readableNeed(dist: number, minFrac: number, goodFrac = 0.44): number {
  const n = READ_DIST / dist;
  return Math.min(1, Math.max(goodFrac, minFrac, n));
}

/**
 * The lowest lift over `pitch` at `yaw` that leaves a readable line, up to `maxPitch`. When none
 * does, the lift with the most clear line, lowest first on a tie, and `readable: false`.
 *
 * `hx, hy, hz` is the child's EYE (what must stay in view); `dist` the boom's length. Writes
 * into `out`.
 */
export function liftAt(
  out: View,
  hx: number,
  hy: number,
  hz: number,
  yaw: number,
  pitch: number,
  dist: number,
  occluders: readonly Collider[],
  count: number,
  need: number,
  maxPitch: number = LIFT_HARD_MAX,
): View {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const top = Math.max(pitch, maxPitch);
  let bestLift = 0;
  let bestFrac = -1;
  for (let i = 0; i < LIFT_STEPS.length; i++) {
    const p = Math.min(top, pitch + LIFT_STEPS[i]);
    const h = dist * Math.cos(p);
    const ox = h * sin;
    const oy = dist * Math.sin(p);
    const oz = h * cos;
    // `sightFraction`, with the knee's line only asked about once the eye's already reads.
    const eye = clearFraction(hx, hy, hz, ox, oy, oz, occluders, count);
    const f = eye < need ? eye : Math.min(eye, clearFraction(hx, hy - FIGURE_DROP, hz, ox, oy, oz, occluders, count));
    if (f >= need) {
      out.yaw = yaw;
      out.lift = p - pitch;
      out.frac = f;
      out.readable = true;
      return out;
    }
    // A step up has to buy a real gain to be the fallback; otherwise stay low.
    if (f > bestFrac + 0.02) {
      bestFrac = f;
      bestLift = p - pitch;
    }
    if (p >= top) break;
  }
  out.yaw = yaw;
  out.lift = bestLift;
  out.frac = Math.max(0, bestFrac);
  out.readable = false;
  return out;
}

// Scratch for the search. Module scope, so the per-frame path never allocates.
const TRY: View = { yaw: 0, lift: 0, frac: 0, readable: false };

function copy(out: View, v: View): View {
  out.yaw = v.yaw;
  out.lift = v.lift;
  out.frac = v.frac;
  out.readable = v.readable;
  return out;
}

/**
 * The readable shot nearest the child's own: their bearing lifted a little, then — only when
 * `mayTurn` — the nearest bearing to `fromYaw` (where the camera is now) that reads without
 * climbing past `LIFT_SOFT_MAX`, then their own bearing lifted as far as `LIFT_HARD_MAX`, then any
 * bearing that far. When nothing reads, the most open line found, `readable: false`.
 *
 * Searching out from where the camera IS, not from the child's yaw, is what keeps a swing going
 * the way it started. Walking the length of the chapel, the nearest open side from the child's
 * yaw flips from the nave's south end to the tower's north end halfway along; searched from the
 * child's yaw, the camera turned one way and then back the other. The child's own bearing is
 * still asked first, so the swing eases home once the roof is passed.
 *
 * `baseYaw` is the child's own yaw (0 = camera due south of them). The returned `yaw` is absolute.
 */
export function readableView(
  out: View,
  hx: number,
  hy: number,
  hz: number,
  baseYaw: number,
  pitch: number,
  dist: number,
  occluders: readonly Collider[],
  count: number,
  need: number,
  mayTurn: boolean,
  fromYaw: number = baseYaw,
  lean: number = 0,
): View {
  const soft = Math.max(pitch, LIFT_SOFT_MAX);
  const first = Math.abs(angleDelta(baseYaw, fromYaw)) < 1e-9 ? 1 : 0;
  // Their own bearing, a gentle rise. Once swung off it, the way home has to be clearly open, not
  // just open: a bearing that reads one stride and not the next would rock the camera to and fro.
  const home = first === 1 ? need : Math.min(1, need + HOME_MARGIN);
  if (liftAt(out, hx, hy, hz, baseYaw, pitch, dist, occluders, count, home, soft).readable) {
    out.readable = out.frac >= need;
    return out;
  }
  if (mayTurn && fan(out, hx, hy, hz, fromYaw, first, lean, pitch, dist, occluders, count, need, soft)) return out;
  // Nothing reads at a gentle rise: climb higher, their own bearing first.
  const best = liftAt(out, hx, hy, hz, baseYaw, pitch, dist, occluders, count, need, LIFT_HARD_MAX).frac;
  if (out.readable || !mayTurn) return out;
  copy(TRY_BEST, out);
  if (fan(out, hx, hy, hz, fromYaw, first, lean, pitch, dist, occluders, count, need, LIFT_HARD_MAX)) return out;
  // Nothing reads anywhere: the most open line the fan passed, or their own.
  return FAN_BEST.frac > best + 0.02 ? copy(out, FAN_BEST) : copy(out, TRY_BEST);
}

// More scratch for the fan.
const TRY_BEST: View = { yaw: 0, lift: 0, frac: 0, readable: false };
const FAN_BEST: View = { yaw: 0, lift: 0, frac: 0, readable: false };
const LEAN: View = { yaw: 0, lift: 0, frac: 0, readable: false };
const OTHER: View = { yaw: 0, lift: 0, frac: 0, readable: false };

/**
 * How much further round (radians) the side the camera is already turning toward may be, and still
 * be kept. Walking beside a long roof, which way round is nearer changes from one stride to the
 * next; without this the camera set off one way, then the other, then back.
 */
export const LEAN_BIAS = 1;

/**
 * The fan of bearings round `fromYaw`, nearest first, for a readable line up to `maxPitch`. With a
 * `lean` (the sign of the way the camera is already swung) it looks for the nearest readable
 * bearing on EACH side and keeps turning the way it is going unless the other way is nearer by
 * more than `LEAN_BIAS`. Writes the pick into `out` and returns true; false when nothing reads,
 * leaving the most open line it passed in `FAN_BEST`.
 */
function fan(
  out: View,
  hx: number,
  hy: number,
  hz: number,
  fromYaw: number,
  first: number,
  lean: number,
  pitch: number,
  dist: number,
  occluders: readonly Collider[],
  count: number,
  need: number,
  maxPitch: number,
): boolean {
  FAN_BEST.frac = -1;
  let leanOff = -1;
  let otherOff = -1;
  for (let i = first; i < YAW_TRIES.length; i++) {
    const off = YAW_TRIES[i];
    const mine = off === 0 || lean === 0 || Math.sign(off) === lean;
    if (mine ? leanOff >= 0 : otherOff >= 0) continue;
    liftAt(TRY, hx, hy, hz, fromYaw + off, pitch, dist, occluders, count, need, maxPitch);
    if (!TRY.readable) {
      if (TRY.frac > FAN_BEST.frac + 0.02) copy(FAN_BEST, TRY);
      continue;
    }
    // No lean, or straight ahead: the nearest readable bearing, as it comes.
    if (lean === 0 || off === 0) {
      copy(out, TRY);
      return true;
    }
    if (mine) {
      leanOff = Math.abs(off);
      copy(LEAN, TRY);
    } else {
      otherOff = Math.abs(off);
      copy(OTHER, TRY);
    }
    if (leanOff >= 0 && otherOff >= 0) break;
  }
  if (leanOff >= 0 && (otherOff < 0 || leanOff <= otherOff + LEAN_BIAS)) {
    copy(out, LEAN);
    return true;
  }
  if (otherOff >= 0) {
    copy(out, OTHER);
    return true;
  }
  return false;
}

/**
 * The occluders that can be a LID: lifted clear of the ground over the child's feet, the way a
 * canopy is. Only these may make the camera duck. A house, a tower or a castle wall stands on the
 * ground; ducking under it only walks the lens into it, which is how the camera by Sister Wren
 * ended up in the child's back. Copies into `dest`, which the caller owns; returns how many.
 */
export function gatherLids(dest: Collider[], near: readonly Collider[], count: number, feetY: number): number {
  let n = 0;
  for (let i = 0; i < count && n < dest.length; i++) {
    const c = near[i];
    if (c.base > feetY + LID_CLEAR) dest[n++] = c;
  }
  return n;
}

/** How far over the child's feet an occluder must start to be something they stand under. */
export const LID_CLEAR = 0.5;

/**
 * Under a lid when no bearing has this much of its boom clear of the lids. The ceiling scan asks
 * `pickBoom` with this as its "good enough" too: asked with the assist's 0.44, it stopped at the
 * first bearing between 0.44 and 0.52 and reported THAT as the best — one tree on the line, and
 * the camera ducked.
 */
export const DUCK_AT = 0.52;

/** What the Rig knows this frame. The caller owns it and rewrites it each frame. */
export type AimInput = {
  /** The child's eye, which is what must stay in the shot. */
  hx: number;
  eyeY: number;
  hz: number;
  /** The floor under the child: a lid is something that starts well over this. */
  feetY: number;
  /** The child's own yaw (the way W walks), and the camera's swing laid over it. */
  yawRef: number;
  swing: number;
  /** How fast the swing is turning now (`swingStep`'s momentum), radians a second. */
  swingVel: number;
  /** The boom the child holds (after the riding tilt and pull): pitch and length. */
  pitch: number;
  dist: number;
  /** The boom as it stands this frame, ducked or not, for the ceiling scan. */
  camH: number;
  camY: number;
  /** The Rig's floors: this frame's, and the one it keeps while it may turn itself. */
  minFrac: number;
  assistMin: number;
  /** Walking with the camera left alone: the swing assist is on. */
  assist: boolean;
  /** No hand on the camera, and none for the grace period: it may turn itself if it has to. */
  mayTurn: boolean;
};

/** The Rig's orders for this frame. */
export type Aim = {
  /** No bearing is clear of the lids: duck under them. */
  ceiling: boolean;
  /** Turn the camera toward `yaw` (absolute). When false, `yaw` is where it already is. */
  turn: boolean;
  yaw: number;
  /** How far over the child's pitch the line the camera is ON should rise. */
  lift: number;
  /** Whether that line, so lifted, is a readable shot. */
  readable: boolean;
};

const LIDS: Collider[] = new Array(1024);
const SCAN: Boom = { yaw: 0, frac: 1 };
const CUR: View = { yaw: 0, lift: 0, frac: 0, readable: false };
const WANT: View = { yaw: 0, lift: 0, frac: 0, readable: false };

/**
 * One frame's decision for the chase camera, given the occluders near the child (`gatherNear`).
 *
 *  - CEILING when no bearing is clear of the LIDS (`gatherLids`) — a wood's canopy, not a wall.
 *  - LIFT for the line the camera is on: the lowest rise over the child's pitch that reads.
 *  - TURN while walking (the swing assist, as before: toward the readable shot nearest the
 *    child's own yaw, so it eases back once the roof is passed), or when the hand has been off the
 *    camera for the grace period and the line it is on cannot be made readable at any lift.
 *    Never while the child is steering.
 */
export function aimBoom(out: Aim, i: AimInput, near: readonly Collider[], count: number): Aim {
  const nl = gatherLids(LIDS, near, count, i.feetY);
  // No floor on this scan: it is asking what is true, not where to put the lens.
  pickBoom(SCAN, i.hx, i.eyeY, i.hz, i.yawRef, i.camH, i.camY, LIDS, nl, DUCK_AT, 0);
  out.ceiling = SCAN.frac < DUCK_AT;

  const need = readableNeed(i.dist, i.minFrac);
  const yawNow = wrapAngle(i.yawRef + i.swing);
  // While it may turn, the line it is on reads only at a gentle rise — the same bar the search
  // below sets — or a turn would stop halfway, on a line skimming a roof at eighty degrees.
  const mayTurn = i.assist || i.mayTurn;
  liftAt(CUR, i.hx, i.eyeY, i.hz, yawNow, i.pitch, i.dist, near, count, need, mayTurn ? Math.max(i.pitch, LIFT_SOFT_MAX) : LIFT_HARD_MAX);
  // A lift that cannot show the child is still the most open line while the camera turns to a
  // side that can — it carries the lens up over the roof rather than into it. Under the child's
  // hand there is no turn coming: hold their pitch, and the boom comes in over the shoulder.
  out.lift = CUR.readable || mayTurn ? CUR.lift : 0;
  out.readable = CUR.readable;
  out.yaw = yawNow;
  out.turn = false;

  if (i.assist || (mayTurn && !CUR.readable)) {
    out.turn = true;
    if (out.ceiling) {
      // Under the canopy: the old assist, toward the most open bearing at the ducked boom.
      pickBoom(SCAN, i.hx, i.eyeY, i.hz, i.yawRef, i.camH, i.camY, near, count, 0.44, i.assistMin);
      out.yaw = SCAN.yaw;
    } else {
      // Keep turning the way it is already turning — or, at rest, the way it is swung — rather than
      // rocking (`LEAN_BIAS`).
      const lean = Math.abs(i.swingVel) > 0.05 ? Math.sign(i.swingVel) : i.swing > 0.01 ? 1 : i.swing < -0.01 ? -1 : 0;
      readableView(WANT, i.hx, i.eyeY, i.hz, i.yawRef, i.pitch, i.dist, near, count, need, true, yawNow, lean);
      out.yaw = WANT.yaw;
      // Already on that bearing: take the search's lift too. Its rungs are not the ones above (the
      // gentle pass stops at `LIFT_SOFT_MAX`), and a line grazing a corner can read on one and not
      // the other — the camera would then be told to turn to where it already is, and stay jammed.
      if (Math.abs(angleDelta(yawNow, WANT.yaw)) < 1e-6 && WANT.readable) {
        out.lift = WANT.lift;
        out.readable = true;
        out.turn = false;
      }
    }
  }
  return out;
}

/** Inside a ground-standing occluder (a wall, a tower, a trunk) — not a canopy, which dissolves. */
export function insideWall(x: number, y: number, z: number, near: readonly Collider[], count: number, feetY: number): boolean {
  for (let i = 0; i < count; i++) {
    const c = near[i];
    if (c.base > feetY + LID_CLEAR || y <= c.base || y >= c.top) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (c.round ? dx * dx + dz * dz < c.hw * c.hw : Math.abs(dx) < c.hw && Math.abs(dz) < c.hd) return true;
  }
  return false;
}

/**
 * How far out along the boom (ox, oy, oz) from the child's eye the lens should sit this frame: as
 * far as the whole figure can be seen (`sightFraction`), and at least the Rig's floor `minFrac` —
 * unless the floor would park the lens INSIDE a wall or a tower, in which case no further than the
 * eye's line reaches. A lens behind a wall shows the inside of the wall; a lens in a canopy is left
 * alone, because the wood dissolves round the lens (`nearCutout`).
 */
export function lensFrac(
  hx: number,
  hy: number,
  hz: number,
  feetY: number,
  ox: number,
  oy: number,
  oz: number,
  minFrac: number,
  near: readonly Collider[],
  count: number,
): number {
  const eye = clearFraction(hx, hy, hz, ox, oy, oz, near, count);
  const knee = eye <= 0 ? 0 : clearFraction(hx, hy - FIGURE_DROP, hz, ox, oy, oz, near, count);
  const sight = knee < eye ? knee : eye;
  if (sight >= minFrac) return sight;
  if (!insideWall(hx + ox * minFrac, hy + oy * minFrac, hz + oz * minFrac, near, count, feetY)) return minFrac;
  return Math.max(sight, Math.min(minFrac, eye));
}

/**
 * One frame of the camera's own turn: its `swing` over the child's yaw, toward `target`, the short
 * way round and never faster than `rate` a second. It eases in as it arrives — unless the line it
 * is on cannot show the child (`urgent`), when it goes straight at `URGENT_RATE` times the rate: a
 * drift is kind while the child is in view, and only slow while they are not. (Found stepping
 * sideways along the chapel with the camera over its roof: at the gentle rate the child was
 * behind the roof, then the tower, for a second and a half.)
 *
 * The turn has momentum (`vel`, radians a second, the caller's): it gathers and sheds speed over a
 * tenth of a second or so. Beside a long roof the side that reads can flicker from one stride to
 * the next; with no momentum the camera shivered between them. `target` null means stop turning,
 * which it does as gently. Returns the new swing.
 */
export function swingStep(
  vel: { v: number },
  swing: number,
  yawRef: number,
  target: number | null,
  dt: number,
  rate: number,
  urgent: boolean,
): number {
  let want = 0;
  let delta = 0;
  if (target !== null) {
    delta = angleDelta(wrapAngle(yawRef + swing), target);
    // Speed that would close the gap: all of it this frame when urgent, a 4-per-second ease otherwise.
    want = urgent ? delta / Math.max(dt, 1e-6) : delta * 4;
    const cap = urgent ? rate * URGENT_RATE : rate;
    if (want > cap) want = cap;
    else if (want < -cap) want = -cap;
  }
  vel.v += (want - vel.v) * (1 - Math.exp(-dt * SWING_GRIP));
  const step = vel.v * dt;
  // Arriving, it stops ON the bearing: momentum never carries it past and back.
  if (target !== null && (delta === 0 || (step > 0 ? step >= delta && delta > 0 : step <= delta && delta < 0))) {
    vel.v = 0;
    return wrapAngle(swing + delta);
  }
  return wrapAngle(swing + step);
}

/** How much faster the camera may turn while it cannot see the child at all. */
export const URGENT_RATE = 2;

/** How quickly the turn takes up and sheds speed, per second. */
export const SWING_GRIP = 9;
