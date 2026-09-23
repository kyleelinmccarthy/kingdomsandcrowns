"use client";

/**
 * THE 3D REALM'S SOUND, mounted: one hook the composition root calls, and the pause menu's
 * controls.
 *
 * `useRealmSound` owns the engine for the visit. It never polls anything: it listens on the
 * buses the game already has (`tap.ts`), the hero's feet (`bus.setFeet`), read-aloud
 * (`onSpeaking`), and the handful of pieces of the frame's own state that change a few times a
 * visit — which panel is open, which room the child is in, a building rising, a lesson done —
 * and turns each into a sound. The engine and every rule it follows live in
 * `lib/realm3d/sound/`, where the tests are; this file is wiring.
 *
 * Browsers will not start audio before the page has been touched, so there is no AudioContext
 * until the first key press or click anywhere, when one is made silently. Before that, sounds
 * are simply not played.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RoomKind } from "@/lib/realm3d/doorways";
import type { HudBus, InteractTarget } from "@/lib/realm3d/hud-bus";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import type { WorldLayout } from "@/lib/realm/layout";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { saveRealmSound } from "@/lib/actions/realm-sound";
import { onSpeaking } from "@/lib/utils/speech";
import { elementOf, fixtureCue, makeZoneTracker, roomFloor, surfaceAt, trackZone, troubleCue, zoneAt } from "@/lib/realm3d/sound/cues";
import { SoundEngine, type Timers } from "@/lib/realm3d/sound/engine";
import { groundProbe } from "@/lib/realm3d/sound/ground";
import type { Zone } from "@/lib/realm3d/sound/recipes";
import { DEFAULT_SOUND, type SoundSettings } from "@/lib/realm3d/sound/settings";
import { debounceSave, makeSoundStore, setRealmCue, type SoundStore } from "@/lib/realm3d/sound/store";
import { tapHud, tapTroubles } from "@/lib/realm3d/sound/tap";
import { createWebAudioOut } from "@/lib/realm3d/sound/web-audio";
import { workerSynth } from "@/lib/realm3d/sound/synth-client";
import type { GroundProbe } from "@/lib/realm3d/sound/cues";
import "./realm-sound.css";

declare global {
  interface Window {
    /** Development only: the running sound engine, for the screenshot scripts. */
    __realmSound?: SoundEngine;
  }
}

/** How long after the last slider move the settings are saved. */
const SAVE_MS = 700;
/** Read-aloud that never says it finished (it happens) stops ducking after this long regardless. */
const SPEECH_CEILING_MS = 20000;
/** Every this many outdoor footfalls, the country underfoot is checked. */
const ZONE_EVERY = 3;
const SAVE_FAILED = "That didn't save. Try again.";

const browserTimers: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
  idle: (fn) => {
    const w = window as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback((d) => fn(Math.max(10, d.timeRemaining())), { timeout: 1500 });
    else window.setTimeout(() => fn(12), 50);
  },
};

/** Every event that can be a browser's user activation. */
const UNLOCK_EVENTS = ["keydown", "pointerdown", "pointerup", "click", "touchend"] as const;

type UserActivationLike = { isActive: boolean } | null;
function userActivation(): UserActivationLike {
  const n = typeof navigator === "undefined" ? null : (navigator as unknown as { userActivation?: { isActive: boolean } });
  return n?.userActivation ?? null;
}

/**
 * Whether this event lets audio start. Where the browser says (`navigator.userActivation`), it
 * decides: "confirmed" or nothing. Where it cannot say, the HTML rule is applied by hand:
 * a key press other than Esc, a mouse button going down, and any pointer or finger coming up —
 * "likely", so the caller keeps listening in case it was not.
 */
export function gestureActivates(e: Event, ua: UserActivationLike): "confirmed" | "likely" | null {
  if (e.type === "keydown" && (e as KeyboardEvent).repeat) return null;
  if (ua) return ua.isActive ? "confirmed" : null;
  switch (e.type) {
    case "keydown": {
      const k = e as KeyboardEvent;
      return k.key === "Escape" || k.code === "Escape" ? null : "likely";
    }
    case "pointerdown": {
      const t = (e as PointerEvent).pointerType;
      return t === "touch" || t === "pen" ? null : "likely";
    }
    case "pointerup":
    case "click":
    case "touchend":
      return "likely";
    default:
      return null;
  }
}

