import type { Vec2 } from "./layout";

/**
 * The camera sits at +x +y +z looking at the origin, so "up" on the screen
 * is the world direction (−1, −1) on the ground and "right" is (1, −1).
 * Stick and keys speak screen directions; the hero walks world directions.
 */
export function screenToWorldAxis(screen: { x: number; y: number }): Vec2 {
  const x = (screen.x - screen.y) * Math.SQRT1_2;
  const z = (-screen.x - screen.y) * Math.SQRT1_2;
  return { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z };
}
