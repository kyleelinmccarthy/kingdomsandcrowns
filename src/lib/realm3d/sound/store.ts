/**
 * The sound settings as a tiny store the pause menu's controls subscribe to, so moving a slider
 * re-renders the slider and nothing else — least of all the composition root, whose re-render
 * is the one thing the memoised world exists to avoid.
 *
 * Also the one module-level hook into the running sound, `realmCue`, for the few places deep in
 * a panel (the deed board's right and wrong) that make a sound and have no reason to be handed
 * the engine through three layers of props. With no Realm open it does nothing.
 */

import type { SoundId } from "./recipes";
import { sameSound, soundFrom, type SoundSettings } from "./settings";

export type SoundStore = {
  get(): SoundSettings;
  set(patch: Partial<SoundSettings>): void;
  subscribe(fn: () => void): () => void;
  /** The last save failed; shown under the controls. Cleared by the next change. */
  error(): string;
  setError(e: string): void;
};

export function makeSoundStore(initial: SoundSettings, onChange: (s: SoundSettings) => void): SoundStore {
  let value = soundFrom(initial);
  let err = "";
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    get: () => value,
    set(patch) {
      const next = soundFrom({ ...value, ...patch });
      if (sameSound(next, value)) return;
      value = next;
      err = "";
      onChange(next);
      emit();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    error: () => err,
    setError(e) {
      if (e === err) return;
      err = e;
      emit();
    },
  };
}

/**
 * Coalesces a burst of changes (a slider being dragged) into one save, `ms` after the last.
 * `flush` sends anything waiting at once — on leaving, so the last move is never lost.
 */
export function debounceSave<T>(save: (v: T) => void, ms: number, timers: { set: (f: () => void, ms: number) => number; clear: (id: number) => void }) {
  let id = -1;
  let pending: { v: T } | null = null;
  const fire = () => {
    id = -1;
    const p = pending;
    pending = null;
    if (p) save(p.v);
  };
  return {
    push(v: T) {
      pending = { v };
      if (id >= 0) timers.clear(id);
      id = timers.set(fire, ms);
    },
    flush() {
      if (id >= 0) timers.clear(id);
      fire();
    },
  };
}

let cue: ((id: SoundId) => void) | null = null;

export function setRealmCue(fn: ((id: SoundId) => void) | null): void {
  cue = fn;
}

/** Plays a sound in the open Realm, if there is one. Safe to call from anywhere, any time. */
export function realmCue(id: SoundId): void {
  cue?.(id);
}
