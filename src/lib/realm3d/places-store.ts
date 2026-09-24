/**
 * THE PLACES STORE: the client's one record of the places a hero has found this visit and
 * before. The HUD's count, the minimap's marks and fast travel's sheet all read it, so they can
 * never disagree again (`lib/realm/places-found.ts` has the why).
 *
 * It starts from what the database said (`bundle.placesFound`), plus anything this device found
 * but never managed to save. A new find is shown at once and saved in the background; a save that
 * fails is retried, backing off to a minute, and the unsaved finds are kept on the device
 * (`persist`) until the server has them — so a place found offline, or when a save fails, is never
 * lost, and play never waits for any of it.
 *
 * No React, no `three`, no storage, no server: those are handed in, which is what lets the tests
 * drive it with fake timers and a fake server.
 */

import { cleanPlaceIds, isRealmPlaceId, MAX_PLACES_PER_CALL, retryDelayMs } from "@/lib/realm/places-found";

export type PlacesStore = {
  /** Every place found, as an immutable snapshot: a new object whenever it changes. */
  get: () => ReadonlySet<string>;
  /** Stood in a place. Unknown ids and places already found do nothing. */
  add: (id: string) => void;
  /** Listen for changes (`useSyncExternalStore`). */
  subscribe: (fn: () => void) => () => void;
  /** Send what is waiting now: on reconnecting, or on the way out. */
  flush: () => void;
  /** The finds this device has not yet had confirmed by the server. */
  unsaved: () => readonly string[];
  /** Stop retrying (the visit is over). Unsaved finds stay on the device for the next one. */
  dispose: () => void;
  /** Start (again, after a `dispose`) and send what is waiting. */
  start: () => void;
};

export type PlacesStoreInput = {
  /** What the database said at load (`bundle.placesFound`). */
  initial: readonly string[];
  /** Finds this device kept because they had not been saved, and the mounts lane's old list. */
  carried?: readonly string[];
  /**
   * Save these places; resolves with every place the hero has found. Null for a visitor: a
   * grown-up's walk is shown on their own map for the visit and written nowhere.
   */
  save: ((ids: string[]) => Promise<string[]>) | null;
  /** Keep the unsaved finds on the device (an empty list clears them). */
  persist?: (ids: readonly string[]) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export function makePlacesStore(input: PlacesStoreInput): PlacesStore {
  const setTimer = input.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = input.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const persist = input.persist ?? (() => {});
  const save = input.save;

  const initial = cleanPlaceIds(input.initial);
  let found: ReadonlySet<string> = new Set([...initial, ...cleanPlaceIds(input.carried ?? [])]);
  // A visitor writes nothing, so has nothing waiting.
  const waiting = new Set<string>(save ? cleanPlaceIds(input.carried ?? []).filter((id) => !initial.includes(id)) : []);
  const listeners = new Set<() => void>();
  let inflight = false;
  let failures = 0;
  let timer: unknown = null;
  let disposed = false;

  const notify = () => {
    for (const fn of listeners) fn();
  };

  const retryLater = () => {
    if (disposed || timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      flush();
    }, retryDelayMs(failures));
  };

  function flush(): void {
    if (!save || disposed || inflight || waiting.size === 0) return;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    inflight = true;
    const batch = [...waiting].slice(0, MAX_PLACES_PER_CALL);
    save(batch)
      .then((all) => {
        failures = 0;
        for (const id of batch) waiting.delete(id);
        persist([...waiting]);
        // The server's list is the truth, and this device's own finds stand beside it.
        const merged = new Set(found);
        let grew = false;
        for (const id of cleanPlaceIds(all)) {
          if (!merged.has(id)) {
            merged.add(id);
            grew = true;
          }
        }
        if (grew) {
          found = merged;
          notify();
        }
      })
      .catch(() => {
        failures += 1;
        retryLater();
      })
      .finally(() => {
        inflight = false;
        if (waiting.size > 0 && failures === 0) flush();
      });
  }

  return {
    get: () => found,
    add(id) {
      if (!isRealmPlaceId(id) || found.has(id)) return;
      found = new Set(found).add(id);
      notify();
      if (!save) return;
      waiting.add(id);
      persist([...waiting]);
      flush();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush,
    unsaved: () => [...waiting],
    start() {
      disposed = false;
      flush();
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
