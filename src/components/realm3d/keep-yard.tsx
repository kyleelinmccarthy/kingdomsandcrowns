"use client";

/**
 * THE KEEP YARD, drawn (R-D1): the plans board where the hero reads and builds the kingdom's plans,
 * and the stockpile, one heap per material sized by what the hero holds (`heapSize`), so the work
 * their quests brought is something they can see on the way into the village. The shapes and where
 * they stand are `keep-yard-boxes.ts`; this only paints, places and merges them.
 *
 * A sibling of the memoised `World`, like the pennants and the riddle stones. One geometry and one
 * vertex-coloured material for the whole yard: a single draw, rebuilt only when a heap changes
 * size (a build spends, a visit brings more), never per frame. Nothing here is solid: the hero
 * walks through a heap rather than snagging on it.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import type { MaterialId } from "@/lib/realm/materials";
import { heapBoxes, PLANS_BOARD_BOXES, PLANS_BOARD_YAW, stockpileHeaps, type YardBox } from "@/lib/realm3d/keep-yard-boxes";
import { litMaterial, merge, paint } from "./geo-kit";

/** Sunk a little, so a heap or a post on a slope never shows daylight under its downhill side. */
const SINK = 0.05;

/** Each box painted, turned by `yaw` about its spot and set down at (x, y, z). */
function placed(boxes: readonly YardBox[], x: number, y: number, z: number, yaw: number): THREE.BufferGeometry[] {
  return boxes.map((b) =>
    paint(new THREE.BoxGeometry(b.sx, b.sy, b.sz), b.color)
      .translate(b.x, b.y, b.z)
      .rotateY(yaw)
      .translate(x, y, z),
  );
}

export function KeepYard({ stockpile, heightAt }: { stockpile?: Readonly<Record<MaterialId, number>>; heightAt: (x: number, z: number) => number }) {
  const heaps = useMemo(() => (stockpile ? stockpileHeaps(stockpile) : []), [stockpile]);
  const geometry = useMemo(() => {
    const { x, z } = KEEP_YARD.plansBoard;
    const parts = placed(PLANS_BOARD_BOXES, x, heightAt(x, z) - SINK, z, PLANS_BOARD_YAW);
    // Square to the world, as `heapBoxes` keeps them inside their spots.
    for (const h of heaps) parts.push(...placed(heapBoxes(h.size).map((b) => ({ ...b, color: h.color })), h.x, heightAt(h.x, h.z) - SINK, h.z, 0));
    const merged = merge(parts);
    for (const p of parts) p.dispose();
    return merged;
  }, [heaps, heightAt]);
  const material = useMemo(() => litMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}
