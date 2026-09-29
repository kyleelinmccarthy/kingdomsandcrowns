/**
 * SPIKE — the arithmetic behind "I walked into the house and vanished".
 *
 * Deliberately NOT a three.js module, for the same reason `heightfield.ts` is not: the scene
 * runs this every frame inside `useFrame`, and it has to be testable without a WebGL context.
 *
 * SOLIDS — the boxes and circles a hero is stopped by. `slideMove` is the 3D twin of
 * `realm/movement.ts`'s `stepHero`: one axis at a time, a blocked axis cancelled rather
 * than the whole step. That is the whole trick behind sliding along a wall, and sliding is
 * the difference between a child who feels they are moving and a child who feels stuck.
 *
 * Nothing here allocates once the list is built. Everything that returns a pair of numbers
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

/**
 * How far a hero of `r` at (x, z) is inside `c`'s footprint: the distance they would have to
 * move to be clear. Positive only when they overlap. For a box it is the shallower of the two
 * axes, which is the way out `pushOut` would take.
 */
export function penetration(c: Collider, x: number, z: number, r: number): number {
  const dx = x - c.x;
  const dz = z - c.z;
  if (c.round) return c.hw + r - Math.sqrt(dx * dx + dz * dz);
  const px = c.hw + r - Math.abs(dx);
  const pz = c.hd + r - Math.abs(dz);
  return px < pz ? px : pz;
}

/**
 * Whether a step from (fx, fz) to (x, z) is refused by any solid.
 *
 * A solid the hero is ALREADY inside at the start of the step refuses only a step that takes
 * them deeper into it. That is the rule that makes "never left embedded" a property rather than
 * a list of rescues: the mover's body can grow where it stands (a mount's radius is wider than a
 * child's, and a knock or a stone's shove can leave anyone a hair inside a wall), and without
 * it the solver refuses every step whose destination still overlaps — which, from inside, is
 * nearly all of them. A child who got on a pony beside a tree could not move at all.
 */
function anyBlock(colliders: readonly Collider[], fx: number, fz: number, x: number, z: number, r: number, feetY: number): boolean {
  return stepBlocked(colliders, fx, fz, x, z, r, feetY);
}

/**
 * `anyBlock`, for any circle the mover carries: a mount's head and rump (`mount-body.ts`) are
 * stopped by exactly the rule the saddle is, so they too may always come out of what they are in.
 */
export function stepBlocked(colliders: readonly Collider[], fx: number, fz: number, x: number, z: number, r: number, feetY: number): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!blocks(c, x, z, r, feetY)) continue;
    // Already in it: out, or along it, is fine; further in is not.
    if (overlaps(c, fx, fz, r) && penetration(c, x, z, r) <= penetration(c, fx, fz, r) + 1e-9) continue;
    return true;
  }
  return false;
}

/**
 * One frame of motion against the solids, resolved axis by axis so a blocked axis is dropped
 * and the other still runs. Walk at a wall head-on and you stop; walk at it at an angle and you
 * slide along it. A hero who starts the frame inside something is never frozen by it: they may
 * move out of it or along it, never further in (`anyBlock`). Writes into `out` and returns it;
 * allocates nothing.
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
  if (anyBlock(colliders, fromX, fromZ, x, fromZ, r, feetY)) x = fromX;
  let z = toZ;
  if (anyBlock(colliders, x, fromZ, x, z, r, feetY)) z = fromZ;
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
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
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

export type WorldColliders = { solids: Collider[] };

const box = (x: number, z: number, hw: number, hd: number, base: number, top: number): Collider => ({ x, z, hw, hd, round: false, base, top });
const cyl = (x: number, z: number, r: number, base: number, top: number): Collider => ({ x, z, hw: r, hd: r, round: true, base, top });

/**
 * Turn the village and the wilderness into the list of solids the frame loop walks.
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
      continue;
    }
    if (p.kind !== "building") continue; // foundations, villagers, banners and path tiles are walked over

    const w = p.size.w * o.sitePlan;
    const d = p.size.d * o.sitePlan;

    if (p.id === "well") {
      solids.push(cyl(x, z, 1.75, g, g + 1.1));
      continue;
    }
    if (p.id === "garden") {
      // Waist-high beds. Solid, because you do not wade through a vegetable patch.
      solids.push(box(x, z, (w * 1.05) / 2, (d * 1.05) / 2, g, g + 1.0));
      continue;
    }
    if (p.id === "watchtower") {
      const h = p.size.h * 1.5;
      solids.push(box(x, z, w / 2, d / 2, g, g + h));
      continue;
    }

    // Every other raised site is the House shell: plaster box, gable over it.
    solids.push(box(x, z, (w * 1.06) / 2, (d * 1.06) / 2, g, g + o.wallH));

    if (p.id === "chapel") {
      // The bell tower is its own building, set off the back of the nave.
      const tz = z - d / 2 - 0.5;
      const tg = heightAt(x, tz);
      solids.push(box(x, tz, 1.05, 1.05, tg, tg + 5.6));
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
    }
  }

  return { solids };
}
