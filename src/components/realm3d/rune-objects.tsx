"use client";

/**
 * THE RUNE OBJECTS, drawn: the fifteen things in the village and at the five named places that need
 * a rune (`worldCanvas`'s `runes`), each broken or fixed (`rune-boxes.ts`' `runeObjectBoxes`). This
 * only paints, turns, places and merges them. With runes off the canvas lists none, so none is drawn
 * (R-I13); the records stay and come back as they were.
 *
 * A sibling of the memoised `World`, like the locks: one geometry for every object, a single draw,
 * rebuilt only when one is fixed or the walk changes (the frame keeps `runes` the same array until
 * then, `use-world-state.ts`), never per frame. Nothing here is solid or has a collider: the hero
 * brushes past a wagon rather than snagging on it.
 *
 * A rune walk (R-I2) is shown on the objects themselves: the stops it names (`named`) wear the gold
 * mark over them until they are `mended` on this walk (R-I21: the right cast shows its fixed boxes
 * at once, before the record lands). Both are ids; they are keyed as strings, so a caller's new
 * array with the same ids never rebuilds the geometry.
 */

import { useMemo } from "react";
import type { RuneSpotView } from "@/lib/realm/world-state";
import { runeMarkBoxes, runeObjectBoxes } from "@/lib/realm3d/rune-boxes";
import { groundHost, mergeBoxHosts } from "./geo-kit";
import { MergedMesh } from "./merged-mesh";

const idSet = (key: string): ReadonlySet<string> => new Set(key === "" ? [] : key.split("|"));

export function RuneObjects({
  runes,
  named,
  mended,
  heightAt,
}: {
  runes?: readonly RuneSpotView[];
  /** The objects the rune walk is going to, in any order: each unmended one wears the gold mark. */
  named?: readonly string[];
  /** The objects cast right on this walk: drawn fixed whatever their record says, and unmarked. */
  mended?: readonly string[];
  heightAt: (x: number, z: number) => number;
}) {
  const namedKey = (named ?? []).join("|");
  const mendedKey = (mended ?? []).join("|");
  const geometry = useMemo(() => {
    const walking = idSet(namedKey);
    const done = idSet(mendedKey);
    return mergeBoxHosts(
      (runes ?? []).map((r) => {
        const fixed = r.fixed || done.has(r.id);
        const boxes = runeObjectBoxes(r.effect, fixed);
        if (walking.has(r.id) && !done.has(r.id)) boxes.push(...runeMarkBoxes());
        return groundHost(boxes, r.x, r.z, r.ry, heightAt);
      }),
    );
  }, [runes, namedKey, mendedKey, heightAt]);
  return <MergedMesh geometry={geometry} />;
}