export type RealmSoundOptions = {
  bus: HudBus;
  tbus: TroubleBus;
  world: RealmWorld;
  layout: WorldLayout;
  pages: readonly SpellPageView[];
  /** The stored settings for whoever is looking (the bundle picks the hero's or the visitor's). */
  initial: SoundSettings | undefined;
  /** False when a grown-up has switched Sound off in the child's learning profile. */
  enabled: boolean;
  calm: boolean;
  childId: string | null;
  /** Which overlay is open, if any. */
  overlay: string | null;
  room: RoomKind | null;
  /** How many times the room's one thing has been used; each new use rings, turns, creaks. */
  roomUses: number;
  /** The village's answer to a finished side quest; a new one is a building rising. */
  toast: { rose: boolean } | null;
  lessons: number;
  lessonsTotal: number;
  /** The clock closed the world: everything stops. */
  close: boolean;
};

/**
 * Starts the Realm's sound for this visit and keeps it in step with the game. Returns the
 * settings store the pause menu's controls read and write.
 */
export function useRealmSound(o: RealmSoundOptions): SoundStore {
  const engineRef = useRef<SoundEngine | null>(null);
  const saveRef = useRef<ReturnType<typeof debounceSave<SoundSettings>> | null>(null);
  const [store] = useState(() =>
    makeSoundStore(o.initial ?? DEFAULT_SOUND, (s) => {
      engineRef.current?.setMix({ settings: s });
      saveRef.current?.push(s);
    }),
  );

  // Everything the listeners need to read at the moment an event arrives, kept current.
  const live = useRef({ pages: o.pages, room: o.room, enabled: o.enabled, calm: o.calm, paused: o.overlay !== null });
  useEffect(() => {
    live.current = { pages: o.pages, room: o.room, enabled: o.enabled, calm: o.calm, paused: o.overlay !== null };
  }, [o.pages, o.room, o.enabled, o.calm, o.overlay]);

  const { bus, tbus, world, layout, childId } = o;
  /** Back to the country outside, on the way out of a room; set by the effect below. */
  const roomExit = useRef<() => void>(() => {});

  // The ground, rebuilt when the village is (a building rising gives it a new layout). Held in a
  // ref, so a rising building never restarts the sound — the engine lives for the whole visit.
  const probe = useRef<GroundProbe | null>(null);
  const spawn = useRef(layout.spawn);
  useEffect(() => {
    probe.current = groundProbe(world, layout.props.filter((p) => p.kind === "path"));
    spawn.current = layout.spawn;
  }, [world, layout]);

  /* ---- the engine and its listeners, for the life of the visit ----------------------------- */
  useEffect(() => {
    const now = live.current;
    // The sounds are made on their own thread where the browser allows it (`synth.ts`).
    const engine = new SoundEngine({ settings: store.get(), enabled: now.enabled, calm: now.calm, paused: now.paused, speaking: false }, browserTimers, undefined, workerSynth() ?? undefined);
    engineRef.current = engine;
    const ground = () => probe.current ?? (probe.current = groundProbe(world, layout.props.filter((p) => p.kind === "path")));
    const tracker = makeZoneTracker();
    let outdoors: Zone = trackZone(tracker, zoneAt(ground(), spawn.current.x, spawn.current.z)) ?? "village";
    engine.setZone(now.room ? "indoors" : outdoors);
    setRealmCue((id) => engine.play(id));

    const save = childId
      ? debounceSave<SoundSettings>(
          (s) => {
            saveRealmSound(childId, s).catch(() => store.setError(SAVE_FAILED));
          },
          SAVE_MS,
          browserTimers,
        )
      : null;
    saveRef.current = save;

    // The first real gesture makes the audio, silently. Not every press is one: Esc is not, nor
    // is a finger going DOWN (the gesture is the lift). A context made on one of those starts
    // suspended and stays so; so those are passed over, and the next real gesture makes it.
    const unlock = (e: Event) => {
      const active = gestureActivates(e, userActivation());
      if (!active) return;
      if (!engine.attached) {
        const out = createWebAudioOut();
        if (!out) return;
        engine.attach(out);
      } else if (!document.hidden) {
        // A context the browser left suspended despite the gesture: this one asks again.
        engine.hidden(false);
      }
      // Where the browser can SAY the gesture counted, one is enough. Where it cannot, keep
      // asking on every real gesture; resuming a running context does nothing.
      if (active === "confirmed") for (const t of UNLOCK_EVENTS) window.removeEventListener(t, unlock, true);
    };
    for (const t of UNLOCK_EVENTS) window.addEventListener(t, unlock, true);

    // The world's events.
    let lastNear: string | null = null;
    const untapHud = tapHud(bus, {
      onNear: (t: InteractTarget | null) => {
        const key = t ? `${t.kind}:${t.id}` : null;
        if (key && key !== lastNear) engine.play("prompt");
        lastNear = key;
      },
      onInteract: (t) => {
        if (t.kind === "villager") engine.play("talk");
      },
      onCast: (slot) => {
        const spell = live.current.pages[slot - 1]?.spell;
        const element = elementOf(spell?.parts.elementId);
        if (spell && element) engine.cast(element, spell.castMs);
      },
      onRefuse: () => engine.play("refuse"),
      onFound: () => engine.play("found"),
    });
    const untapTroubles = tapTroubles(tbus, (e) => {
      const id = troubleCue(e.kind);
      if (id) engine.play(id);
    });

    // The feet.
    let steps = 0;
    bus.setFeet({
      onStep: (x, z) => {
        const room = live.current.room;
        if (room) {
          engine.step(roomFloor(room));
          return;
        }
        const g = ground();
        engine.step(surfaceAt(g, x, z));
        if (++steps % ZONE_EVERY === 0) {
          const changed = trackZone(tracker, zoneAt(g, x, z));
          if (changed) {
            outdoors = changed;
            engine.setZone(changed);
          }
        }
      },
      onJump: () => engine.play("jump"),
      onLand: (air) => engine.land(air),
    });
    const toOutdoors = () => engine.setZone(outdoors);
    roomExit.current = toOutdoors;

    // Read-aloud ducks the music and the world.
    let speechCeiling = -1;
    const unspeak = onSpeaking((speaking) => {
      engine.setMix({ speaking });
      window.clearTimeout(speechCeiling);
      if (speaking) speechCeiling = window.setTimeout(() => engine.setMix({ speaking: false }), SPEECH_CEILING_MS);
    });

    // A hidden tab is a silent one.
    const onVisible = () => engine.hidden(document.hidden);
    document.addEventListener("visibilitychange", onVisible);

    // Every button and link in the game's own panels answers with a soft tick.
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest(".r3-game") && t.closest("button, a, [role='button']")) engine.play("ui-click");
    };
    document.addEventListener("click", onClick, true);

    if (process.env.NODE_ENV !== "production") window.__realmSound = engine;

    return () => {
      for (const t of UNLOCK_EVENTS) window.removeEventListener(t, unlock, true);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(speechCeiling);
      unspeak();
      untapHud();
      untapTroubles();
      bus.setFeet({ onStep: () => {}, onJump: () => {}, onLand: () => {} });
      setRealmCue(null);
      save?.flush();
      saveRef.current = null;
      if (window.__realmSound === engine) delete window.__realmSound;
      // Leaving stops everything.
      engine.close();
      if (engineRef.current === engine) engineRef.current = null;
    };
    // `world` and `layout` are read through `ground()` the first time only; after that the probe
    // ref above follows them. The engine must not be rebuilt when a building rises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, tbus, childId, store]);

  /* ---- the mix follows the game ------------------------------------------------------------ */
  useEffect(() => {
    engineRef.current?.setMix({ enabled: o.enabled, calm: o.calm });
  }, [o.enabled, o.calm]);

  const overlayWas = useRef(o.overlay);
  useEffect(() => {
    const was = overlayWas.current;
    overlayWas.current = o.overlay;
    const engine = engineRef.current;
    if (!engine || was === o.overlay) return;
    engine.setMix({ paused: o.overlay !== null });
    if (o.overlay === "pause") engine.play("pause");
    else if (was === "pause" && o.overlay === null) engine.play("resume");
  }, [o.overlay]);

  const roomWas = useRef(o.room);
  useEffect(() => {
    const was = roomWas.current;
    roomWas.current = o.room;
    const engine = engineRef.current;
    if (!engine || was === o.room) return;
    if (o.room) {
      engine.play("door-in");
      engine.setZone("indoors");
    } else {
      engine.play("door-out");
      roomExit.current();
    }
  }, [o.room]);

  const usesWas = useRef(o.roomUses);
  useEffect(() => {
    const was = usesWas.current;
    usesWas.current = o.roomUses;
    if (o.roomUses > was && o.room) engineRef.current?.play(fixtureCue(o.room));
  }, [o.roomUses, o.room]);

  const toastWas = useRef(o.toast);
  useEffect(() => {
    const was = toastWas.current;
    toastWas.current = o.toast;
    if (o.toast && o.toast !== was) engineRef.current?.play(o.toast.rose ? "complete" : "rise");
  }, [o.toast]);

  const lessonsWas = useRef(o.lessons);
  useEffect(() => {
    const was = lessonsWas.current;
    lessonsWas.current = o.lessons;
    if (o.lessons <= was) return;
    engineRef.current?.play(o.lessons >= o.lessonsTotal ? "tutorial-done" : "lesson");
  }, [o.lessons, o.lessonsTotal]);

  useEffect(() => {
    if (o.close) engineRef.current?.close();
  }, [o.close]);

  return store;
}

