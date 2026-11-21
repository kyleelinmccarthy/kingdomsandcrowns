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
 * open, else held in a ref until the last one closes, since an open panel hides the toast. Only a
 * place the store knows (`isRealmPlaceId`) is marked or said; several maps are named in one toast,
 * and maps held while a panel is open add up until it closes. The options are read through a ref, so
 * `applyWorldOutcome` stays one function for the whole visit however the frame re-renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fragmentToast, type DeedToast } from "@/lib/realm3d/talk";
import { isRealmPlaceId } from "@/lib/realm/places-found";
import { applyTowerOutcome as applyTower, applyWorldOutcome as applyOutcome, EMPTY_WORLD_STATE, worldCanvas, type WorldCanvas, type WorldStateView } from "@/lib/realm/world-state";
import type { TowerOutcome, WorldOutcome } from "@/lib/utils/deed-run-types";

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
  /** A Tower floor's solved count, as the server gave it. */
  applyTowerOutcome: (o: TowerOutcome) => void;
} {
  const [view, setView] = useState<WorldStateView>(() => initial ?? EMPTY_WORLD_STATE);
  const key = useMemo(() => JSON.stringify(worldCanvas(view)), [view]);
  const canvas = useMemo(() => JSON.parse(key) as WorldCanvas, [key]);

  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  /** The names of the maps found while a panel was open, waiting for it to close. */
  const held = useRef<string[]>([]);
  const applyWorldOutcome = useCallback((o: WorldOutcome) => {
    setView((v) => applyOutcome(v, o));
    if (!o.opened) return;
    const { addPlace, placeName, say, overlayOpen } = latest.current;
    const places = o.rewards.flatMap((r) => (r.kind === "fragment" && isRealmPlaceId(r.placeId) ? [r.placeId] : []));
    if (places.length === 0) return;
    for (const id of places) addPlace(id);
    const names = places.map(placeName);
    if (overlayOpen) held.current = [...held.current, ...names];
    else say(fragmentToast(...names));
  }, []);

  // The last panel closing says the held maps, once, in one toast.
  const { overlayOpen } = options;
  useEffect(() => {
    if (overlayOpen || held.current.length === 0) return;
    const names = held.current;
    held.current = [];
    latest.current.say(fragmentToast(...names));
  }, [overlayOpen]);

  const applyTowerOutcome = useCallback((o: TowerOutcome) => setView((v) => applyTower(v, o)), []);

  return { view, canvas, applyWorldOutcome, applyTowerOutcome };
}
