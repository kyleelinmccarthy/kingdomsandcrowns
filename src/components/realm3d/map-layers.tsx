"use client";

/**
 * THE MAP'S LAYERS, shared by the two maps: the corner minimap (`hud.tsx`), a window that pans
 * with the hero, and the big map (`world-map.tsx`), the whole island at once. Everything here is
 * drawn in WORLD units, north up, so the minimap pans it all with one transform on its group and
 * the big map simply sets a viewBox over the island.
 *
 * Glyphs are drawn in a ±3.4 box and counter-scaled by `glyphScale` (`glyphScaleFor(window)` in
 * `lib/realm3d/minimap.ts`), so a place mark is the same size on screen whatever the map's scale.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Goal } from "@/lib/realm3d/guide";
import { BAKE_N, mapShade } from "@/lib/realm3d/minimap";
import { BIOME_COLORS, WORLD_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";

/**
 * One silhouette per kind of place, so a child tells a summit from a cove without a legend —
 * the same argument the flat Realm's map made for its five glyphs, applied to seven kinds.
 * Drawn in a ±3.4 box and counter-scaled, so a glyph is the same size however the map pans.
 */
const PLACE_GLYPH: Record<string, string> = {
  // A peak.
  summit: "M0,-3.6 L3.4,3 L-3.4,3 Z",
  // Three trees crowded together.
  deepwood: "M0,-3.6 L2.2,0.4 L1.1,0.4 L2.6,3.2 L-2.6,3.2 L-1.1,0.4 L-2.2,0.4 Z",
  // Still water: a flat lens.
  tarn: "M-3.4,0 A3.4,2.1 0 0,1 3.4,0 A3.4,2.1 0 0,1 -3.4,0 Z",
  // A bay bitten out of the coast.
  cove: "M-3.4,-2.6 L3.4,-2.6 A3.4,3.4 0 0,1 -3.4,-2.6 Z",
  // Reeds.
  mire: "M-3,3 L-3,-1 M0,3 L0,-3.4 M3,3 L3,-1",
  // A broken tooth of rock.
  outcrop: "M-3.2,3.2 L-1.4,-3.4 L0.4,0.2 L1.6,-2.4 L3.2,3.2 Z",
  // One of the five places the flat Realm authored, carried through: a ring, because it is
  // somewhere to GO rather than something to do. The same reasoning, and the same shape, as
  // `realm-minimap.tsx` — a child who has played the flat Realm already knows this mark.
  place: "M0,-3.2 A3.2,3.2 0 1,1 0,3.2 A3.2,3.2 0 1,1 0,-3.2 Z",
};

/** Home: a keep with crenellations, the biggest mark on the map because it is where you live. */
const CASTLE_GLYPH = "M-4.6,3.4 L-4.6,-1.4 L-3.2,-1.4 L-3.2,-3 L-1.8,-3 L-1.8,-1.4 L1.8,-1.4 L1.8,-3 L3.2,-3 L3.2,-1.4 L4.6,-1.4 L4.6,3.4 Z";
/** You: a fat kite, pointing where the next step goes. Both maps draw the hero with it. */
export const YOU_GLYPH = "M0,-6 L4.1,3.6 L0,1.4 L-4.1,3.6 Z";
/** The goal: a gold disc with a !, the same mark that floats over the villager in the world. */
const GOAL_BANG = "M-0.7,-3 L0.7,-3 L0.45,0.9 L-0.45,0.9 Z M0,1.7 A0.75,0.75 0 1,1 0,3.2 A0.75,0.75 0 1,1 0,1.7 Z";

/**
 * Paints the island into a bitmap, in bands, off the frame loop.
 *
 * The island's ground is a noise field, so there is no list of rectangles for the map to trace
 * the way the flat Realm's map traced `layout.terrain` — the only honest map of a generated
 * surface is a picture of it. Twenty-five thousand `biomeAt` calls is about six times that
 * many noise queries, which is far too much for one frame, so it goes out in bands of eight
 * rows on `setTimeout(0)`: the map shows its roads and its marks immediately and the land
 * arrives over the next second, and no frame is ever long.
 */
