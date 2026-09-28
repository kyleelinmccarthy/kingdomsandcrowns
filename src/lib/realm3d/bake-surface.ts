/**
 * Which shared material a figure's part is baked into (`components/realm3d/figure-bake.tsx`).
 *
 * A baked figure is a handful of merged, vertex-coloured meshes instead of a draw per part, so every
 * part has to land in one of a few shared materials: plain lit surface, metal, something that makes
 * its own light, or glass. This is that sorting, on the three numbers that decide it, so it can be
 * tested with no `three`.
 */

export type BakeSurface = "lit" | "steel" | "glow" | "glass";

/** What decides a part's surface: see-through, how metal, and how much light it makes (emissive luminance × intensity). */
export type SurfaceTraits = { transparent: boolean; metalness: number; glow: number };

/** From here up a part reads as a light, not as a tint: a lit gem does, a crown's faint warmth does not. */
export const GLOW_MIN = 0.3;
/** From here up a part reads as metal. The figure's steel is 0.62, its buckles and crowns 0.55–0.8. */
const METAL_MIN = 0.3;

export function bakeSurface(t: SurfaceTraits): BakeSurface {
  if (t.transparent) return "glass";
  if (t.glow >= GLOW_MIN) return "glow";
  if (t.metalness >= METAL_MIN) return "steel";
  return "lit";
}
