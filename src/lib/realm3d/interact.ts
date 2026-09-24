/**
 * WHAT E WILL ACT ON — proximity over everything a child can press the interact key at.
 *
 * The scene owns positions and the frame loop, so it decides what is in reach; the HUD owns what
 * pressing E MEANS (the dialogue, the deed flow, the castle panel). They meet through
 * `HudBus.onNear` / `onInteract` and an `InteractTarget`, and this file is the scene's half.
 *
 * Not a three.js module, and allocation-free per frame: the spots are built once, each carries
 * its own prebuilt `InteractTarget`, so announcing a change hands the HUD the same object every
 * time rather than a fresh one sixty times a second.
 */

import type { InteractTarget } from "./hud-bus";
import { ENTER_VERB, hasRoom } from "./doorways";

/** One thing in the world with a reach round it. */
export type InteractSpot = {
  target: InteractTarget;
  x: number;
  z: number;
  /** Footprint half-extents (the radius, when round). Reach is measured from the EDGE. */
  hw: number;
  hd: number;
  round: boolean;
  /** How far from the footprint's edge the child may stand and still act on it. */
  reach: number;
  /**
   * Subtracted from the distance when two things are both in reach. A villager stands in front
   * of their own site, and a child walking up to Old Bram means Old Bram, not the well.
   */
  bias: number;
  /** Radius of the ground highlight, so the ring hugs the thing rather than a fixed size. */
  ring: number;
};

/** Stickiness: a new nearest must beat the current one by this much to take over. */
export const SWITCH_MARGIN = 0.35;
/** ...and the current one is let go this far past its reach, so standing on the line is quiet. */
export const RELEASE_MARGIN = 0.4;

/** Distance from (x, z) to the spot's footprint edge; 0 inside it. */
export function edgeDistance(s: InteractSpot, x: number, z: number): number {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.round) return Math.max(0, Math.hypot(dx, dz) - s.hw);
  const ox = Math.max(0, Math.abs(dx) - s.hw);
  const oz = Math.max(0, Math.abs(dz) - s.hd);
  return Math.hypot(ox, oz);
}

/**
 * The index of the spot E would act on from (x, z), or -1. `current` is last frame's answer;
 * passing it back is what makes the choice sticky rather than flickering between two things a
 * child is standing equally close to.
 */
export function pickSpot(spots: readonly InteractSpot[], x: number, z: number, current: number): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const d = edgeDistance(s, x, z);
    if (d > s.reach) continue;
    const score = d - s.bias;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (current >= 0 && current < spots.length) {
    const c = spots[current];
    const d = edgeDistance(c, x, z);
    if (d <= c.reach + RELEASE_MARGIN) {
      if (best < 0 || best === current) return current;
      if (bestScore > d - c.bias - SWITCH_MARGIN) return current;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ building */

type SiteProp = { id: string; kind: string; label: string; position: { x: number; z: number }; size: { w: number; d: number } };
type LandmarkLike = { id: string; name: string; position: { x: number; z: number } };

export type SpotInput = {
  /** The layout's props: villagers, buildings and foundations are taken from here. */
  props: readonly SiteProp[];
  /** How much wider on the ground the scene re-plots every site. */
  sitePlan: number;
  landmarks: readonly LandmarkLike[];
  /** A landmark's own footprint radius (what is built there), by id. */
  landmarkRadius?: (id: string) => number;
  /** The castle's gate, or the castle grounds' — null leaves the castle out entirely. */
  castle: { x: number; z: number; hw: number; hd: number; label: string; verb?: string } | null;
  /** The hitching posts (`travel.ts`), by the destination each belongs to. Absent, there are none. */
  posts?: readonly { id: string; x: number; z: number }[];
  /** The Ring's arch (`recess/course.ts`), where E runs the Ring. Absent, there is none. */
  arch?: { x: number; z: number; halfSpan: number } | null;
};

/** What E at the arch says to a child; the frame re-words it for a visiting grown-up (`recess/copy.ts`). */
export const ARCH_VERB = "Run";
export const ARCH_LABEL = "the Ring";

/** What E at a hitching post says. */
export const POST_VERB = "Ride from";
export const POST_LABEL = "the hitching post";

/** "the Chapel", "the Village Well". */
export function siteLabel(label: string): string {
  return /^the\s/i.test(label) ? label : `the ${label}`;
}

export function buildSpots(input: SpotInput): InteractSpot[] {
  const out: InteractSpot[] = [];
  for (const p of input.props) {
    if (p.kind === "villager") {
      const id = p.id.startsWith("villager-") ? p.id.slice("villager-".length) : p.id;
      out.push({
        target: { kind: "villager", id, label: p.label },
        x: p.position.x,
        z: p.position.z,
        hw: 0.45,
        hd: 0.45,
        round: true,
        reach: 2.1,
        bias: 0.6,
        ring: 0.95,
      });
    } else if (p.kind === "building" || p.kind === "foundation") {
      const hw = (p.size.w * input.sitePlan * 1.06) / 2;
      const hd = (p.size.d * input.sitePlan * 1.06) / 2;
      out.push({
        // A raised building with an inside says so: "Go into the Chapel", not "Look at".
        target: { kind: "site", id: p.id, label: siteLabel(p.label), ...(p.kind === "building" && hasRoom(p.id) ? { verb: ENTER_VERB } : {}) },
        x: p.position.x,
        z: p.position.z,
        hw,
        hd,
        round: false,
        reach: 1.7,
        bias: 0,
        ring: Math.hypot(hw, hd) + 0.35,
      });
    }
  }
  if (input.castle) {
    const c = input.castle;
    out.push({
      target: { kind: "castle", id: "castle", label: c.label, ...(c.verb ? { verb: c.verb } : {}) },
      x: c.x,
      z: c.z,
      hw: c.hw,
      hd: c.hd,
      round: false,
      reach: 2.6,
      bias: 0,
      ring: Math.max(c.hw, c.hd) + 1.1,
    });
  }
  for (const l of input.landmarks) {
    const r = input.landmarkRadius?.(l.id) ?? 1;
    out.push({
      target: { kind: "landmark", id: l.id, label: l.name },
      x: l.position.x,
      z: l.position.z,
      hw: r,
      hd: r,
      round: true,
      reach: 3.2,
      bias: 0,
      ring: r + 1.1,
    });
  }
  for (const p of input.posts ?? []) {
    out.push({
      target: { kind: "post", id: p.id, label: POST_LABEL, verb: POST_VERB },
      x: p.x,
      z: p.z,
      hw: 0.9,
      hd: 0.9,
      round: true,
      reach: 1.6,
      // A post stands at a place's edge: standing at it means the post, not the place.
      bias: 0.4,
      ring: 1.5,
    });
  }
  if (input.arch) {
    const a = input.arch;
    out.push({
      target: { kind: "arch", id: "ring", label: ARCH_LABEL, verb: ARCH_VERB },
      // The arch spans the cobbles east to west: its reach is the gap between its pillars, and a step either side.
      x: a.x,
      z: a.z,
      hw: a.halfSpan,
      hd: 0.6,
      round: false,
      reach: 2,
      bias: 0.3,
      ring: a.halfSpan + 0.6,
    });
  }
  return out;
}
