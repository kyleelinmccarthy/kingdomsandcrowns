import type { Vec2 } from "./layout";

/**
 * The camera sits at +x +y +z looking at the origin, so "up" on the screen
 * is the world direction (−1, −1) on the ground and "right" is (1, −1).
 * Stick and keys speak screen directions; the hero walks world directions.
 * Clamps inputs longer than 1 to unit length (e.g., two keys held).
 */
export function screenToWorldAxis(screen: { x: number; y: number }): Vec2 {
  let sx = screen.x;
  let sy = screen.y;
  const len = Math.hypot(sx, sy);
  if (len > 1) {
    sx /= len;
    sy /= len;
  }
  const x = (sx - sy) * Math.SQRT1_2;
  const z = (-sx - sy) * Math.SQRT1_2;
  return { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z };
}
