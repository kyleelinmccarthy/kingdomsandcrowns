/**
 * SPIKE — the ground for /realm-3d, as pure arithmetic.
 *
 * Deliberately NOT a three.js module: the mesh builder and the hero both need the same ground
 * height, and the hero must not have to raycast a 200k-triangle mesh to stand on it.
 *
 * ## This used to BE the terrain. Now it is a doorway to the one that replaced it.
 *
 * It was three octaves of value noise, three named hills and a hollow, over a 132-unit patch —
 * enough to prove that a light raking across a slope makes the village look like a place. The
 * realm is now generated: `worldgen.ts` shapes a 640-unit island, and the village sits in it
 * rather than on a patch of its own.
 *
 * So `heightAt` is now one line, and that is the point. Four modules already asked this function
 * where the ground is — the scene, the colliders, the hero's own figure, the tests — and every
 * one of them has to get the SAME answer as the mesh under their feet, or somebody floats. Left
 * as its own noise field it would be a second, disagreeing terrain; forwarded to the generator
 * it is the single source, and no caller had to learn a new name for it.
 *
 * The generator is built on first ask and cached (`realmWorld()`), so importing this costs
 * nothing until somebody actually asks where the ground is.
 */

import { realmWorld, WALK_HALF as WORLD_WALK_HALF } from "./worldgen";

/** Kept for the callers that still measure things against the old patch. The realm is bigger. */
export const PATCH_HALF = 66;
/** The hero's clamp, now the island's rather than the patch's: the edge you meet is the sea. */
export const WALK_HALF = WORLD_WALK_HALF;
/** Nearly flat out to here: the village floor. The generator holds the same promise. */
export const FLAT_RADIUS = 25;
/** ...and blended into full relief by here. */
export const RAMP = 16;

function fract(n: number): number {
  return n - Math.floor(n);
}

function hash2(x: number, z: number): number {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

/** Bilinear value noise on the unit lattice, smoothstepped. Cheap, and only used for tinting. */
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Ground height at a world point, in the same units as the layout. */
export function heightAt(x: number, z: number): number {
  return realmWorld().heightAt(x, z);
}

/** The same value noise the ground tint uses, exported so blotches can be drawn in large patches. */
export function groundNoise(x: number, z: number): number {
  return vnoise(x, z);
}

/** Uphill steepness, by central difference. Used to colour rock onto cliffs. */
export function slopeAt(x: number, z: number, eps = 1.2): number {
  return realmWorld().slopeAt(x, z, eps);
}
