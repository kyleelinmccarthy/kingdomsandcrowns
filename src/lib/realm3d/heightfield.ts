/**
 * SPIKE — throwaway. The terrain for /realm-3d, as pure arithmetic.
 *
 * Deliberately NOT a three.js module: the mesh builder and the hero both need the same
 * ground height, and the hero must not have to raycast a 40k-vertex mesh to stand on it.
 *
 * The village keeps a flat floor. `buildWorldLayout()` places every building, path tile and
 * villager on y = 0 and knows nothing about hills, so the ground under the village is held at
 * exactly zero out to FLAT_RADIUS and ramps into the hills over RAMP. Everything the spike is
 * trying to show — the sun raking across a slope, a hill shadowing the valley behind it —
 * happens in the ring outside that.
 */

/** The square of ground the spike draws, centred on the village. Half-extent. */
export const PATCH_HALF = 66;
/** The hero cannot leave this. A little inside the patch edge so the fog eats the seam. */
export const WALK_HALF = 58;
/** Nearly flat out to here: the village floor. */
export const FLAT_RADIUS = 25;
/** ...and blended into full relief by here. */
export const RAMP = 16;

function fract(n: number): number {
  return n - Math.floor(n);
}

function hash2(x: number, z: number): number {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

/** Bilinear value noise on the unit lattice, smoothstepped. Cheap and good enough for hills. */
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A deliberate landmark: noise alone gives lumps nobody steers by. */
function bump(x: number, z: number, cx: number, cz: number, h: number, rx: number, rz: number): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return h * Math.exp(-(dx * dx + dz * dz));
}

/** Ground height at a world point, in the same units as the layout. */
export function heightAt(x: number, z: number): number {
  let h = vnoise(x * 0.017, z * 0.017) * 11;
  h += vnoise(x * 0.043 + 4.2, z * 0.043 - 1.7) * 3.6;
  h += vnoise(x * 0.105 - 9.1, z * 0.105 + 3.3) * 0.9;
  h -= 7.4; // so the noise sits around zero rather than lifting the whole ring

  // Three named hills and one hollow. The tall one is north-west, behind the castle, so it is
  // in frame from the spawn point looking up the road — and so its shadow falls across the fells.
  h += bump(x, z, -44, -46, 21, 26, 30);
  h += bump(x, z, 47, -34, 15, 24, 22);
  h += bump(x, z, 34, 44, 12, 26, 20);
  h -= bump(x, z, -46, 30, 7, 22, 24);

  const r = Math.hypot(x, z);
  // NOT zero in the village. `buildWorldLayout()` puts everything on y = 0, so a faithful
  // reading would hold the village dead flat — and a dead-flat disc in the middle of rolling
  // ground looks like a bug. 14% of the relief is about a metre of roll across the whole
  // village: enough that the light finds an edge, gentle enough that a house sat on it with a
  // plinth under it does not float. That number IS the finding: the village data survives 3D
  // only if something re-seats it on the ground.
  return h * (0.14 + 0.86 * smoothstep(FLAT_RADIUS, FLAT_RADIUS + RAMP, r));
}

/** The same value noise, exported so the ground can be tinted in large blotches. 0..1. */
export function groundNoise(x: number, z: number): number {
  return vnoise(x, z);
}

/** Uphill direction and steepness, by central difference. Used to colour rock onto cliffs. */
export function slopeAt(x: number, z: number, eps = 1.2): number {
  const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return Math.hypot(dx, dz) / (2 * eps);
}
