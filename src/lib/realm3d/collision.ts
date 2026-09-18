/**
 * SPIKE — the arithmetic behind "I walked into the house and vanished".
 *
 * Deliberately NOT a three.js module, for the same reason `heightfield.ts` is not: the scene
 * runs this every frame inside `useFrame`, and it has to be testable without a WebGL context.
 *
 * Two jobs, one set of shapes:
 *
 *  1. SOLIDS — the boxes and circles a hero is stopped by. `slideMove` is the 3D twin of
 *     `realm/movement.ts`'s `stepHero`: one axis at a time, a blocked axis cancelled rather
 *     than the whole step. That is the whole trick behind sliding along a wall, and sliding is
 *     the difference between a child who feels they are moving and a child who feels stuck.
 *
 *  2. OCCLUDERS — the volumes that can put themselves between the camera and the child. These
 *     are a different list on purpose: a garden bed stops you but never hides you, an oak's
 *     canopy hides you but you walk under it, and a house's roof overhangs its walls so the
 *     thing that hides you is wider than the thing that stops you.
 *
 * Nothing here allocates once the lists are built. Everything that returns a pair of numbers
 * writes into a caller-owned object.
 */

import { heightAt } from "./heightfield";

/**
 * A box (round: false) or an upright cylinder (round: true), as a footprint plus a vertical
 * span. `base`/`top` are absolute world y, which is what lets a canopy start above head height.
 */
export type Collider = {
  x: number;
  z: number;
  /** Half-extent in x. The radius, when round. */
  hw: number;
  /** Half-extent in z. Equal to hw, when round. */
  hd: number;
  round: boolean;
  base: number;
  top: number;
};

export type Pt = { x: number; z: number };

/** Shoulder-width on a 2.3-unit hero. Wider than this and doorways start refusing him. */
export const HERO_RADIUS = 0.55;
/**
 * A lip this tall is stepped over rather than walked into, and a jump that carries the feet
 * this far above something's top clears it. Keeps a kerb from being a wall.
 */
export const STEP_UP = 0.28;

/* ------------------------------------------------------------------ solids */

/** True when a hero of `r` standing at (x, z) is inside `c`'s footprint. */
export function overlaps(c: Collider, x: number, z: number, r: number): boolean {
  const dx = x - c.x;
  const dz = z - c.z;
  if (c.round) {
    const reach = c.hw + r;
    return dx * dx + dz * dz < reach * reach;
  }
  return Math.abs(dx) < c.hw + r && Math.abs(dz) < c.hd + r;
}

/**
 * The same test with the hero's feet taken into account. The solver is horizontal — it never
 * pushes anyone down — but it does know how high off the ground they are, which is what lets a
 * jump carry a child over a vegetable bed and still refuses to let one through a wall.
 */
export function blocks(c: Collider, x: number, z: number, r: number, feetY: number): boolean {
  if (feetY >= c.top - STEP_UP) return false; // over the top of it
  return overlaps(c, x, z, r);
}

function anyBlock(colliders: readonly Collider[], x: number, z: number, r: number, feetY: number): boolean {
  for (let i = 0; i < colliders.length; i++) if (blocks(colliders[i], x, z, r, feetY)) return true;
  return false;
}

/**
 * One frame of motion against the solids, resolved axis by axis so a blocked axis is dropped
 * and the other still runs. Walk at a wall head-on and you stop; walk at it at an angle and you
 * slide along it. Writes into `out` and returns it; allocates nothing.
 *
 * `feetY` is where the hero's soles are this frame; pass -Infinity to ignore height entirely.
 */
export function slideMove(
  out: Pt,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  colliders: readonly Collider[],
  r: number = HERO_RADIUS,
  feetY: number = -Infinity,
): Pt {
  let x = toX;
  if (anyBlock(colliders, x, fromZ, r, feetY)) x = fromX;
  let z = toZ;
  if (anyBlock(colliders, x, z, r, feetY)) z = fromZ;
  out.x = x;
  out.z = z;
  return out;
}

/**
 * The height the hero's feet rest on at (x, z): the terrain, unless they are standing on top of
 * something solid and low enough to have got up onto. `feetY` is this frame's foot height, and
 * a top above it by more than a step is not something you are on — it is something in front
 * of you, which is the solver's business, not gravity's.
 */
export function supportHeight(
  x: number,
  z: number,
  terrainY: number,
  colliders: readonly Collider[],
  r: number = HERO_RADIUS,
  feetY: number = Infinity,
): number {
  let best = terrainY;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top <= best || c.top > feetY + STEP_UP) continue;
    if (overlaps(c, x, z, r)) best = c.top;
  }
  return best;
}

