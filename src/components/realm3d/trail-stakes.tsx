"use client";

/**
 * THE SEARCH STAKES of a reading trail: one at each of the fourteen anchors (`ANCHORS`), drawn only
 * while a walk is on (`on`), where E searches (`buildSpots`' `anchors`). Every stake is the same
 * shape (`anchor-boxes.ts`' `stakeBoxes`), so none tells the clue's answer from the rest; after a
 * missed clue the answer's stake (`revealed`) flies a gold flag: "It was here."
 *
 * A sibling of the memoised `World`: one geometry, rebuilt only when the walk starts or ends or the
 * revealed stake changes, never per frame. Nothing here is solid.
 */

import { useMemo } from "react";
import { ANCHOR_SPOTS, type AnchorId } from "@/lib/realm/anchors";
import { stakeBoxes } from "@/lib/realm3d/anchor-boxes";
import { groundHost, mergeBoxHosts } from "./geo-kit";
import { MergedMesh } from "./merged-mesh";

export function TrailStakes({ on, revealed, heightAt }: { on: boolean; revealed: AnchorId | null; heightAt: (x: number, z: number) => number }) {
  const geometry = useMemo(
    () => (on ? mergeBoxHosts(ANCHOR_SPOTS.map((a) => groundHost(stakeBoxes(a.id === revealed), a.x, a.z, 0, heightAt))) : null),
    [on, revealed, heightAt],
  );
  return <MergedMesh geometry={geometry} />;
}
