"use client";

/**
 * THE KEEP YARD, drawn (R-D1): the plans board where the hero reads and builds the kingdom's plans,
 * the Scribe's lectern with the Chronicle open on it, and the stockpile, one heap per material sized
 * by what the hero holds (`heapSize`), so the work their quests brought is something they can see on
 * the way into the village. The shapes and where they stand are `keep-yard-boxes.ts`; this only paints, places and merges them.
 *
 * A sibling of the memoised `World`, like the pennants and the riddle stones. One geometry and one
 * vertex-coloured material for the whole yard: a single draw, rebuilt only when a heap changes
 * size (a build spends, a visit brings more), never per frame. Nothing here is solid: the hero
 * walks through a heap rather than snagging on it.
 */

import { useEffect, useMemo } from "react";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import type { MaterialId } from "@/lib/realm/materials";
import { heapBoxes, LECTERN_BOXES, LECTERN_YAW, PLANS_BOARD_BOXES, PLANS_BOARD_YAW, stockpileHeaps, type YardBox } from "@/lib/realm3d/keep-yard-boxes";
import { litMaterial, mergeBoxHosts, type BoxHost } from "./geo-kit";

/** Sunk a little, so a heap or a post on a slope never shows daylight under its downhill side. */
const SINK = 0.05;

export function KeepYard({ stockpile, heightAt }: { stockpile?: Readonly<Record<MaterialId, number>>; heightAt: (x: number, z: number) => number }) {
  const heaps = useMemo(() => (stockpile ? stockpileHeaps(stockpile) : []), [stockpile]);
  const geometry = useMemo(() => {
    const { x, z } = KEEP_YARD.plansBoard;
    const lectern = KEEP_YARD.lectern;
    const at = (spot: { x: number; z: number }, boxes: readonly YardBox[], yaw: number): BoxHost => ({ boxes, x: spot.x, y: heightAt(spot.x, spot.z) - SINK, z: spot.z, yaw });
    return mergeBoxHosts([
      at({ x, z }, PLANS_BOARD_BOXES, PLANS_BOARD_YAW),
      at(lectern, LECTERN_BOXES, LECTERN_YAW),
      // Square to the world, as `heapBoxes` keeps them inside their spots.
      ...heaps.map((h) => at(h, heapBoxes(h.size).map((b) => ({ ...b, color: h.color })), 0)),
    ])!;
  }, [heaps, heightAt]);
  const material = useMemo(() => litMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}
