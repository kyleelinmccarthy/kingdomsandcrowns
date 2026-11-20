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
 */

import { useCallback, useMemo, useState } from "react";
import { applyWorldOutcome as applyOutcome, EMPTY_WORLD_STATE, worldCanvas, type WorldCanvas, type WorldStateView } from "@/lib/realm/world-state";
import type { WorldOutcome } from "@/lib/utils/deed-run-types";

export function useWorldState(initial: WorldStateView | undefined): {
  view: WorldStateView;
  canvas: WorldCanvas;
  applyWorldOutcome: (o: WorldOutcome) => void;
} {
  const [view, setView] = useState<WorldStateView>(() => initial ?? EMPTY_WORLD_STATE);
  const key = useMemo(() => JSON.stringify(worldCanvas(view)), [view]);
  const canvas = useMemo(() => JSON.parse(key) as WorldCanvas, [key]);
  const applyWorldOutcome = useCallback((o: WorldOutcome) => setView((v) => applyOutcome(v, o)), []);
  return { view, canvas, applyWorldOutcome };
}
