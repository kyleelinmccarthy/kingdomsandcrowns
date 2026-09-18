/**
 * WORLD → SCREEN, for a perspective camera.
 *
 * The flat Realm's `worldToScreen` (src/lib/realm/camera.ts) was two lines of arithmetic
 * because its camera was orthographic and fixed: screen x was `(dx - dz) * zoom / √2` and
 * that was the whole of it — a linear map from the ground plane to pixels, with no division,
 * no near plane and no behind-the-camera case, because an orthographic camera has none of
 * those things. Every one of those three absences is now false, so that function is not
 * ported here; this is the derivation the perspective camera actually needs.
 *
 * What a perspective projection does to a point is one 4x4 multiply followed by a DIVIDE by
 * the fourth component. The fourth component is the thing the old maths never had, and it
 * carries both of the facts the nameplates need:
 *
 *   1. It is the point's distance in FRONT of the camera (for a standard perspective matrix
 *      the last row is (0, 0, -1, 0), so w = -z_view — the view-space depth). That is what a
 *      plate scales and fades by, and it is not the distance to the hero: a landmark forty
 *      units past the hero is sixty from a camera on a twenty-one-unit boom.
 *   2. Its SIGN says which side of the eye the point is on. Divide by a negative w and the
 *      point lands mirrored through the screen centre — an object behind the child's back
 *      draws a nameplate in front of their face, on the opposite side, moving the wrong way.
 *      That is the classic projection bug the brief names, and `w <= NEAR_W` is the whole of
 *      the fix: refuse, do not draw.
 *
 * Kept free of `three` so it can be tested under Vitest, which has no WebGL. The caller hands
 * over `camera.projectionMatrix.multiply(camera.matrixWorldInverse).elements` — a plain
 * 16-number array in COLUMN-major order, which is three's own layout, so `e[row + 4*col]`.
 */

/** A column-major 4x4, as `THREE.Matrix4.elements` hands it over. */
export type Mat4 = ArrayLike<number>;

/** Pixels from the canvas's top-left, plus the depth that got us there. */
export type ScreenPoint = { x: number; y: number; depth: number };

/**
 * Nearer than this in front of the eye and there is no honest screen position: w is on its way
 * through zero, the divide explodes, and a plate that should be gone slews across the whole
 * canvas in one frame. Well inside the camera's own near plane (0.5), so nothing that is
 * legitimately visible is ever refused by it.
 */
export const NEAR_W = 0.05;

export function makeScreenPoint(): ScreenPoint {
  return { x: 0, y: 0, depth: 0 };
}

/**
 * Writes the pixel position of a world point into `out` and returns true, or returns false and
 * leaves `out` alone when the point is at or behind the eye.
 *
 * Allocates nothing: `out` is the caller's, reused every frame for every plate. That is the
 * point of the signature — the naive version of this returns `{x, y}` or a `THREE.Vector3`,
 * and at thirty plates and sixty frames that is eighteen hundred objects a second handed to
 * the collector for a number the caller uses once.
 */
export function projectPoint(
  out: ScreenPoint,
  e: Mat4,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): boolean {
  // Row 3 of the matrix: the homogeneous w. Read first, because it alone decides whether
  // there is an answer at all, and the other three multiplies are wasted if there is not.
  const w = e[3] * x + e[7] * y + e[11] * z + e[15];
  if (!(w > NEAR_W)) return false;
  const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
  const inv = 1 / w;
  // NDC is -1..1 with y UP; the screen is 0..width/height with y DOWN.
  out.x = (cx * inv * 0.5 + 0.5) * width;
  out.y = (0.5 - cy * inv * 0.5) * height;
  out.depth = w;
  return true;
}

/** True when a projected point is inside the canvas, grown by `margin` px on every side. */
export function onScreen(p: ScreenPoint, width: number, height: number, margin: number): boolean {
  return p.x >= -margin && p.x <= width + margin && p.y >= -margin && p.y <= height + margin;
}
