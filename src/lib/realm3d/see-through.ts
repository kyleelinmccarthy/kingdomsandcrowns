/**
 * WHAT STANDS BETWEEN THE CAMERA AND THE CHILD, AND SO IS SEEN THROUGH.
 *
 * The owner: "it still zooms in when going into objects like trees and it shouldnt do that". So the
 * camera never moves itself to find the child (`chaseLens` in `controls.ts`); whatever is in the way
 * thins to a screen door instead — a tree, a roof, a wall, the castle. This is the rule, point by
 * point, in plain numbers, tested with no WebGL; `seeThrough` in `components/realm3d/geo-kit.ts` is
 * the same rule in GLSL, line for line, and takes these constants from here.
 *
 * The shape is the cone from the lens to the child's chest: `HERO_R` across at the child (the whole
 * figure, head to knee, with a margin), narrowing to nothing at the lens, so the hole is the same
 * size on screen however far back the camera is — what the figure covers, and a little more. Only
 * what is NEARER the lens than the child is thinned: the child's own last stretch, the ground they
 * stand on, and everything behind them stay whole.
 */

/** How far above the feet the cone aims: the chest, so head and knees are both inside it. */
export const AIM_Y = 1.2;
/** The cone's radius at the child, world units. The figure is 2.3 tall; this frames it with a margin. */
export const HERO_R = 1.7;
/** The stretch just before the child that is never thinned, so their feet and the ground at them stay solid. */
export const NEAR_HERO = 0.9;
/** Inside this share of the radius the cone is fully open; out to the radius it thickens back to solid. */
export const SOFT = 0.65;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of a surface at (px, py, pz) is drawn: 0 gone, 1 whole. The lens is at (cx, cy, cz),
 * the child's feet at (hx, hy, hz).
 */
export function seeThroughKeep(px: number, py: number, pz: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): number {
  const ax = hx - cx;
  const ay = hy + AIM_Y - cy;
  const az = hz - cz;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-6) return 1;
  const ux = ax / len;
  const uy = ay / len;
  const uz = az / len;
  const vx = px - cx;
  const vy = py - cy;
  const vz = pz - cz;
  // How far along the line toward the child the point is.
  const t = vx * ux + vy * uy + vz * uz;
  if (t <= 0 || t >= len - NEAR_HERO) return 1;
  const r = Math.hypot(vx - ux * t, vy - uy * t, vz - uz * t);
  const rad = (HERO_R * t) / len;
  return smoothstep(rad * SOFT, rad, r);
}
