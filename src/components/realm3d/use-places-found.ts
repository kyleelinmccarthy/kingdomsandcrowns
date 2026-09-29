"use client";

/**
 * The places a hero has found, for the visit: the one store the HUD's count, the minimap's marks
 * and fast travel all read (`lib/realm3d/places-store.ts`). Seeded from the database's list on the
 * bundle; a hero's new finds are saved through `recordPlacesFound`, retried when a save fails, and
 * kept on the device only until the server has them.
 *
 * The mounts lane kept visited places in this device's storage (`realm3d:visited:<child>`). That
 * list is read once, here, moved into the save queue, and the key removed: after that the device
 * is never the record, only a waiting room for finds the server has not confirmed yet.
 *
 * A visiting grown-up's walk fills in their own map for the visit and is written nowhere.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { recordPlacesFound } from "@/lib/actions/realm-places";
import { legacyVisitedKey, readStoredPlaces, unsavedPlacesKey } from "@/lib/realm/places-found";
import { makePlacesStore, type PlacesStore } from "@/lib/realm3d/places-store";
import { deviceStorage as storage } from "@/lib/utils/device-storage";

/** What this device kept for the hero: finds it never saved, and the old visited list (moved, then removed). */
function carriedFor(childId: string): string[] {
  const s = storage();
  if (!s) return [];
  try {
    const unsaved = readStoredPlaces(s.getItem(unsavedPlacesKey(childId)));
    const legacyRaw = s.getItem(legacyVisitedKey(childId));
    if (legacyRaw === null) return unsaved;
    const legacy = readStoredPlaces(legacyRaw);
    const all = [...new Set([...unsaved, ...legacy])];
    // Into the waiting room first, then the old key goes: nothing is dropped between the two.
    if (all.length > 0) s.setItem(unsavedPlacesKey(childId), JSON.stringify(all));
    s.removeItem(legacyVisitedKey(childId));
    return all;
  } catch {
    return [];
  }
}

function persistFor(childId: string) {
  return (ids: readonly string[]) => {
    const s = storage();
    if (!s) return;
    try {
      if (ids.length === 0) s.removeItem(unsavedPlacesKey(childId));
      else s.setItem(unsavedPlacesKey(childId), JSON.stringify(ids));
    } catch {
      // Blocked storage: the find is still in this visit's queue and still retried.
    }
  };
}

export function usePlacesFound({
  childId,
  writer,
  initial,
}: {
  childId: string | null;
  /** The hero on their own Realm. A visitor, or no child at all, writes nothing. */
  writer: boolean;
  /** `bundle.placesFound`. */
  initial: readonly string[] | undefined;
}): { store: PlacesStore; found: ReadonlySet<string> } {
  // Built once for the visit: the ride bus is seeded from it and the HUD subscribes to it.
  const [store] = useState<PlacesStore>(() => {
    const saves = writer && childId !== null;
    return makePlacesStore({
      initial: initial ?? [],
      carried: saves ? carriedFor(childId) : [],
      save: saves ? (ids) => recordPlacesFound(childId, ids) : null,
      persist: saves ? persistFor(childId) : undefined,
    });
  });

  // Anything carried over from this device goes to the server now; a dropped connection is
  // retried on its own, and coming back online, or leaving, sends what is waiting at once.
  useEffect(() => {
    store.start();
    const again = () => store.flush();
    const onHide = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", onHide);
      store.flush();
      store.dispose();
    };
  }, [store]);

  const found = useSyncExternalStore(store.subscribe, store.get, store.get);
  return { store, found };
}
