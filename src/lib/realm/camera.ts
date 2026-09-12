import type { Vec2 } from "./layout";

/** Fixed tabletop angle from the spike: equal offsets on all three axes, looking at the follow point. */
export const CAMERA_OFFSET = { x: 12, y: 12, z: 12 };
export const CAMERA_ZOOM = 40;
const SMOOTHING_SECONDS = 0.25;

/** Eases the follow point toward the hero; snaps when a hero has asked for no motion. */
export function followCamera(current: Vec2, hero: Vec2, dt: number, opts: { reducedMotion: boolean }): Vec2 {
  if (opts.reducedMotion) return { x: hero.x, z: hero.z };
  const k = 1 - Math.exp(-dt / SMOOTHING_SECONDS);
  return { x: current.x + (hero.x - current.x) * k, z: current.z + (hero.z - current.z) * k };
}

export type Viewport = { width: number; height: number };
/** Pixels from the viewport's top-left. */
export type ScreenPoint = { x: number; y: number };

/** Basis divisors for the fixed tabletop camera: right = (1, 0, -1)/√2, up = (-1, 2, -1)/√6. */
const RIGHT_DIV = Math.SQRT2;
const UP_DIV = Math.sqrt(6);

/**
 * Where a ground point lands on screen, for the fixed tabletop camera.
 * Derived from CAMERA_OFFSET (12, 12, 12) looking at (target.x, 0, target.z) with up (0, 1, 0) —
 * never from a hard-coded screen coordinate. R3F's default orthographic frustum is the canvas in
 * pixels, so `zoom` is exactly pixels per world unit. Screen y grows downward.
 *
 * Exported for its test, not for a caller: `edgeArrow` below is the only consumer, and
 * camera.test.ts asserts the two agree about where a point is. Un-exporting it would delete
 * that agreement check, which is the thing that keeps the arrow and the camera in step.
 */
export function worldToScreen(camTarget: Vec2, world: Vec2, viewport: Viewport, zoom: number = CAMERA_ZOOM): ScreenPoint {
  const dx = world.x - camTarget.x;
  const dz = world.z - camTarget.z;
  return {
    x: viewport.width / 2 + (zoom * (dx - dz)) / RIGHT_DIV,
    y: viewport.height / 2 + (zoom * (dx + dz)) / UP_DIV,
  };
}

/** angle in radians, 0 = right, clockwise (screen y grows downward). */
export type EdgeArrow = { x: number; y: number; angle: number };

/** The world touch target (--realm-touch), so the arrow never sits under a HUD zone's edge. */
const DEFAULT_ARROW_MARGIN = 56;

function clampTo(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/**
 * Null when the target is comfortably on screen — inside the viewport inset by `margin`.
 * Otherwise the projection clamped to that inset rectangle, plus the heading from the viewport
 * centre to the *unclamped* projection, so the arrow points at the real site rather than at the
 * corner it was clamped into. A zero-size viewport (first frame, hidden tab) is null: there is no
 * rectangle to point across.
 */
export function edgeArrow(
  camTarget: Vec2,
  target: Vec2,
  viewport: Viewport,
  opts?: { margin?: number; zoom?: number },
): EdgeArrow | null {
  const { width, height } = viewport;
  if (!(width > 0) || !(height > 0)) return null;
  const margin = opts?.margin ?? DEFAULT_ARROW_MARGIN;
  const point = worldToScreen(camTarget, target, viewport, opts?.zoom ?? CAMERA_ZOOM);
  const onScreen =
    point.x >= margin && point.x <= width - margin && point.y >= margin && point.y <= height - margin;
  if (onScreen) return null;
  return {
    x: clampTo(point.x, margin, width - margin),
    y: clampTo(point.y, margin, height - margin),
    angle: Math.atan2(point.y - height / 2, point.x - width / 2),
  };
}
