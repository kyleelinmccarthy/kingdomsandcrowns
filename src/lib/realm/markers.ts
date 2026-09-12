import type { Facing } from "./movement";
import type { VillagerStatus } from "./layout";

/**
 * Local-Z rotation for the notched hero ring, so the notch points where the hero will walk.
 *
 * The ring group is rotated [-Math.PI/2, 0, facingAngle(facing)] and the notch — with the
 * solid arrowhead that fills it — points along the geometry's local +Y. Under that X
 * rotation local +Y lands on world (-sin a, 0, -cos a), which is what makes these four
 * numbers the four compass directions. markers.test.ts re-derives them from FACING_VEC
 * rather than trusting this table, so a ring rewrite cannot silently invert the cue.
 */
const FACING_ANGLE: Record<Facing, number> = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 };

export function facingAngle(facing: Facing): number {
  return FACING_ANGLE[facing];
}

export const RING_INNER = 0.42;
export const RING_OUTER = 0.55;
export const RING_NOTCH_ARC = Math.PI / 3; // 60°, centred on the facing direction
export const RING_GOLD = "#c9a84c";
export const RING_CALM = "#8a7d5a";

/**
 * The flat diamond a figure or prop drops on the ground: the footprint, never a bar.
 *
 * It is an indirection on purpose. It takes only w and d — a Prop's `size` also carries `h`,
 * and an `h` reaching a mesh scale is how a shadow becomes a wall — it returns a fresh object
 * so nothing can write back into a memoised layout, and it is the single place a later slice
 * pads or clamps every shadow in the world at once.
 */
export function shadowFootprint(size: { w: number; d: number }): { w: number; d: number } {
  return { w: size.w, d: size.d };
}

export const SHADOW_OPACITY = 0.22;
export const SHADOW_OPACITY_CALM = 0.14;

/**
 * One ladder for everything that lies on the ground, so nothing hides under a path tile.
 * Every ground decal in the programme takes its y from a NAMED rung here; no file writes a
 * y literal for a ground decal. A later slice adding a rung inserts it in order — the test
 * walks Object.values and requires the ladder to stay strictly increasing.
 */
export const GROUND_Y = {
  water: 0.02, // slice 4's river decals — the lowest rung, under everything
  path: 0.03, // existing: realm-scene.tsx:270
  foundation: 0.04, // existing: realm-scene.tsx:279
  propShadow: 0.045, // buildings, castle, decor — never on a path
  lapWaypoint: 0.05, // existing: recess-layer.tsx:43
  // The gold ring around the objective site. It sits UNDER a figure's shadow on purpose:
  // the hero walks onto that site by construction, and a shadow belongs on top of the mark
  // it falls across. It has its own rung because `heroRing - 0.005` is exactly
  // `figureShadow` — coplanar transparent decals whose order the per-frame transparent
  // sort then flips as the camera moves, i.e. the gold "go here" ring flickering against
  // the hero's own shadow at the moment the child arrives.
  objectiveRing: 0.052,
  figureShadow: 0.055,
  heroRing: 0.06,
} as const;

/** What floats over a villager's head: a quest mark, a done mark, or nothing at all. */
export type MarkerKind = "quest" | "done" | null;

const MARKER: Record<VillagerStatus, MarkerKind> = { objective: "quest", built: "done", work: null };

export function markerFor(status: VillagerStatus): MarkerKind {
  return MARKER[status];
}

/** The gold column over the one objective site: thin, tall enough to clear a building, never solid. */
export const BEACON = { radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 } as const;