/**
 * If the hero is standing inside something solid — a spawn point that turned out to be under a
 * roof, or a village that changed shape around them — shove them out by the shortest way.
 * Not a per-frame call: run it once, when the world is built.
 */
export function pushOut(out: Pt, x: number, z: number, colliders: readonly Collider[], r: number = HERO_RADIUS): Pt {
  out.x = x;
  out.z = z;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const c of colliders) {
      if (!overlaps(c, out.x, out.z, r)) continue;
      const dx = out.x - c.x;
      const dz = out.z - c.z;
      if (c.round) {
        const d = Math.hypot(dx, dz) || 0.001;
        const reach = c.hw + r + 0.02;
        out.x = c.x + (dx / d) * reach;
        out.z = c.z + (dz / d) * reach;
      } else {
        const outX = c.hw + r + 0.02 - Math.abs(dx);
        const outZ = c.hd + r + 0.02 - Math.abs(dz);
        if (outX < outZ) out.x = c.x + Math.sign(dx || 1) * (c.hw + r + 0.02);
        else out.z = c.z + Math.sign(dz || 1) * (c.hd + r + 0.02);
      }
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/* --------------------------------------------------------------- occlusion */

/** Overlap of a ray's [0,1] span with one slab. Returns false when it misses. */
function slab(lo: number, hi: number, origin: number, delta: number, span: Pt): boolean {
  if (Math.abs(delta) < 1e-9) return origin > lo && origin < hi;
  let t0 = (lo - origin) / delta;
  let t1 = (hi - origin) / delta;
  if (t0 > t1) {
    const s = t0;
    t0 = t1;
    t1 = s;
  }
  if (t0 > span.x) span.x = t0;
  if (t1 < span.z) span.z = t1;
  return span.x <= span.z;
}

// Scratch for the slab tests. Module-scope so the per-frame path never allocates.
const SPAN: Pt = { x: 0, z: 0 };

/**
 * Where along the segment a→b it first enters `c`, as a fraction in [0, 1]. Returns 1 when the
 * segment misses entirely, and 0 when it starts inside. This is the number the camera rides on:
 * it is exactly how far down its own boom the camera may sit and still see the hero.
 */
export function segmentEntry(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  c: Collider,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  SPAN.x = 0;
  SPAN.z = 1;
  if (!slab(c.base, c.top, ay, dy, SPAN)) return 1;

  if (c.round) {
    // The infinite cylinder, then the height slab already in SPAN.
    const fx = ax - c.x;
    const fz = az - c.z;
    const qa = dx * dx + dz * dz;
    const qb = 2 * (fx * dx + fz * dz);
    const qc = fx * fx + fz * fz - c.hw * c.hw;
    if (qa < 1e-9) {
      if (qc > 0) return 1; // straight up, and outside the circle
    } else {
      const disc = qb * qb - 4 * qa * qc;
      if (disc < 0) return 1;
      const sq = Math.sqrt(disc);
      const t0 = (-qb - sq) / (2 * qa);
      const t1 = (-qb + sq) / (2 * qa);
      if (t0 > SPAN.x) SPAN.x = t0;
      if (t1 < SPAN.z) SPAN.z = t1;
      if (SPAN.x > SPAN.z) return 1;
    }
  } else {
    if (!slab(c.x - c.hw, c.x + c.hw, ax, dx, SPAN)) return 1;
    if (!slab(c.z - c.hd, c.z + c.hd, az, dz, SPAN)) return 1;
  }
  if (SPAN.z < 0 || SPAN.x > 1) return 1;
  return Math.max(0, SPAN.x);
}

/**
 * How far down a boom the camera can sit before something gets in the way, as a fraction of the
 * full offset. 1 means the whole village is between you and nothing.
 */
export function clearFraction(
  hx: number,
  hy: number,
  hz: number,
  ox: number,
  oy: number,
  oz: number,
  occluders: readonly Collider[],
  count: number = occluders.length,
): number {
  let best = 1;
  const bx = hx + ox;
  const by = hy + oy;
  const bz = hz + oz;
  for (let i = 0; i < count; i++) {
    const t = segmentEntry(hx, hy, hz, bx, by, bz, occluders[i]);
    if (t < best) {
      best = t;
      if (best <= 0) break;
    }
  }
  if (best >= 1) return 1;
  // Stop a shade short of the surface so the near plane never eats a roof tile.
  return Math.max(0, best - 0.025);
}

/**
 * Copy every collider within `radius` of (x, z) into `dest`, which the caller owns and reuses.
 * Returns how many. The wood is ~740 canopies; the camera only ever cares about the dozen or so
 * standing within a boom's length of the child.
 */
export function gatherNear(
  dest: Collider[],
  colliders: readonly Collider[],
  x: number,
  z: number,
  radius: number,
): number {
  let n = 0;
  for (let i = 0; i < colliders.length && n < dest.length; i++) {
    const c = colliders[i];
    const dx = c.x - x;
    const dz = c.z - z;
    const reach = radius + (c.hw > c.hd ? c.hw : c.hd);
    if (dx * dx + dz * dz <= reach * reach) dest[n++] = c;
  }
  return n;
}

/**
 * Yaw offsets tried, in order of how much they disturb the shot. The camera keeps the angle the
 * child chose whenever it can, and swings only as far as it must.
 */
const YAW_TRIES = [0, 0.32, -0.32, 0.64, -0.64, 0.98, -0.98, 1.32, -1.32, 1.7, -1.7, 2.1, -2.1, 2.5, -2.5, 2.9, -2.9, Math.PI];

export type Boom = { yaw: number; frac: number };

/**
 * Pick where the chase camera goes.
 *
 * A village is not a corridor, and the usual answer — pull the boom in until it is clear — has a
 * hard floor here: stand the hero against the far wall of a house and NO point behind that house,
 * at any distance and any sane pitch, can see him. The eaves are half a unit from his shoulder
 * and five units over his head. Pulling in just walks the camera into the wall.
 *
 * So the boom swings. The hero is always standing OUTSIDE the thing that is hiding him — that is
 * what the solids guarantee — so some direction around him is open, at worst the one he walked in
 * from. We try the child's own yaw first and take the nearest yaw that gives a clean line,
 * shortening the boom a little on the way for anything we can simply duck under or squeeze past.
 *
 * Writes into `out`. `frac` is a fraction of the full offset; `yaw` is absolute.
 */
export function pickBoom(
  out: Boom,
  hx: number,
  hy: number,
  hz: number,
  baseYaw: number,
  offH: number,
  offY: number,
  occluders: readonly Collider[],
  count: number = occluders.length,
  goodFrac = 0.44,
  minFrac = 0.22,
): Boom {
  let bestYaw = baseYaw;
  let bestFrac = -1;
  for (let i = 0; i < YAW_TRIES.length; i++) {
    const yaw = baseYaw + YAW_TRIES[i];
    const f = clearFraction(hx, hy, hz, offH * Math.sin(yaw), offY, offH * Math.cos(yaw), occluders, count);
    if (f >= 1 - 1e-6) {
      out.yaw = yaw;
      out.frac = 1;
      return out;
    }
    if (f > bestFrac) {
      bestFrac = f;
      bestYaw = yaw;
    }
    // Good enough beats perfect-but-sideways: a slightly short boom on the child's own angle is
    // a nicer shot than a clean one from somewhere they did not ask to look from.
    if (f >= goodFrac) {
      out.yaw = yaw;
      out.frac = f;
      return out;
    }
  }
  out.yaw = bestYaw;
  out.frac = Math.max(minFrac, bestFrac);
  return out;
}

/* ----------------------------------------------------------- world colliders */

/** The shape of a layout prop this module needs. `realm/layout.ts`'s `Prop` satisfies it. */
export type PlanProp = {
  id: string;
  kind: string;
  variant?: string;
  solid: boolean;
  position: { x: number; z: number };
  size: { w: number; d: number; h: number };
};

export type PlanOpts = {
  /** How much wider on the ground every village site was re-plotted. */
  sitePlan: number;
  /** Eaves height and roof rise, absolute, as the scene builds them. */
  wallH: number;
  roofH: number;
  /** How much the canopy trees grew with the village. */
  treeScale: number;
  /** Nothing past this is drawn, so nothing past it needs a collider. */
  patchHalf: number;
};

export type WorldColliders = { solids: Collider[]; occluders: Collider[] };

const box = (x: number, z: number, hw: number, hd: number, base: number, top: number): Collider => ({ x, z, hw, hd, round: false, base, top });
const cyl = (x: number, z: number, r: number, base: number, top: number): Collider => ({ x, z, hw: r, hd: r, round: true, base, top });

/** The decoration kinds whose canopy can swallow a child. Everything else is below eye level. */
const CANOPY: Record<string, { r: number; base: number; top: number }> = {
  oak: { r: 1.2, base: 1.0, top: 3.45 },
  pine: { r: 0.95, base: 0.9, top: 3.75 },
};

/**
 * Turn the village and the wilderness into the two lists the frame loop walks.
 *
 * WHAT IS SOLID, and why:
 *  - every raised building, the castle, the well, the garden. These are the things a child
 *    brings a deed TO. Their doors are scenery; nothing here has an inside.
 *  - the stone the old game already made solid: the menhirs of the ring, the big boulders, and
 *    the three great oaks that are landmarks to steer by. `realm/layout.ts` decided that and its
 *    reasoning holds — a wood of solid trunks is a maze, and a fence a child bounces off is a
 *    closed gate.
 *
 * WHAT IS NOT:
 *  - foundations. A site that is not built yet is a floor with scaffolding over it, and in the
 *    old game it is exactly where the child stands to work. Made solid, half the village's
 *    objectives would be places you cannot reach.
 *  - villagers, banners, signposts, fences, carts, lanterns, bushes, small rocks, path tiles.
 */
export function buildColliders(props: readonly PlanProp[], scenery: readonly PlanProp[], o: PlanOpts): WorldColliders {
  const solids: Collider[] = [];
  const occluders: Collider[] = [];

  for (const p of props) {
    const x = p.position.x;
    const z = p.position.z;
    const g = heightAt(x, z);

    if (p.kind === "castle") {
      const { w, d, h } = p.size;
      // The corner towers stand proud of the curtain wall, so the footprint is the towers'.
      const hw = w / 2 + 0.5 + w * 0.17;
      const hd = d / 2 + 0.4 + w * 0.17;
      solids.push(box(x, z, hw, hd, g, g + h));
      occluders.push(box(x, z, hw, hd, g - 2.4, g + h * 2.1));
      continue;
    }
    if (p.kind !== "building") continue; // foundations, villagers, banners and path tiles are walked over

    const w = p.size.w * o.sitePlan;
    const d = p.size.d * o.sitePlan;

    if (p.id === "well") {
      solids.push(cyl(x, z, 1.75, g, g + 1.1));
      occluders.push(cyl(x, z, 2.5, g, g + 4.5)); // the cap, which is wider than the parapet
      continue;
    }
    if (p.id === "garden") {
      // Waist-high beds. Solid, because you do not wade through a vegetable patch — but it
      // could never hide anyone, so it stays out of the camera's list entirely.
      solids.push(box(x, z, (w * 1.05) / 2, (d * 1.05) / 2, g, g + 1.0));
      continue;
    }
    if (p.id === "watchtower") {
      const h = p.size.h * 1.5;
      solids.push(box(x, z, w / 2, d / 2, g, g + h));
      occluders.push(box(x, z, (w * 1.25) / 2, (d * 1.25) / 2, g, g + h + 0.9));
      continue;
    }

    // Every other raised site is the House shell: plaster box, gable over it.
    solids.push(box(x, z, (w * 1.06) / 2, (d * 1.06) / 2, g, g + o.wallH));
    // The roof overhangs the walls by a fifth, and the overhang is what hides a child standing
    // against the far wall — so the camera's box is the roof's, not the wall's.
    occluders.push(box(x, z, (w * 1.2) / 2, (d * 1.2) / 2, g, g + o.wallH + o.roofH));

    if (p.id === "chapel") {
      // The bell tower is its own building, set off the back of the nave.
      const tz = z - d / 2 - 0.5;
      const tg = heightAt(x, tz);
      solids.push(box(x, tz, 1.05, 1.05, tg, tg + 5.6));
      occluders.push(box(x, tz, 1.6, 1.6, tg, tg + 8.4));
    }
  }

  const edge = o.patchHalf - 3;
  for (const s of scenery) {
    const x = s.position.x;
    const z = s.position.z;
    if (Math.abs(x) > edge || Math.abs(z) > edge) continue;
    const kind = s.variant ?? "rock";
    if (kind === "boat") continue; // the spike has no water for it to sit beside
    const g = heightAt(x, z) - 0.05;
    const tree = kind === "oak" || kind === "pine";
    const scale = (s.size.h / 1.4) * (tree ? o.treeScale : 1);

    if (s.solid) {
      // The layout's own ruling on what a child walks around, at the scale the scene draws it.
      const r = tree ? 0.42 * scale : (s.size.w / 2) * (kind === "menhir" ? 0.75 : 1);
      solids.push(cyl(x, z, Math.max(0.35, r), g, g + s.size.h));
      if (kind === "menhir") occluders.push(cyl(x, z, 0.45 * scale, g, g + 2.75 * scale));
      else if (!tree && scale > 1.6) occluders.push(cyl(x, z, 0.8 * scale, g, g + 0.95 * scale));
    }
    const canopy = CANOPY[kind];
    // Walk-through or not, a crown over the child's head is a lid the camera has to get around.
    if (canopy) occluders.push(cyl(x, z, canopy.r * scale, g + canopy.base * scale, g + canopy.top * scale));
  }

  return { solids, occluders };
}
