/**
 * LISTENING IN on the buses the game already has, without taking them over.
 *
 * The HUD bus and the trouble bus each carry exactly one handler per event: the frame installs
 * `onNear`, the HUD installs `onFound`, the troubles' notices install the trouble handler. The
 * sound needs to hear all of those too, and must not replace any of them or make their owners
 * know it exists. So each bus is tapped once: its `set…` method is wrapped so every handler
 * installed from now on (and the one installed already) also tells a listener. The listener is a
 * mutable slot, so the sound can come and go — and React's development double-mount can tap and
 * untap as often as it likes — without a handler ever being wrapped twice.
 *
 * The wrapping happens when a handler is INSTALLED, a handful of times a visit; calling one is
 * one extra function call and no allocation.
 */

import type { HudBus, HudHandlers } from "@/lib/realm3d/hud-bus";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import type { TroubleEvent } from "@/lib/realm3d/troubles3d";

export type HudListener = Partial<HudHandlers>;
type HudTap = { listener: HudListener | null };
/** `listener` is the sound's one slot; `also` is everyone else who listens in (`hearTroubles`). */
type TroubleTap = { listener: ((e: TroubleEvent) => void) | null; also: Set<(e: TroubleEvent) => void> };

const hudTaps = new WeakMap<HudBus, HudTap>();
const troubleTaps = new WeakMap<TroubleBus, TroubleTap>();

const KEYS = ["onPlace", "onFound", "onRefuse", "onNear", "onInteract", "onCast", "onWalked", "onDoor"] as const;

/** Hears every HUD-bus event. Returns the untap. */
export function tapHud(bus: HudBus, listener: HudListener): () => void {
  let tap = hudTaps.get(bus);
  if (!tap) {
    const t: HudTap = { listener: null };
    tap = t;
    hudTaps.set(bus, t);
    const wrap = <K extends (typeof KEYS)[number]>(key: K, h: HudHandlers[K]): HudHandlers[K] =>
      ((...args: Parameters<HudHandlers[K]>) => {
        (h as (...a: Parameters<HudHandlers[K]>) => void)(...args);
        const l = t.listener?.[key] as ((...a: Parameters<HudHandlers[K]>) => void) | undefined;
        l?.(...args);
      }) as HudHandlers[K];
    const install = bus.setHandlers;
    const wrapAll = (hs: Partial<HudHandlers>): Partial<HudHandlers> => {
      const out: Partial<HudHandlers> = {};
      for (const k of KEYS) {
        const h = hs[k];
        if (h) (out as Record<string, unknown>)[k] = wrap(k, h as HudHandlers[typeof k]);
      }
      return out;
    };
    bus.setHandlers = (hs) => install(wrapAll(hs));
    // The handlers already in place are wrapped once, now.
    const current: Partial<HudHandlers> = {};
    for (const k of KEYS) (current as Record<string, unknown>)[k] = bus[k];
    install(wrapAll(current));
  }
  tap.listener = listener;
  const mine = tap;
  return () => {
    if (mine.listener === listener) mine.listener = null;
  };
}

/** The bus's tap, installed once: every handler installed on it from now on also tells the tap. */
function troubleTapOf(tbus: TroubleBus): TroubleTap {
  let tap = troubleTaps.get(tbus);
  if (!tap) {
    const t: TroubleTap = { listener: null, also: new Set() };
    tap = t;
    troubleTaps.set(tbus, t);
    const install = tbus.setHandler;
    // Every argument goes through: the notices need the trouble's home for the bounty.
    const wrap = (fn: TroubleBus["onEvent"]): TroubleBus["onEvent"] => (e, place, homeId) => {
      fn(e, place, homeId);
      t.listener?.(e);
      if (t.also.size) for (const l of t.also) l(e);
    };
    tbus.setHandler = (fn) => install(wrap(fn));
    install(wrap(tbus.onEvent));
  }
  return tap;
}

/** Hears every trouble event. Returns the untap. */
export function tapTroubles(tbus: TroubleBus, listener: (e: TroubleEvent) => void): () => void {
  const tap = troubleTapOf(tbus);
  tap.listener = listener;
  const mine = tap;
  return () => {
    if (mine.listener === listener) mine.listener = null;
  };
}

/**
 * Hears every trouble event too, beside the sound and never instead of it: recess listens for a
 * bump mid-lap (D12.9). Any number may listen; each is heard once per event, however often the
 * bus's handler is replaced. Returns the untap.
 */
export function hearTroubles(tbus: TroubleBus, listener: (e: TroubleEvent) => void): () => void {
  const tap = troubleTapOf(tbus);
  tap.also.add(listener);
  return () => {
    tap.also.delete(listener);
  };
}
