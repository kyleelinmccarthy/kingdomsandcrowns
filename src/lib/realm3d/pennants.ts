/**
 * WHERE A GILDED BUILDING'S PENNANT FLIES: the foot of its pole, on top of the roof the scene
 * draws. Pure, so the rule is tested without three; `gilded-pennants.tsx` only draws it.
 *
 * Not from the prop's `size.h`: that is the old sprite's height (2.5 for a cottage), and
 * `spike-scene.tsx` draws every building at absolute heights measured against the hero
 * (eaves at 3.1 and a 2.25 roof). A pole planted at `size.h` would stand inside the roof.
 */

import type { Prop } from "@/lib/realm/layout";

export type PennantSpot = { id: string; x: number; y: number; z: number };

/** A cottage's ridge: `WALL_H + ROOF_H` in spike-scene.tsx. */
const RIDGE = 3.1 + 2.25;

/**
 * Where the others top out, as spike-scene.tsx draws them. The chapel's pennant goes on its
 * steeple (8.35 high, set back 2.75: half the re-plotted 4.5 depth, plus 0.5) so it is not lost
 * against the spire behind the ridge; the garden has no roof, so its pole stands in the beds.
 */
const TOPS: Record<string, { top: number; dz?: number }> = {
  well: { top: 4.5 },
  watchtower: { top: 7.8 },
  chapel: { top: 8.35, dz: -2.75 },
  garden: { top: 0 },
};

export function pennantSpots(props: readonly Prop[], gilded: readonly string[], groundAt: (x: number, z: number) => number): PennantSpot[] {
  if (gilded.length === 0) return [];
  const out: PennantSpot[] = [];
  for (const p of props) {
    if (p.kind !== "building" || !gilded.includes(p.id)) continue;
    const { top, dz = 0 } = TOPS[p.id] ?? { top: RIDGE };
    const { x, z } = p.position;
    out.push({ id: p.id, x, y: groundAt(x, z) + top, z: z + dz });
  }
  return out;
}
