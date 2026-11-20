"use client";

/**
 * THE WORLD'S LOCKS, held by the frame for the visit: the bundle's view of what stands open and
 * what was found (`bundle.worldState`), mirrored on the client as a lock opens
 * (`applyWorldOutcome`), and the canvas the island draws its chests, doors and decorations from.
 *
 * Held as state from the bundle, not read from props on every render, like the kingdom: a server
 * refresh must not move the world out from under a child. The canvas goes to the memoised `World`,
 * which builds its E spots from it, so it is kept the same object until what it draws changes:
 * keyed on its own contents as a string, as `realm-game.tsx` keys the gilded pennants.
 *
 * A vault door's map fragment (`WorldReward` "fragment") is a place the hero has now found: it goes
 * on the map at once through `addPlace` (the places store, which saves it for the hero and shows it
 * to a visitor for the visit), and "You found a map to {place}!" is said at once if no panel is
 * open, else held in a ref until the last one closes, since an open panel hides the toast. The
 * options are read through a ref, so `applyWorldOutcome` stays one function for the whole visit
 * however the frame re-renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fragmentToast, type DeedToast } from "@/lib/realm3d/talk";
import { applyWorldOutcome as applyOutcome, EMPTY_WORLD_STATE, worldCanvas, type WorldCanvas, type WorldStateView } from "@/lib/realm/world-state";
import type { WorldOutcome } from "@/lib/utils/deed-run-types";

export type WorldStateOptions = {
  /** Marks a place found on the map (the places store's `add`). */
  addPlace: (placeId: string) => void;
  /** Shows a toast over the world, read aloud if the hero has that on (the frame's `showToast`). */
  say: (toast: DeedToast) => void;
  /** What the map calls a place. */
  placeName: (placeId: string) => string;
  /** Whether a panel is open: it hides the toast, so the toast waits for it to close. */
  overlayOpen: boolean;
};

export function useWorldState(
  initial: WorldStateView | undefined,
  options: WorldStateOptions,
): {
  view: WorldStateView;
  canvas: WorldCanvas;
  applyWorldOutcome: (o: WorldOutcome) => void;
} {
  const [view, setView] = useState<WorldStateView>(() => initial ?? EMPTY_WORLD_STATE);
  const key = useMemo(() => JSON.stringify(worldCanvas(view)), [view]);
  const canvas = useMemo(() => JSON.parse(key) as WorldCanvas, [key]);

  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const held = useRef<DeedToast | null>(null);
  const applyWorldOutcome = useCallback((o: WorldOutcome) => {
    setView((v) => applyOutcome(v, o));
    if (!o.opened) return;
    for (const r of o.rewards) {
      if (r.kind !== "fragment") continue;
      const { addPlace, placeName, say, overlayOpen } = latest.current;
      addPlace(r.placeId);
      const toast = fragmentToast(placeName(r.placeId));
      if (overlayOpen) held.current = toast;
      else say(toast);
    }
  }, []);

  // The last panel closing says the held toast, once.
  const { overlayOpen } = options;
  useEffect(() => {
    if (overlayOpen || !held.current) return;
    const toast = held.current;
    held.current = null;
    latest.current.say(toast);
  }, [overlayOpen]);

  return { view, canvas, applyWorldOutcome };
}
