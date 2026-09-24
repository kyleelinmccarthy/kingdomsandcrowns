/**
 * RECESS'S OWN WIRE between the frame loop and the frame — the same carrier trick as `hud-bus.ts`
 * and `trouble-bus.ts`, kept in its own object so recess plugs into the game with a line or two in
 * each shared file.
 *
 *   - The frame ASKS (`want`): start a run of a kind, or stop the one going. The scene eats the
 *     request on its next frame, so the run is only ever changed by the one thing that steps it.
 *   - The scene TELLS: every event of a frame (a gleam, a post, a lap…) through `onEvent`, and the
 *     sound's handler beside it (`setRecessSound`), installed by `realm-sound.tsx` like the ride's.
 *   - Continuous values — the running lap's time, and the lit mark on the minimap — are written by
 *     the scene straight onto DOM nodes the HUD put on screen, each write guarded by a compare.
 *
 * No `three` here: the HUD side is tested under Vitest.
 */

import { ringCourse, type LapCourse } from "./course";
import { makeRun, type RecessEvent, type RecessRun, type RunKind } from "./sim";
import { formatLap } from "@/lib/realm/recess/copy";

export type RecessHandler = (e: RecessEvent) => void;

/**
 * The moments recess has a sound for. The FRAME calls them (`use-recess.ts`), not the scene: only
 * the frame knows whether a lap was a best, and every cue goes with words on screen.
 */
export type RecessCue = "bell" | "gleam" | "post" | "lap" | "best" | "over" | "nudge" | "void";

/** What the sound hears, installed by `setRecessSound`; silent until then. */
export type RecessSound = { onCue: (cue: RecessCue) => void };

export type RecessNodeKey = "time" | "mapMark";

export type RecessBus = {
  course: LapCourse;
  /** The run, stepped only by the scene. The frame reads it; it never writes it. */
  run: RecessRun;
  /** A request from the frame, eaten by the scene: begin a run of this kind, or end the one going. */
  want: RunKind | "stop" | null;
  /** Whether a run may happen here at all: the child's own visit. A grown-up's world draws the course only. */
  runs: boolean;
  lowStimulus: boolean;
  /** The bests to race, foot and ridden: the ghost runs the one for how the child is travelling. */
  bestFoot: number | null;
  bestRide: number | null;
  /** Full depth shows the running time; simple depth shows only the pips. */
  showTime: boolean;
  onEvent: RecessHandler;
  sound: RecessSound;
  nodes: Record<RecessNodeKey, HTMLElement | SVGGElement | null>;

  ask(want: RunKind | "stop"): void;
  setHandler(fn: RecessHandler): void;
  setNode(key: RecessNodeKey, el: HTMLElement | SVGGElement | null): void;
  setBests(foot: number | null, ride: number | null): void;
  setShowTime(show: boolean): void;

  /** @internal — the write cache. */
  last: { tenths: number; mark: string };
};

const noop = () => {};

export function makeRecessSound(): RecessSound {
  return { onCue: noop };
}

export function makeRecessBus(o: { seed: number; runs: boolean; lowStimulus: boolean; showTime: boolean }): RecessBus {
  const bus: RecessBus = {
    course: ringCourse(),
    run: makeRun(o.seed),
    want: null,
    runs: o.runs,
    lowStimulus: o.lowStimulus,
    bestFoot: null,
    bestRide: null,
    showTime: o.showTime,
    onEvent: noop,
    sound: makeRecessSound(),
    nodes: { time: null, mapMark: null },
    ask(want) {
      if (!bus.runs) return;
      bus.want = want;
    },
    setHandler(fn) {
      bus.onEvent = fn;
    },
    setNode(key, el) {
      bus.nodes[key] = el;
      // A node that is new has never been written: forget what the old one said.
      if (key === "time") bus.last.tenths = -2;
      else bus.last.mark = "";
    },
    setBests(foot, ride) {
      bus.bestFoot = foot;
      bus.bestRide = ride;
    },
    setShowTime(show) {
      bus.showTime = show;
    },
    last: { tenths: -2, mark: "" },
  };
  return bus;
}

/** The scene eats the frame's request: what was asked, and nothing asked any more. */
export function takeWant(bus: RecessBus): RunKind | "stop" | null {
  const want = bus.want;
  bus.want = null;
  return want;
}

/** Installs the sound's handlers; any left out go quiet. */
export function setRecessSound(bus: RecessBus, h: Partial<RecessSound>): void {
  bus.sound.onCue = h.onCue ?? noop;
}

/* ------------------------------------------------------------------ painting */

/**
 * The running lap as "23.4", written only when the tenth changes (so a frame that changes nothing
 * builds no string); null clears it.
 */
export function paintLapTime(bus: RecessBus, ms: number | null): void {
  const tenths = ms === null ? -1 : Math.floor(ms / 100);
  if (tenths === bus.last.tenths) return;
  bus.last.tenths = tenths;
  const node = bus.nodes.time;
  if (node) node.textContent = ms === null ? "" : formatLap(tenths * 100);
}

/** The lit mark on the minimap, in world units, or "" to hide it. */
export function paintMapMark(bus: RecessBus, transform: string): void {
  if (transform === bus.last.mark) return;
  bus.last.mark = transform;
  const node = bus.nodes.mapMark;
  if (!node) return;
  if (transform === "") {
    (node as SVGGElement).style.display = "none";
    return;
  }
  (node as SVGGElement).style.display = "";
  node.setAttribute("transform", transform);
}
