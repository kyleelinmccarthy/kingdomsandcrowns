"use client";

/**
 * WHAT THE HERO HAS BUILT, standing in the world (D13): every built level of every plan (a wing on
 * a raised building, the Chronicle Hall in the keep yard, the village decorations) and a plaque
 * stone in front of each, where E reads who built it and which quests paid for it. Where each one
 * stands is `improvement-spots.ts`; this only paints, places and merges.
 *
 * A sibling of the memoised `World`, like the pennants, the riddle stones and the keep yard. One
 * geometry and one vertex-coloured material for the whole lot: a single draw, rebuilt only when
 * a level is built (`built` is kept the same object until one is, `use-works.ts`), never per frame.
 * Nothing here is solid (RD-r): a wing is dressing beside a building and the plaque stones are small, so
 * the hero walks through rather than snagging.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { IMPROVEMENT_COLORS, type ImprovementBox } from "@/lib/realm/improvements";
import { improvementPlacements, PLAQUE_BOXES } from "@/lib/realm3d/improvement-spots";
import { litMaterial, merge, paint } from "./geo-kit";

/** Sunk a little, so a wing on a slope never shows daylight under its downhill side. */
const SINK = 0.05;

function boxGeometry(b: ImprovementBox, dx: number, dy: number, dz: number): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(b.sx, b.sy, b.sz), IMPROVEMENT_COLORS[b.color]).translate(b.x + dx, b.y + dy, b.z + dz);
}

export function Improvements({ built, heightAt }: { built?: Readonly<Record<string, number>>; heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(() => {
    const placements = improvementPlacements(built ?? {}, heightAt);
    if (placements.length === 0) return null;
    const parts: THREE.BufferGeometry[] = [];
    for (const p of placements) {
      // The boxes already carry the host's x and z; only the ground is added.
      for (const b of p.boxes) parts.push(boxGeometry(b, 0, p.y - SINK, 0));
      const ground = heightAt(p.plaque.x, p.plaque.z) - SINK;
      for (const b of PLAQUE_BOXES) parts.push(boxGeometry(b, p.plaque.x, ground, p.plaque.z));
    }
    const merged = merge(parts);
    for (const part of parts) part.dispose();
    return merged;
  }, [built, heightAt]);
  const material = useMemo(() => litMaterial(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return geometry ? <mesh geometry={geometry} material={material} castShadow receiveShadow /> : null;
}
