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
import { earPlace, elementOf, fixtureCue, makeZoneTracker, roomFloor, surfaceAt, trackZone, troubleCue, zoneAt } from "@/lib/realm3d/sound/cues";
import { recessSound } from "@/lib/realm3d/sound/cues";
import { RECESS_SOUNDS } from "@/lib/realm3d/sound/engine";
import { setRecessSound, type RecessBus } from "@/lib/realm3d/recess/bus";
import { setRideSound, type RideBus } from "@/lib/realm3d/riding";
import { footfallCue, mountSounds, mountSurface, mountVoice } from "@/lib/realm3d/sound/ride-cues";
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
  /** False for a grown-up with view access only: the settings change this visit and are never saved (the save would be refused). Absent counts as true. */
  canSave?: boolean;
  /**
   * The riding (`riding-hud.tsx`): a mount's feet and wings, its hello, getting on and off, fast
   * travel, and the refusals. A grown-up's has no mount, so a grown-up hears none of it.
   */
  ride?: RideBus | null;
  /** A crown ceremony waits this visit: its fanfare is made before anything else. */
  ceremony?: boolean;
  /** The play clock runs this visit (a child's own): its chimes are made ahead. */
  clock?: boolean;
  /** The clock's last-minute warning is up: a gentle chime as it comes. */
  warning?: boolean;
  /**
   * True once the clock has closed the world. The sound then says goodbye — a soft
   * closing cadence under "Well played" — before it stops, rather than stopping mid-note.
   */
  farewell?: () => boolean;
  /** The child has a companion to lead them (`lib/realm3d/lead.ts`): its two cues are made ahead. */
  pet?: boolean;
  /**
   * Recess and the Ring (`use-recess.ts`): the bell, gleams, posts, laps and bests, heard through
   * the recess bus's cue. Only a child's own visit runs the Ring, so only theirs makes its sounds.
   */
  recess?: RecessBus | null;
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

  const { bus, tbus, world, layout } = o;
  const ride = o.ride ?? null;
  const recess = o.recess ?? null;
  // Read once, when the engine is made: whether this visit has a ceremony waiting and a clock.
  const firstVisit = useRef({ ceremony: o.ceremony ?? false, clock: o.clock ?? false, pet: o.pet ?? false });
  const goodbye = o.farewell;
  // Nobody to save for, or nobody allowed to: the sliders still work, for this visit.
  const childId = o.canSave === false ? null : o.childId;
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
    const wantCrown = firstVisit.current.ceremony;
    const clockOn = firstVisit.current.clock;
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
      // The world was closed (`?close`, the clock): no gesture opens a device nothing would close.
      if (engine.finished) {
        for (const t of UNLOCK_EVENTS) window.removeEventListener(t, unlock, true);
        return;
      }
      const active = gestureActivates(e, userActivation());
      if (!active) return;
      if (!engine.attached) {
        if (!engine.attachWith(createWebAudioOut)) return;
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
    // A trouble is heard from where it is: panned by where it sits on screen, and a little
    // quieter far off. One scratch object, so the listener allocates nothing.
    const place = { pan: 0, gain: 1 };
    const untapTroubles = tapTroubles(tbus, (e) => {
      const id = troubleCue(e.kind);
      if (!id) return;
      earPlace(bus.ear, e.x, e.z, place);
      engine.play(id, { pan: place.pan, gain: place.gain });
    });

    // The feet: the child's own, or the mount's under them.
    let steps = 0;
    /** An outdoor foot at (x, z): the ground under it, and every few, the country it is in. */
    const outdoorFoot = (x: number, z: number) => {
      const g = ground();
      const surface = surfaceAt(g, x, z);
      if (++steps % ZONE_EVERY === 0) {
        const changed = trackZone(tracker, zoneAt(g, x, z));
        if (changed) {
          outdoors = changed;
          engine.setZone(changed);
        }
      }
      return surface;
    };
    // In the saddle (or getting into or out of it) the mount's feet are heard, not the child's.
    const mounted = () => !!ride && ride.phase !== "off";
    const voice = ride?.mount ? mountVoice(ride.mount.id) : null;
    /** A mounted jump is in the air, from the push-off to the landing: no hoof comes down meanwhile. */
    let aloft = false;
    bus.setFeet({
      onStep: (x, z) => {
        const room = live.current.room;
        if (room) {
          engine.step(roomFloor(room));
          return;
        }
        if (mounted()) return;
        engine.step(outdoorFoot(x, z));
      },
      onJump: () => {
        if (voice && mounted()) {
          aloft = true;
          engine.play("mount-jump", { rate: voice.rate });
        } else engine.play("jump");
      },
      onLand: (air) => {
        aloft = false;
        if (voice && mounted()) engine.play("mount-land", { rate: voice.rate, gain: Math.min(1, 0.5 + air) });
        else engine.land(air);
      },
    });

    // The mount: its feet and wings, its hello as the child gets on, fast travel, and the
    // refusals the riding says out loud. Calm: a gallop is heard as single feet, the wings and
    // the hello softer.
    if (ride && voice) {
      engine.want(mountSounds(voice));
      setRideSound(ride, {
        onFootfall: (x, z, gallop) => {
          if (aloft) return;
          const calm = live.current.calm;
          engine.footfall(footfallCue(voice.feet, mountSurface(outdoorFoot(x, z)), gallop && !calm), voice.rate);
        },
        onWingbeat: (air) => engine.play("wingbeat", { rate: voice.rate, gain: (air ? 1 : 0.55) * (live.current.calm ? 0.6 : 1) }),
        onMoment: (kind) => {
          aloft = false;
          if (kind === "summon") engine.moment("mount-summon", { wait: 0.5 });
          else if (kind === "down") engine.moment("mount-down", { wait: 0.5 });
          else {
            engine.moment("mount-up", { wait: 0.5 });
            engine.moment(`call-${voice.call}`, { wait: 1, delay: 0.5, gain: live.current.calm ? 0.7 : 1 });
          }
        },
        onTravel: (state) => engine.moment(`travel-${state}`, { wait: 1 }),
        onRefuse: () => engine.play("refuse"),
      });
    } else if (ride) {
      // No mount to ride (a grown-up, or none chosen yet): only the refusals are heard.
      setRideSound(ride, { onRefuse: () => engine.play("refuse") });
    }
    if (wantCrown) engine.want(["crown"], true);
    if (clockOn) engine.want(["last-minute", "farewell"]);
    if (firstVisit.current.pet) engine.want(["pet-lead", "pet-arrive"]);
    // Recess: a child's own visit can run the Ring, so its sounds are made; a grown-up's never is.
    if (recess?.runs) {
      engine.want(RECESS_SOUNDS);
      setRecessSound(recess, {
        onCue: (cue) => {
          const s = recessSound(cue);
          if (s.moment) engine.moment(s.id, { duck: s.duck, wait: 1 });
          else engine.play(s.id);
        },
      });
    }
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
      if (ride) setRideSound(ride, {});
      if (recess) setRecessSound(recess, {});
      setRealmCue(null);
      save?.flush();
      saveRef.current = null;
      if (window.__realmSound === engine) delete window.__realmSound;
      // Leaving stops everything — except when the clock closed the world: then the goodbye
      // plays out under "Well played", and the engine closes itself when it has.
      if (goodbye?.()) engine.farewell();
      else engine.close();
      if (engineRef.current === engine) engineRef.current = null;
    };
    // `world` and `layout` are read through `ground()` the first time only; after that the probe
    // ref above follows them. The engine must not be rebuilt when a building rises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, tbus, childId, store, ride, goodbye, recess]);

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
    // The crown is worn as the ceremony closes: its fanfare, with the music stepped back.
    if (was === "ceremony" && o.overlay !== "ceremony") engine.moment("crown", { duck: true, wait: 3 });
  }, [o.overlay]);

  // The last minute on the clock: a gentle chime as the warning comes up, once.
  const warningWas = useRef(o.warning ?? false);
  useEffect(() => {
    const was = warningWas.current;
    warningWas.current = o.warning ?? false;
    if (o.warning && !was) engineRef.current?.moment("last-minute", { duck: true });
  }, [o.warning]);

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

/** A timber slider for the pause menu, in percent: the sound's levels, and the mouse's look speed. */
export function Slider({
  label,
  value,
  disabled,
  onChange,
  min = 0,
  max = 100,
  step = 5,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className={`r3-slider${disabled ? " r3-slider--off" : ""}`}>
      <span className="r3-slider-name">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${value} percent`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--r3-fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
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
export function SoundControls({
  store,
  enabled,
  calm,
  viewer,
  heroName,
  localOnly = false,
}: {
  store: SoundStore;
  enabled: boolean;
  calm: boolean;
  viewer: "child" | "parent";
  heroName: string;
  /** The settings are not saved (view-only access): say so, rather than fail to save. */
  localOnly?: boolean;
}) {
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
      <p className="r3-settings-title">Sound{localOnly ? " (this visit only)" : viewer === "parent" ? " (just for you)" : ""}</p>
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
