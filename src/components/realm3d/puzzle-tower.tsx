"use client";

/**
 * THE PUZZLE TOWER, drawn on the village's one free plot (`PUZZLE_TOWER`): the ground floor, and one
 * storey more for each floor the hero has opened (`towerBoxes`; the frame's canvas gives `storeys`,
 * `worldCanvas`). It is drawn whatever the grown-up's locks switch says: what the hero earned stays
 * (R-G7, PC-G6); only its E spot and its bonus locks follow the switch.
 *
 * A sibling of the memoised `World`, like the locks and the decorations, so a storey growing never
 * makes `World` re-render. One geometry and one vertex-coloured material, rebuilt only when the
 * storeys change, never per frame. What stops the hero is the one static collider `World` builds
 * (`towerColliders`), as tall as five storeys, so nothing here is solid.
 */

import { useMemo } from "react";
import { PUZZLE_TOWER } from "@/lib/realm/puzzle-tower";
import { towerBoxes } from "@/lib/realm3d/world-lock-boxes";
import { groundHost, mergeBoxHosts } from "./geo-kit";
import { MergedMesh } from "./merged-mesh";

export function PuzzleTower({ storeys, heightAt }: { storeys: number; heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(
    () => mergeBoxHosts([groundHost(towerBoxes(storeys), PUZZLE_TOWER.x, PUZZLE_TOWER.z, 0, heightAt)]),
    [storeys, heightAt],
  );
  return <MergedMesh geometry={geometry} />;
}
