"use client";

/**
 * THE WORLD'S LOCKS, drawn: the old chests along the village lanes and the vault doors beside the
 * five places, each shut or standing open (`worldCanvas`). The shapes are `world-lock-boxes.ts`;
 * this only paints, turns, places and merges them. `ChestMesh` is one chest at the origin, for a
 * room to place (`interior-scene.tsx`).
 *
 * A sibling of the memoised `World`, like the keep yard and the improvements. One geometry and one
 * vertex-coloured material for every lock: a single draw, rebuilt only when a lock opens (the
 * frame keeps `locks` the same array until then, `use-world-state.ts`), never per frame. Nothing
 * here is solid (R-G6, the heaps' precedent): a chest is knee-high and a door stands beside the
 * path, so the hero brushes past rather than snagging.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { LockSpotView } from "@/lib/realm/world-state";
import { chestBoxes, vaultDoorBoxes, type LockBox } from "@/lib/realm3d/world-lock-boxes";
import { litMaterial, merge, paint } from "./geo-kit";

/** Sunk a little, so a lock on a slope never shows daylight under its downhill side. */
const SINK = 0.05;

/** Every box painted, turned by `yaw` about its lock and set down at (x, y, z), merged into one geometry. */
function mergedBoxes(locks: readonly { boxes: readonly LockBox[]; x: number; y: number; z: number; yaw: number }[]): THREE.BufferGeometry | null {
  const parts = locks.flatMap((l) =>
    l.boxes.map((b) =>
      paint(new THREE.BoxGeometry(b.sx, b.sy, b.sz), b.color)
        .translate(b.x, b.y, b.z)
        .rotateY(l.yaw)
        .translate(l.x, l.y, l.z),
    ),
  );
  if (parts.length === 0) return null;
  const merged = merge(parts);
  for (const p of parts) p.dispose();
  return merged;
}

function LockMesh({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const material = useMemo(() => litMaterial(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return geometry ? <mesh geometry={geometry} material={material} castShadow receiveShadow /> : null;
}

export function WorldLocks({ locks, heightAt }: { locks?: readonly LockSpotView[]; heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(
    () =>
      mergedBoxes(
        (locks ?? []).map((l) => ({ boxes: l.type === "chest" ? chestBoxes(l.open) : vaultDoorBoxes(l.open), x: l.x, y: heightAt(l.x, l.z) - SINK, z: l.z, yaw: l.ry })),
      ),
    [locks, heightAt],
  );
  return <LockMesh geometry={geometry} />;
}

/** One chest at the origin, front to +z: a room places and turns it. */
export function ChestMesh({ open }: { open: boolean }) {
  const geometry = useMemo(() => mergedBoxes([{ boxes: chestBoxes(open), x: 0, y: 0, z: 0, yaw: 0 }]), [open]);
  return <LockMesh geometry={geometry} />;
}
