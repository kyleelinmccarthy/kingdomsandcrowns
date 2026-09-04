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
