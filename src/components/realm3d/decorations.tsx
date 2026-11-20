"use client";

/**
 * THE DECORATIONS a hero has found in the world's chests, drawn at their fixed spots (owner: "appear
 * at set spots"; `DECOR` in `lib/realm/decor.ts`, held clear of the village by `world-clearance.ts`).
 * The shapes are `world-lock-boxes.ts`' `decorBoxes`; this only places and merges them.
 *
 * A sibling of the memoised `World`, like the locks themselves, so a find appearing never makes
 * `World` re-render. One geometry and one vertex-coloured material for every decoration, rebuilt
 * only when the set found changes (the frame keeps `decor` the same array until then,
 * `use-world-state.ts`), never per frame. Drawn whether or not the locks are switched on: what was
 * found stays (R-G7). Nothing here is solid: the hero walks past a bench rather than snagging.
 */

import { useMemo } from "react";
import { DECOR, type DecorId } from "@/lib/realm/decor";
import { decorBoxes } from "@/lib/realm3d/world-lock-boxes";
import { mergeBoxHosts } from "./geo-kit";
import { MergedMesh } from "./merged-mesh";

/** Sunk a little, so a decoration on a slope never shows daylight under its downhill side. */
const SINK = 0.05;

export function Decorations({ decor, heightAt }: { decor?: readonly DecorId[]; heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(
    () => mergeBoxHosts((decor ?? []).map((id) => ({ boxes: decorBoxes(id), x: DECOR[id].x, y: heightAt(DECOR[id].x, DECOR[id].z) - SINK, z: DECOR[id].z, yaw: DECOR[id].ry }))),
    [decor, heightAt],
  );
  return <MergedMesh geometry={geometry} />;
}
