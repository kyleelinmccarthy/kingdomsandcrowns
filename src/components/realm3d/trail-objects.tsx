"use client";

/**
 * THE VILLAGE'S FOUR SMALL OBJECTS a reading clue can lead to (slice 5): the notice board, the water
 * trough, the beehives and the hay cart, at their own places (`ANCHORS[...].object`). The shapes are
 * `anchor-boxes.ts`' `trailObjectBoxes`; this only places, turns and merges them.
 *
 * Always drawn, whatever the palette and whether or not a walk is on (R-H4: every anchor looks the
 * same to every child), so a clue that names one always has it to lead to. A sibling of the memoised
 * `World`, like the keep yard and the locks: one geometry, built once per heights function, never per
 * frame. Nothing here is solid: the hero walks past the trough rather than snagging on it.
 */

import { useMemo } from "react";
import { ANCHOR_IDS, ANCHORS, type ObjectAnchorId } from "@/lib/realm/anchors";
import { trailObjectBoxes } from "@/lib/realm3d/anchor-boxes";
import { groundHost, mergeBoxHosts } from "./geo-kit";
import { MergedMesh } from "./merged-mesh";

const OBJECT_IDS = ANCHOR_IDS.filter((id): id is ObjectAnchorId => ANCHORS[id].kind === "object");

export function TrailObjects({ heightAt }: { heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(
    () =>
      mergeBoxHosts(
        OBJECT_IDS.flatMap((id) => {
          const o = ANCHORS[id].object;
          return o ? [groundHost(trailObjectBoxes(id), o.x, o.z, o.ry, heightAt)] : [];
        }),
      ),
    [heightAt],
  );
  return <MergedMesh geometry={geometry} />;
}