export function useBakedLand(world: RealmWorld): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = BAKE_N;
    canvas.height = BAKE_N;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const step = (2 * WORLD_HALF) / BAKE_N;
    let row = 0;
    let timer = 0;
    let cancelled = false;
    const band = () => {
      if (cancelled) return;
      const end = Math.min(BAKE_N, row + 8);
      for (; row < end; row++) {
        const z = -WORLD_HALF + (row + 0.5) * step;
        for (let col = 0; col < BAKE_N; col++) {
          const x = -WORLD_HALF + (col + 0.5) * step;
          const biome = world.biomeAt(x, z);
          // Darkened, so the gold marks and the parchment names read on top of it. The colours
          // themselves are the GROUND's own, so the map cannot drift from the island.
          // Barely darkened. The first pass took the ground colours down to 0.64 and the
          // island came out as one olive smudge with grey smears on it — the heath, the moor
          // and the crags are all mid-greys to begin with, and dimming them killed the only
          // thing separating them from the wood. At 0.85 the biomes read apart and the gold
          // marks and cream roads still sit clearly on top; the sea is left alone, because a
          // map whose water is not obviously water is not a map of an island.
          ctx.fillStyle = mapShade(BIOME_COLORS[biome], biome === "ocean" ? 1 : 0.85);
          ctx.fillRect(col, row, 1, 1);
        }
      }
      if (row < BAKE_N) {
        timer = window.setTimeout(band, 0);
        return;
      }
      setUrl(canvas.toDataURL("image/png"));
    };
    timer = window.setTimeout(band, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [world]);
  return url;
}

/**
 * The land, the roads, every place (hollow until found), home, the caller's extra marks and the
 * goal's gold !, in that order, in world units. A fragment: the caller puts it in its own group.
 */
export function MapLayers({
  world,
  land,
  found,
  castle,
  goal,
  glyphScale,
  children,
}: {
  world: RealmWorld;
  /** The baked land (`useBakedLand`), or null while it is still being painted. */
  land: string | null;
  found: ReadonlySet<string>;
  /** Whether the child's castle stands. No castle, no home mark. */
  castle: boolean;
  /** Who the objective card sends the child to: a gold ! on the map. */
  goal: Goal;
  /** `glyphScaleFor(window)`: how much to scale a ±3.4 glyph for this map's window. */
  glyphScale: number;
  /** More marks in world units, drawn under the goal: the troubles' dots, the Ring. */
  children?: ReactNode;
}) {
  const roads = useMemo(
    () =>
      world.roads.map((r) => ({
        id: r.id,
        d: r.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" "),
      })),
    [world],
  );
  return (
    <>
      {land && (
        <image href={land} x={-WORLD_HALF} y={-WORLD_HALF} width={WORLD_HALF * 2} height={WORLD_HALF * 2} preserveAspectRatio="none" />
      )}
      {roads.map((r) => (
        <path key={r.id} className="r3-map-road" d={r.d} strokeWidth={4} />
      ))}
      {world.landmarks.map((l) => (
        <g key={l.id} transform={`translate(${l.position.x} ${l.position.z}) scale(${glyphScale})`}>
          <path
            className={`r3-map-place r3-map-place--${l.kind}${found.has(l.id) ? " r3-map-place--found" : ""}`}
            d={PLACE_GLYPH[l.kind] ?? PLACE_GLYPH.place}
          />
        </g>
      ))}
      {castle && (
        <g transform={`translate(0 -14) scale(${glyphScale})`}>
          <path className="r3-map-home" d={CASTLE_GLYPH} />
        </g>
      )}
      {children}
      {/*
        The one thing on the map that says GO HERE. Drawn last so no road or place sits on top
        of it, at the villager's own position, so it pans with the land for free.
      */}
      {goal.on && (
        <g className="r3-map-goal" transform={`translate(${goal.x} ${goal.z}) scale(${glyphScale})`}>
          <circle r={4.6} />
          <path d={GOAL_BANG} />
        </g>
      )}
    </>
  );
}