/* ------------------------------------------------------------------ the controls */

function useSound(store: SoundStore) {
  const settings = useSyncExternalStore(store.subscribe, store.get, store.get);
  const error = useSyncExternalStore(store.subscribe, store.error, store.error);
  return { settings, error };
}

function Slider({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className={`r3-slider${disabled ? " r3-slider--off" : ""}`}>
      <span className="r3-slider-name">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${value} percent`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--r3-fill" as string]: `${value}%` }}
      />
      <span className="r3-slider-value" aria-hidden="true">
        {value}
      </span>
    </label>
  );
}

/**
 * The pause menu's Sound section: on and off, the volume, and the effects and music apart. A
 * visiting grown-up's settings are their own. When a grown-up has switched sound off in the
 * child's learning profile, it says so instead of offering controls that would do nothing.
 */
export function SoundControls({ store, enabled, calm, viewer, heroName }: { store: SoundStore; enabled: boolean; calm: boolean; viewer: "child" | "parent"; heroName: string }) {
  const { settings, error } = useSound(store);
  if (!enabled) {
    return (
      <div className="r3-settings r3-sound">
        <p className="r3-settings-title">Sound</p>
        <p className="r3-setting-note">{viewer === "parent" ? `Sound is off in ${heroName}'s learning settings.` : "Sound is off. A grown-up can turn it on in Settings."}</p>
      </div>
    );
  }
  const off = settings.muted;
  return (
    <div className="r3-settings r3-sound">
      <p className="r3-settings-title">Sound{viewer === "parent" ? " (just for you)" : ""}</p>
      <div className="r3-setting">
        <span className="r3-setting-name">Sound</span>
        <span className="r3-toggle" role="group" aria-label="Sound">
          <button type="button" aria-pressed={!off} onClick={() => store.set({ muted: false })}>
            On
          </button>
          <button type="button" aria-pressed={off} onClick={() => store.set({ muted: true })}>
            Off
          </button>
        </span>
      </div>
      <Slider label="Volume" value={settings.master} disabled={off} onChange={(v) => store.set({ master: v })} />
      <Slider label="Effects" value={settings.effects} disabled={off} onChange={(v) => store.set({ effects: v })} />
      <Slider label="Music" value={settings.music} disabled={off || calm} onChange={(v) => store.set({ music: v })} />
      {calm && <p className="r3-setting-hint">Calm mode: softer sounds, and no music.</p>}
      {error && <span className="r3-setting-error">{error}</span>}
    </div>
  );
}
