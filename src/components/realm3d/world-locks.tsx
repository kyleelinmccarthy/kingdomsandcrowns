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

import { useMemo } from "react";
import type { LockSpotView } from "@/lib/realm/world-state";
import { chestBoxes, vaultDoorBoxes, type LockBox } from "@/lib/realm3d/world-lock-boxes";
import { groundHost, mergeBoxHosts } from "./geo-kit";
import { MergedMesh } from "./merged-mesh";

const lockBoxes = (type: LockSpotView["type"], open: boolean): LockBox[] => (type === "chest" ? chestBoxes(open) : vaultDoorBoxes(open));

export function WorldLocks({ locks, heightAt }: { locks?: readonly LockSpotView[]; heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(
    () =>
      mergeBoxHosts((locks ?? []).map((l) => groundHost(lockBoxes(l.type, l.open), l.x, l.z, l.ry, heightAt))),
    [locks, heightAt],
  );
  return <MergedMesh geometry={geometry} />;
}

/** One chest at the origin, front to +z: a room places and turns it. */
export function ChestMesh({ open }: { open: boolean }) {
  const geometry = useMemo(() => mergeBoxHosts([{ boxes: chestBoxes(open), x: 0, y: 0, z: 0, yaw: 0 }]), [open]);
  return <MergedMesh geometry={geometry} />;
}
