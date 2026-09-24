/**
 * EVERY SOUND IN THE 3D REALM, as a recipe for `dsp.ts`.
 *
 * The brief for all of them is the same: soft, warm and rounded — a cosy low-poly game, not a
 * test tone. In practice that means:
 *
 *   - pitched things are sines, triangles, kalimba and marimba tones, and bells: instruments with
 *     a soft attack and a tail that dies away by itself;
 *   - the noise is always filtered, and mostly band-passed low (a brush, not a hiss);
 *   - nothing sits above about 3 kHz for long, and the only high partials (sparkle on a win,
 *     frost) are quiet and fade fast; calm mode drops them and low-passes everything;
 *   - a right answer rises and resolves, a wrong one is a soft low "hmm", never a buzzer;
 *   - every sound is levelled here, so the mix is set in one place (`level`, 0..1 peak).
 *
 * The pitches come from one key — C major pentatonic, with F for the bass — so any two sounds
 * that happen to land together are consonant, and so is the music under them.
 */

import { Builder, finish, reverb, seamless, seedOf } from "./dsp";

/** The spell elements, in the catalogue's order (`spell-catalog.ts`). */
export const ELEMENTS = ["ember", "tide", "stone", "gale", "light", "shadow", "frost", "storm", "bloom"] as const;
export type Element = (typeof ELEMENTS)[number];

export const SURFACES = ["grass", "road", "wood", "stone", "water"] as const;
export type Surface = (typeof SURFACES)[number];

export const FIXTURES = ["bell", "lever", "throne", "boat", "scales", "page", "scope", "bees"] as const;
export type FixtureSound = (typeof FIXTURES)[number];

export const ZONES = ["village", "meadow", "wood", "shore", "summit", "indoors"] as const;
export type Zone = (typeof ZONES)[number];

export const BEDS = ["bed-air", "bed-leaves", "bed-waves", "bed-peak", "bed-room", "bed-meadow"] as const;
export type BedId = (typeof BEDS)[number];

export const DETAILS = ["amb-bird-a", "amb-bird-b", "amb-bird-c", "amb-lap", "amb-owl", "amb-gust", "amb-cricket", "amb-crackle", "amb-creak", "amb-hammer"] as const;
export type DetailId = (typeof DETAILS)[number];

/** The ground a mount's feet can find: it is never ridden indoors. */
export const MOUNT_SURFACES = ["grass", "road", "water"] as const;
export type MountSurface = (typeof MOUNT_SURFACES)[number];

/** Hooves (pony, donkey, goat, stag) or padded feet (direwolf, boar, and the winged two on the ground). */
export const MOUNT_FEET = ["hoof", "paw"] as const;
export type MountFeet = (typeof MOUNT_FEET)[number];

/** The soft hello each kind of mount gives as the child gets on. */
export const MOUNT_CALLS = ["whinny", "bray", "bleat", "bugle", "grunt", "howl", "trill", "rumble"] as const;
export type MountCall = (typeof MOUNT_CALLS)[number];

export const EFFECTS = [
  ...SURFACES.map((s) => `step-${s}` as const),
  "jump",
  "land",
  ...ELEMENTS.map((e) => `charge-${e}` as const),
  ...ELEMENTS.map((e) => `release-${e}` as const),
  "trouble-hit",
  "trouble-clear",
  "blob-bounce",
  "trouble-sighted",
  "trouble-shielded",
  "prompt",
  "talk",
  "deed-right",
  "deed-wrong",
  "rise",
  "complete",
  "door-in",
  "door-out",
  ...FIXTURES.map((f) => `fixture-${f}` as const),
  "ui-click",
  "pause",
  "resume",
  "refuse",
  "lesson",
  "tutorial-done",
  "found",
  // Riding: a footfall at a walk and a gallop's three beats, by feet and ground; the wings.
  ...MOUNT_FEET.flatMap((f) => MOUNT_SURFACES.map((s) => `${f}-${s}` as const)),
  ...MOUNT_FEET.flatMap((f) => MOUNT_SURFACES.map((s) => `gallop-${f}-${s}` as const)),
  "wingbeat",
  "mount-jump",
  "mount-land",
  "mount-summon",
  "mount-up",
  "mount-down",
  ...MOUNT_CALLS.map((c) => `call-${c}` as const),
  "travel-start",
  "travel-arrive",
  "travel-stop",
  // The companion leading (`lib/realm3d/lead.ts`): setting off, "this way!", and "here it is!".
  "pet-lead",
  "pet-arrive",
  // The big quiet moments: a crown worn, the last minute, and the goodbye.
  "crown",
  "last-minute",
  "farewell",
  // Recess and the Ring: the bell that starts it, a gleam, a post passed, a lap, a best, the end.
  "recess-bell",
  "gleam",
  "ring-post",
  "lap-done",
  "lap-best",
  "recess-over",
] as const;
export type EffectId = (typeof EFFECTS)[number];

export type SoundId = EffectId | DetailId | BedId;

/** Every sound the board plays, in the order it shows them. */
export const ALL_SOUNDS: readonly SoundId[] = [...EFFECTS, ...DETAILS, ...BEDS];

/** The sample rate every effect is rendered at. Nothing here needs more than 16 kHz of bandwidth. */
export const SFX_RATE = 32000;
/** The beds are all wind, water and room: half the rate is plenty, and half the memory. */
export const BED_RATE = 22050;

/* ------------------------------------------------------------------ pitch */

export function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
/** C major pentatonic, as MIDI: every pitched sound picks from here. */
export const C4 = 60;
const D4 = 62, E4 = 64, G4 = 67, A4 = 69, C5 = 72, D5 = 74, E5 = 76, G5 = 79, A5 = 81, C6 = 84, E6 = 88;
const G3 = 55, C3 = 48, A3 = 57, E3 = 52, D3 = 50;

/* ------------------------------------------------------------------ instruments */

const KALIMBA = [
  [5.4, 0.16, 0.12],
  [2.0, 0.06, 0.4],
] as const;
const MARIMBA = [
  [3.93, 0.22, 0.14],
  [9.2, 0.04, 0.05],
] as const;
const BELL = [
  [0.5, 0.28, 1.6],
  [1.19, 0.34, 0.8],
  [1.56, 0.2, 0.6],
  [2.0, 0.24, 0.5],
  [2.51, 0.1, 0.35],
  [3.01, 0.06, 0.25],
] as const;
const CHIME = [
  [2.76, 0.2, 0.3],
  [5.4, 0.06, 0.12],
] as const;

/** A kalimba tine: a soft woody pluck with a ringing tail. The music's voice, and the wins'. */
export function kalimba(b: Builder, start: number, midi: number, amp: number, decay = 0.9): void {
  b.tone({ start, dur: decay * 5, freq: hz(midi), amp, attack: 0.004, decay, partials: KALIMBA });
  b.noise({ start, dur: 0.02, amp: amp * 0.25, filter: "bp", freq: 2400, q: 1.5, attack: 0.001, decay: 0.004 });
}

function marimba(b: Builder, start: number, midi: number, amp: number, decay = 0.28): void {
  b.tone({ start, dur: decay * 5, freq: hz(midi), amp, attack: 0.003, decay, partials: MARIMBA });
}

function bell(b: Builder, start: number, freq: number, amp: number, decay = 1.4): void {
  b.tone({ start, dur: decay * 4.5, freq, amp, attack: 0.003, decay, partials: BELL });
}

function chime(b: Builder, start: number, midi: number, amp: number, decay = 0.6): void {
  b.tone({ start, dur: decay * 5, freq: hz(midi), amp, attack: 0.003, decay, partials: b.calm ? [] : CHIME });
}

/** A low, round thump: a foot landing, a door settling, a stone set down. */
function thump(b: Builder, start: number, freq: number, amp: number, decay = 0.07): void {
  b.tone({ start, dur: decay * 6, freq: freq * 1.6, to: freq, glide: 0.02, amp, attack: 0.002, decay });
  // The body a small speaker can actually play: the same knock, an octave and a fifth up.
  b.tone({ start, dur: decay * 4, freq: freq * 3.2, to: freq * 3, glide: 0.02, amp: amp * 0.45, attack: 0.002, decay: decay * 0.6 });
  b.noise({ start, dur: decay * 3, amp: amp * 0.5, filter: "bp", freq: 600, q: 0.8, attack: 0.002, decay: decay * 0.5, color: "pink" });
}

/** A soft sparkle: a few quiet high chimes, scattered. Dropped entirely under calm. */
function sparkle(b: Builder, start: number, count: number, amp: number, spread = 0.3): void {
  if (b.calm) return;
  const notes = [C6, E6, G5 + 12, A5 + 12 - 12, D5 + 12];
  for (let i = 0; i < count; i++) {
    const t = start + b.r(0, spread);
    b.tone({ start: t, dur: 0.5, freq: hz(notes[i % notes.length]), amp: amp * b.r(0.5, 1), attack: 0.005, decay: 0.09 });
  }
}

/* ------------------------------------------------------------------ recipes */

export type Recipe = {
  seconds: number;
  /** Peak level after finishing, 0..1: the sound's place in the mix. */
  level: number;
  /** Reverb mix and room size; 0 for none. */
  room?: number;
  size?: number;
  lowpass?: number;
  fadeOut?: number;
  /** High-pass corner; defaults to 75 Hz for effects and 100 Hz for beds. */
  highpass?: number;
  /** Seconds of reverb tail to leave room for; defaults to one scaled by the room size. */
  tail?: number;
  /** A bed: rendered `seconds + overlap` long and cross-faded into a seamless loop. */
  loop?: number;
  build: (b: Builder) => void;
};

function step(surface: Surface): Recipe {
  switch (surface) {
    case "grass":
      // A soft brush through the grass and a very small thud under it.
      return {
        seconds: 0.2,
        level: 0.2,
        room: 0.04,
        tail: 0.08,
        build: (b) => {
          const k = b.r(0.85, 1.15);
          b.noise({ dur: 0.16, amp: 1, filter: "bp", freq: 1500 * k, to: 900 * k, q: 0.9, attack: 0.01, decay: 0.035, color: "pink" });
          b.crackle({ start: 0.005, dur: 0.07, rate: 120, amp: 0.12, freq: 2200 * k, q: 3, ramp: "down" });
          thump(b, 0, 110 * k, 0.35, 0.03);
        },
      };
    case "road":
      // A dry scuff on packed earth and cobble: lower, with a little stone tick.
      return {
        seconds: 0.2,
        level: 0.22,
        room: 0.05,
        tail: 0.08,
        build: (b) => {
          const k = b.r(0.88, 1.12);
          b.noise({ dur: 0.12, amp: 1, filter: "bp", freq: 1100 * k, to: 700 * k, q: 1.2, attack: 0.003, decay: 0.03 });
          b.crackle({ start: 0.002, dur: 0.05, rate: 180, amp: 0.3, freq: 2200 * k, q: 4, ramp: "down" });
          thump(b, 0, 120 * k, 0.5, 0.035);
        },
      };
    case "wood":
      // A hollow knock on floorboards: two soft modes and a short tap.
      return {
        seconds: 0.26,
        level: 0.24,
        room: 0.12,
        size: 0.55,
        tail: 0.14,
        build: (b) => {
          const k = b.r(0.9, 1.1);
          b.tone({ dur: 0.25, freq: 175 * k, amp: 0.9, attack: 0.002, decay: 0.05 });
          b.tone({ dur: 0.2, freq: 410 * k, amp: 0.35, attack: 0.002, decay: 0.03 });
          b.noise({ dur: 0.05, amp: 0.4, filter: "bp", freq: 1500 * k, q: 1, attack: 0.001, decay: 0.01 });
        },
      };
    case "stone":
      // The great hall's flags: a firmer tap, and the hall answers.
      return {
        seconds: 0.45,
        level: 0.22,
        room: 0.22,
        size: 1.1,
        build: (b) => {
          const k = b.r(0.9, 1.1);
          b.noise({ dur: 0.06, amp: 1, filter: "bp", freq: 1600 * k, q: 1.4, attack: 0.001, decay: 0.012 });
          thump(b, 0, 130 * k, 0.5, 0.03);
        },
      };
    case "water":
      // Wading: a soft slosh that falls, and a bubble or two.
      return {
        seconds: 0.36,
        level: 0.22,
        room: 0.04,
        tail: 0.08,
        build: (b) => {
          const k = b.r(0.85, 1.15);
          b.noise({ dur: 0.3, amp: 1, filter: "bp", freq: 1400 * k, to: 500 * k, q: 1.1, attack: 0.02, decay: 0.07 });
          b.noise({ dur: 0.2, amp: 0.5, filter: "lp", freq: 400, attack: 0.01, decay: 0.05, color: "brown" });
          const n = 1 + Math.floor(b.r(0, 2.5));
          for (let i = 0; i < n; i++) b.tone({ start: b.r(0.03, 0.15), dur: 0.08, freq: b.r(700, 1100), to: b.r(350, 500), glide: 0.02, amp: 0.2, attack: 0.002, decay: 0.02 });
        },
      };
  }
}

/** The charge: a swell that gathers for up to a second, in the element's own colour. */
function charge(e: Element): Recipe {
  const base: Omit<Recipe, "build"> = { seconds: 1.1, level: 0.3, room: 0.1 };
  const sw = { attack: 0.85, release: 0.15, curve: 1.6 };
  switch (e) {
    case "ember":
      return { ...base, build: (b) => {
        b.noise({ dur: 1.1, amp: 0.9, filter: "bp", freq: 250, to: 900, q: 0.8, color: "pink", swell: sw });
        b.crackle({ dur: 1.1, rate: 30, amp: 0.15, freq: 1900, q: 3, ramp: "up" });
        b.tone({ dur: 1.1, freq: hz(G3), to: hz(C4), glide: 0.5, wave: "warm", amp: 0.2, swell: sw });
      } };
    case "tide":
      return { ...base, build: (b) => {
        b.noise({ dur: 1.1, amp: 0.8, filter: "bp", freq: 500, to: 1100, q: 1.3, swell: sw, wobble: 3, wobbleDepth: 0.25 });
        b.tone({ dur: 1.1, freq: hz(C4), to: hz(G4), glide: 0.5, amp: 0.3, vib: 6, vibDepth: 0.03, swell: sw });
      } };
    case "stone":
      return { ...base, build: (b) => {
        b.noise({ dur: 1.1, amp: 1, filter: "bp", freq: 220, to: 500, q: 0.9, color: "pink", swell: sw });
        b.tone({ dur: 1.1, freq: hz(C3), to: hz(G3), glide: 0.6, amp: 0.35, wave: "warm", swell: sw });
        b.crackle({ dur: 1.1, rate: 18, amp: 0.3, freq: 1200, q: 3, ramp: "up" });
      } };
    case "gale":
      return { ...base, build: (b) => {
        b.noise({ dur: 1.1, amp: 1, filter: "bp", freq: 450, to: 1700, q: 2.2, swell: sw, color: "pink" });
        b.noise({ dur: 1.1, amp: 0.4, filter: "bp", freq: 900, to: 2400, q: 4, swell: sw, color: "pink" });
      } };
    case "light":
      return { ...base, build: (b) => {
        for (const [m, a] of [[C5, 0.3], [E5, 0.24], [G5, 0.2]] as const) b.tone({ dur: 1.1, freq: hz(m), amp: a, trem: 7, tremDepth: 0.35, swell: sw });
        b.tone({ dur: 1.1, freq: hz(C4), amp: 0.18, swell: sw });
      } };
    case "shadow":
      return { ...base, build: (b) => {
        b.tone({ dur: 1.1, freq: hz(A3) * 0.5, amp: 0.4, wave: "warm", vib: 0.8, vibDepth: 0.01, swell: sw });
        b.tone({ dur: 1.1, freq: hz(E4) * 0.5 * 1.004, amp: 0.25, swell: sw });
        b.noise({ dur: 1.1, amp: 0.5, filter: "bp", freq: 260, to: 600, q: 0.9, color: "pink", swell: sw });
      } };
    case "frost":
      return { ...base, build: (b) => {
        b.tone({ dur: 1.1, freq: hz(E5), amp: 0.2, swell: sw });
        const pings = b.calm ? 4 : 9;
        for (let i = 0; i < pings; i++) {
          const t = 0.9 * Math.sqrt((i + b.r(0, 0.8)) / pings);
          b.tone({ start: t, dur: 0.3, freq: hz([E6, C6, G5, A5][i % 4]), amp: 0.16, attack: 0.006, decay: 0.07 });
        }
        b.noise({ dur: 1.1, amp: 0.1, filter: "bp", freq: 2800, q: 1.2, swell: sw, color: "pink" });
      } };
    case "storm":
      return { ...base, build: (b) => {
        b.noise({ dur: 1.1, amp: 1, filter: "bp", freq: 200, to: 420, q: 0.9, color: "pink", swell: sw });
        b.crackle({ dur: 1.1, rate: 30, amp: 0.25, freq: 1800, q: 2, ramp: "up" });
        b.tone({ dur: 1.1, freq: hz(E3), to: hz(A3), glide: 0.6, amp: 0.2, trem: 11, tremDepth: 0.5, swell: sw });
      } };
    case "bloom":
      return { ...base, build: (b) => {
        b.tone({ dur: 1.1, freq: hz(C5), to: hz(E5), glide: 0.45, amp: 0.3, vib: 5, vibDepth: 0.012, swell: sw });
        b.noise({ dur: 1.1, amp: 0.2, filter: "bp", freq: 1200, q: 1.5, swell: sw });
        b.tone({ dur: 1.1, freq: hz(G4), amp: 0.14, swell: sw });
      } };
  }
}

/** The release: the moment the spell leaves the hands. Short, and it lands. */
function release(e: Element): Recipe {
  const base = { seconds: 0.9, level: 0.38, room: 0.14 };
  switch (e) {
    case "ember":
      return { ...base, build: (b) => {
        b.noise({ dur: 0.5, amp: 1, filter: "lp", freq: 2600, to: 380, attack: 0.006, decay: 0.12, color: "pink" });
        thump(b, 0, 100, 0.6, 0.08);
        b.crackle({ start: 0.02, dur: 0.35, rate: 40, amp: 0.15, freq: 1900, q: 3, ramp: "down" });
      } };
    case "tide":
      return { ...base, build: (b) => {
        b.noise({ dur: 0.5, amp: 1, filter: "bp", freq: 1500, to: 450, q: 1, attack: 0.01, decay: 0.12 });
        b.tone({ dur: 0.35, freq: hz(G4), to: hz(C4), glide: 0.06, amp: 0.4, attack: 0.004, decay: 0.08 });
      } };
    case "stone":
      return { ...base, build: (b) => {
        thump(b, 0, 90, 1, 0.12);
        b.crackle({ start: 0.01, dur: 0.25, rate: 60, amp: 0.3, freq: 1200, q: 3, ramp: "down" });
      } };
    case "gale":
      return { ...base, build: (b) => {
        b.noise({ dur: 0.6, amp: 1, filter: "bp", freq: 2200, to: 500, q: 1.8, attack: 0.02, decay: 0.16, color: "pink" });
      } };
    case "light":
      return { ...base, build: (b) => {
        chime(b, 0, C5, 0.35, 0.3);
        chime(b, 0.05, E5, 0.3, 0.3);
        chime(b, 0.1, G5, 0.28, 0.35);
        sparkle(b, 0.08, 4, 0.1, 0.25);
      } };
    case "shadow":
      return { ...base, build: (b) => {
        b.tone({ dur: 0.6, freq: hz(A3), to: hz(A3) * 0.5, glide: 0.12, wave: "warm", amp: 0.55, attack: 0.01, decay: 0.15 });
        b.noise({ dur: 0.5, amp: 0.5, filter: "lp", freq: 900, to: 200, attack: 0.01, decay: 0.12, color: "brown" });
      } };
    case "frost":
      return { ...base, build: (b) => {
        bell(b, 0, hz(E6) * 0.5, 0.25, 0.25);
        chime(b, 0.03, G5, 0.25, 0.2);
        b.noise({ dur: 0.35, amp: 0.2, filter: "bp", freq: 2600, q: 1.2, attack: 0.004, decay: 0.06, color: "pink" });
      } };
    case "storm":
      return { ...base, build: (b) => {
        // Thunder for eight-year-olds: a soft crack and a rolling rumble, nothing sharp.
        b.noise({ dur: 0.15, amp: 0.6, filter: "bp", freq: 1800, q: 0.8, attack: 0.002, decay: 0.025 });
        b.noise({ dur: 0.8, amp: 1, filter: "lp", freq: 420, to: 200, attack: 0.03, decay: 0.2, color: "pink", wobble: 6, wobbleDepth: 0.4 });
      } };
    case "bloom":
      return { ...base, build: (b) => {
        b.pluck({ freq: hz(C4), amp: 0.5, decay: 0.5, bright: 0.3 });
        b.pluck({ start: 0.04, freq: hz(G4), amp: 0.4, decay: 0.45, bright: 0.3 });
        b.pluck({ start: 0.08, freq: hz(E5) * 0.5, amp: 0.35, decay: 0.45, bright: 0.3 });
        sparkle(b, 0.05, 2, 0.08, 0.2);
      } };
  }
}

function fixture(f: FixtureSound): Recipe {
  switch (f) {
    case "bell":
      // The chapel bell, pulled by its rope: one strike and a long, slow hum.
      return { seconds: 4.2, level: 0.34, room: 0.25, size: 1.4, build: (b) => {
        b.noise({ dur: 0.35, amp: 0.2, filter: "bp", freq: 700, to: 400, q: 1, attack: 0.05, decay: 0.08 });
        bell(b, 0.25, hz(G3), 0.6, 1.3);
      } };
    case "lever":
      // The mill's lever: a wooden ratchet, a clunk, and the wheel taking up.
      return { seconds: 1.3, level: 0.36, room: 0.12, size: 0.7, build: (b) => {
        for (let i = 0; i < 5; i++) b.noise({ start: i * 0.055, dur: 0.03, amp: 0.5, filter: "bp", freq: 1300 + i * 60, q: 3, attack: 0.001, decay: 0.006 });
        thump(b, 0.3, 120, 0.9, 0.09);
        b.tone({ start: 0.3, dur: 0.3, freq: 180, amp: 0.3, attack: 0.002, decay: 0.05 });
        b.noise({ start: 0.35, dur: 0.9, amp: 0.3, filter: "lp", freq: 220, color: "brown", swell: { attack: 0.3, release: 0.4 } });
      } };
    case "throne":
      // Sitting on the throne: a soft cushion, and two regal notes.
      return { seconds: 2.0, level: 0.36, room: 0.2, size: 1.2, build: (b) => {
        b.noise({ dur: 0.25, amp: 0.6, filter: "lp", freq: 500, attack: 0.01, decay: 0.06, color: "brown" });
        b.tone({ start: 0.18, dur: 0.9, freq: hz(G4), amp: 0.3, wave: "warm", attack: 0.03, decay: 0.3 });
        b.tone({ start: 0.42, dur: 1.4, freq: hz(C5), amp: 0.34, wave: "warm", attack: 0.03, decay: 0.5, vib: 5, vibDepth: 0.006 });
        sparkle(b, 0.45, 3, 0.06, 0.4);
      } };
    case "boat":
      // The bridge's little boat: a slosh against the hull, and a wooden knock.
      return { seconds: 1.3, level: 0.32, room: 0.08, build: (b) => {
        b.noise({ dur: 0.9, amp: 1, filter: "bp", freq: 600, to: 350, q: 1, swell: { attack: 0.25, release: 0.5 }, color: "pink" });
        b.tone({ start: 0.3, dur: 0.2, freq: 220, amp: 0.4, attack: 0.002, decay: 0.04 });
      } };
    case "scales":
      // The market scales: small brass pans touching.
      return { seconds: 1.4, level: 0.3, room: 0.12, build: (b) => {
        b.tone({ dur: 1.2, freq: 1320, amp: 0.3, attack: 0.002, decay: 0.25, partials: [[2.4, 0.2, 0.4]] });
        b.tone({ start: 0.16, dur: 1.2, freq: 1180, amp: 0.25, attack: 0.002, decay: 0.2, partials: [[2.4, 0.15, 0.4]] });
        b.noise({ start: 0.3, dur: 0.2, amp: 0.2, filter: "bp", freq: 900, q: 2, attack: 0.001, decay: 0.02 });
      } };
    case "page":
      // The great book: a page turned.
      return { seconds: 0.7, level: 0.26, room: 0.08, lowpass: 4000, build: (b) => {
        b.noise({ dur: 0.5, amp: 1, filter: "bp", freq: 1500, to: 1000, q: 0.9, swell: { attack: 0.18, release: 0.3 }, wobble: 18, wobbleDepth: 0.3, color: "pink" });
        b.noise({ start: 0.35, dur: 0.1, amp: 0.4, filter: "bp", freq: 1200, q: 1, attack: 0.002, decay: 0.02 });
      } };
    case "scope":
      // The watchtower's glass: a brass draw and a click.
      return { seconds: 0.8, level: 0.28, room: 0.1, build: (b) => {
        b.noise({ dur: 0.35, amp: 0.6, filter: "bp", freq: 1600, to: 2400, q: 3, swell: { attack: 0.15, release: 0.15 } });
        b.tone({ start: 0.36, dur: 0.3, freq: 1500, amp: 0.3, attack: 0.001, decay: 0.03 });
        chime(b, 0.4, G5, 0.12, 0.2);
      } };
    case "bees":
      // The garden's hive: a lazy, warm hum that swells and goes.
      return { seconds: 1.8, level: 0.26, room: 0.06, build: (b) => {
        b.tone({ dur: 1.8, freq: 220, amp: 0.3, wave: "tri", vib: 11, vibDepth: 0.03, trem: 23, tremDepth: 0.4, swell: { attack: 0.5, release: 0.8 } });
        b.tone({ dur: 1.8, freq: 233, amp: 0.2, wave: "tri", vib: 9, vibDepth: 0.03, swell: { attack: 0.7, release: 0.7 } });
      } };
  }
}

/* ------------------------------------------------------------------ riding, and the big quiet moments */

/**
 * A soft animal voice: a tone whose harmonics are weighted by two formants, so it has a vowel
 * ("ee", "eh", "ah", "oo", "aw") rather than the bare hoot of a sine. The formants are cartoon
 * ones, and every harmonic above 3.2 kHz is left out: a mount says hello, it never shrieks.
 */
type Vowel = "ee" | "eh" | "ah" | "oo" | "aw";
const FORMANTS: Readonly<Record<Vowel, readonly [number, number]>> = {
  ee: [320, 2200],
  eh: [560, 1750],
  ah: [780, 1200],
  oo: [360, 820],
  aw: [600, 950],
};

function voicePartials(f0: number, vowel: Vowel): { base: number; partials: [number, number, number][] } {
  const [f1, f2] = FORMANTS[vowel];
  const bump = (f: number, c: number, bw: number) => Math.exp(-((f - c) * (f - c)) / (2 * bw * bw));
  const weight = (k: number) => {
    const f = f0 * k;
    return (0.25 + bump(f, f1, 160) + 0.55 * bump(f, f2, 260)) / Math.pow(k, 0.6);
  };
  const base = Math.max(0.08, weight(1));
  const partials: [number, number, number][] = [];
  for (let k = 2; k <= 8; k++) {
    if (f0 * k > 3200) break;
    partials.push([k, Math.min(3, weight(k) / base), 1]);
  }
  return { base, partials };
}

type VoiceSpec = {
  start?: number;
  dur: number;
  freq: number;
  to?: number;
  glide?: number;
  amp: number;
  vowel: Vowel;
  attack: number;
  release: number;
  vib?: number;
  vibDepth?: number;
  trem?: number;
  tremDepth?: number;
};

function animalVoice(b: Builder, v: VoiceSpec): void {
  // The vowel is weighed at the middle of the glide: near enough at either end.
  const mid = v.to !== undefined ? Math.sqrt(v.freq * v.to) : v.freq;
  const { partials } = voicePartials(mid, v.vowel);
  const sum = partials.reduce((a, p) => a + p[1], 0);
  b.tone({
    start: v.start,
    dur: v.dur,
    freq: v.freq,
    to: v.to,
    glide: v.glide,
    amp: v.amp / (1 + sum * 0.5),
    // Calm keeps the vowel's first few harmonics only: rounder, and nothing near the top.
    partials: b.calm ? partials.slice(0, 3) : partials,
    swell: { attack: v.attack, release: v.release, curve: 1.6 },
    vib: v.vib,
    vibDepth: v.vibDepth,
    trem: v.trem,
    tremDepth: v.tremDepth,
  });
}

/** A breath through the nose: the little snort a pony ends on. */
function breath(b: Builder, start: number, dur: number, amp: number, freq = 700): void {
  b.noise({ start, dur, amp, filter: "bp", freq, to: freq * 0.7, q: 1.1, color: "pink", swell: { attack: dur * 0.3, release: dur * 0.6 } });
}

/**
 * One foot down. A hoof is a hollow wooden "clop" — two short resonances and a tick over a small
 * thud — on the road, and a muffled thud through the turf; a slosh in the shallows. A padded
 * foot is the same weight with no knock in it: a soft pad and, on the road, the faintest tick of
 * a claw.
 */
function footHit(b: Builder, start: number, feet: MountFeet, surface: MountSurface, amp: number, k: number): void {
  if (surface === "water") {
    b.noise({ start, dur: 0.26, amp: amp * 0.9, filter: "bp", freq: 1200 * k, to: 450 * k, q: 1.1, attack: 0.012, decay: 0.06 });
    b.noise({ start, dur: 0.18, amp: amp * 0.5, filter: "lp", freq: 380, attack: 0.008, decay: 0.05, color: "brown" });
    thump(b, start, 120 * k, amp * 0.4, 0.04);
    b.tone({ start: start + b.r(0.03, 0.1), dur: 0.07, freq: b.r(650, 950), to: b.r(330, 450), glide: 0.02, amp: amp * 0.15, attack: 0.002, decay: 0.018 });
    return;
  }
  if (feet === "hoof") {
    if (surface === "road") {
      b.tone({ start, dur: 0.12, freq: 560 * k, amp: amp * 0.55, attack: 0.0015, decay: 0.022 });
      b.tone({ start, dur: 0.1, freq: 1010 * k, amp: amp * 0.25, attack: 0.0015, decay: 0.014 });
      b.noise({ start, dur: 0.04, amp: amp * 0.35, filter: "bp", freq: 1900 * k, q: 2, attack: 0.001, decay: 0.006 });
      thump(b, start, 140 * k, amp * 0.5, 0.03);
    } else {
      thump(b, start, 135 * k, amp * 0.7, 0.04);
      b.tone({ start, dur: 0.1, freq: 420 * k, amp: amp * 0.32, attack: 0.002, decay: 0.02 });
      b.noise({ start, dur: 0.12, amp: amp * 0.55, filter: "bp", freq: 1100 * k, to: 700 * k, q: 0.9, attack: 0.006, decay: 0.03, color: "pink" });
    }
    return;
  }
  thump(b, start, 125 * k, amp * 0.65, 0.045);
  b.noise({ start, dur: 0.12, amp: amp * 0.6, filter: "bp", freq: 850 * k, to: 450 * k, q: 0.8, attack: 0.008, decay: 0.03, color: "pink" });
  if (surface === "road") b.crackle({ start: start + 0.004, dur: 0.02, rate: 90, amp: amp * 0.12, freq: 1800 * k, q: 4, ramp: "down" });
  else b.noise({ start, dur: 0.1, amp: amp * 0.25, filter: "bp", freq: 1300 * k, to: 900 * k, q: 1, attack: 0.01, decay: 0.025, color: "pink" });
}

/** A mount's feet are felt more than heard, but only above what a laptop speaker can play. */
const FEET_HIGHPASS = 110;

function footfall(feet: MountFeet, surface: MountSurface): Recipe {
  return {
    seconds: surface === "water" ? 0.34 : 0.24,
    level: feet === "hoof" ? 0.24 : 0.2,
    room: 0.05,
    highpass: FEET_HIGHPASS,
    tail: 0.08,
    build: (b) => footHit(b, 0, feet, surface, 1, b.r(0.9, 1.1)),
  };
}

/** A gallop's three beats — ba-da-DUM — the hind pair then the front, the last the firmest. */
function gallop(feet: MountFeet, surface: MountSurface): Recipe {
  return {
    seconds: surface === "water" ? 0.5 : 0.4,
    level: feet === "hoof" ? 0.26 : 0.22,
    room: 0.05,
    highpass: FEET_HIGHPASS,
    tail: 0.08,
    build: (b) => {
      const k = b.r(0.92, 1.08);
      footHit(b, 0, feet, surface, 0.62, k * 1.04);
      footHit(b, b.r(0.068, 0.078), feet, surface, 0.78, k * 0.97);
      footHit(b, b.r(0.145, 0.16), feet, surface, 1, k);
    },
  };
}

function mountCall(c: MountCall): Recipe {
  switch (c) {
    case "whinny":
      // A pony's hello: a light "wee-hee-hee" that flutters down, and a soft snort.
      return { seconds: 1.0, level: 0.2, room: 0.12, build: (b) => {
        animalVoice(b, { dur: 0.72, freq: hz(E5), to: hz(G4), glide: 0.3, amp: 1, vowel: "eh", attack: 0.07, release: 0.4, vib: 9, vibDepth: 0.045, trem: 9, tremDepth: b.calm ? 0.2 : 0.4 });
        breath(b, 0.7, 0.24, 0.35);
      } };
    case "bray":
      // A donkey's, softened into a sing-song: "hee-haw", "hee-haw".
      return { seconds: 1.3, level: 0.2, room: 0.1, build: (b) => {
        for (let i = 0; i < 2; i++) {
          const t = i * 0.52;
          const a = i === 0 ? 1 : 0.7;
          animalVoice(b, { start: t, dur: 0.2, freq: hz(G4), to: hz(A4), glide: 0.08, amp: a * 0.8, vowel: "eh", attack: 0.04, release: 0.1 });
          animalVoice(b, { start: t + 0.2, dur: 0.3, freq: hz(D4), to: hz(C4), glide: 0.12, amp: a, vowel: "ah", attack: 0.04, release: 0.16 });
        }
      } };
    case "bleat":
      // A goat's "meh-eh-eh": the wobble is the whole charm.
      return { seconds: 0.85, level: 0.18, room: 0.1, build: (b) => {
        animalVoice(b, { dur: 0.6, freq: hz(A4), to: hz(G4), glide: 0.25, amp: 1, vowel: "eh", attack: 0.05, release: 0.3, trem: 11, tremDepth: b.calm ? 0.35 : 0.65, vib: 11, vibDepth: 0.02 });
      } };
    case "bugle":
      // A stag's call, far gentler than a real one: a breathy rising "hoo-oo" that settles.
      return { seconds: 1.2, level: 0.18, room: 0.16, size: 1.2, build: (b) => {
        animalVoice(b, { dur: 0.45, freq: hz(G4), to: hz(D5), glide: 0.14, amp: 0.8, vowel: "oo", attack: 0.1, release: 0.15 });
        animalVoice(b, { start: 0.4, dur: 0.55, freq: hz(D5), to: hz(C5), glide: 0.2, amp: 0.9, vowel: "oo", attack: 0.06, release: 0.35, vib: 5, vibDepth: 0.008 });
        breath(b, 0.05, 0.8, 0.18, 1300);
      } };
    case "grunt":
      // A boar's friendly "hnf-hnf-hnf", rising a little at the end, as if pleased.
      return { seconds: 0.8, level: 0.22, room: 0.06, build: (b) => {
        const n = b.calm ? 2 : 3;
        for (let i = 0; i < n; i++) {
          const t = i * 0.15;
          animalVoice(b, { start: t, dur: 0.12, freq: hz(C3) * (1 + i * 0.1), to: hz(E3) * (1 + i * 0.1), glide: 0.05, amp: 1 - i * 0.15, vowel: "aw", attack: 0.015, release: 0.07 });
          breath(b, t, 0.1, 0.25, 520);
        }
      } };
    case "howl":
      // A direwolf's "a-woo", small and sung, the way a puppy tries it.
      return { seconds: 1.3, level: 0.18, room: 0.2, size: 1.3, build: (b) => {
        animalVoice(b, { dur: 0.42, freq: hz(E4), to: hz(A4), glide: 0.14, amp: 0.7, vowel: "ah", attack: 0.08, release: 0.12 });
        animalVoice(b, { start: 0.36, dur: 0.72, freq: hz(A4), to: hz(E4), glide: 0.32, amp: 1, vowel: "oo", attack: 0.05, release: 0.45, vib: 5, vibDepth: 0.012 });
      } };
    case "trill":
      // A gryphon's chirrup: three quick bright chirps, a songbird's rather than an eagle's scream.
      return { seconds: 0.8, level: 0.16, room: 0.12, build: (b) => {
        for (let i = 0; i < 3; i++) animalVoice(b, { start: i * 0.1, dur: 0.09, freq: hz(E5), to: hz(G5), glide: 0.03, amp: 0.8 + i * 0.1, vowel: "ee", attack: 0.012, release: 0.05 });
        animalVoice(b, { start: 0.32, dur: 0.3, freq: hz(G5), to: hz(E5), glide: 0.12, amp: 0.7, vowel: "ee", attack: 0.02, release: 0.2, trem: b.calm ? 0 : 24, tremDepth: 0.5 });
      } };
    case "rumble":
      // A wyrm's contented purr, and a small chirp on top: a big friend, never a roar.
      return { seconds: 1.1, level: 0.2, room: 0.1, build: (b) => {
        animalVoice(b, { dur: 0.8, freq: hz(C3), to: hz(D3), glide: 0.4, amp: 1, vowel: "aw", attack: 0.15, release: 0.45, trem: 21, tremDepth: b.calm ? 0.4 : 0.7 });
        animalVoice(b, { start: 0.62, dur: 0.24, freq: hz(G4), to: hz(C5), glide: 0.07, amp: 0.45, vowel: "oo", attack: 0.03, release: 0.15 });
      } };
  }
}

function rideEffect(id: EffectId): Recipe | null {
  const m = /^(gallop-)?(hoof|paw)-(grass|road|water)$/.exec(id);
  if (m) return m[1] ? gallop(m[2] as MountFeet, m[3] as MountSurface) : footfall(m[2] as MountFeet, m[3] as MountSurface);
  // Every hello is low-passed: warm and round, with no edge a small speaker could make shrill.
  if (id.startsWith("call-")) return { lowpass: 2400, ...mountCall(id.slice(5) as MountCall) };
  switch (id) {
    case "wingbeat":
      // One downstroke: a soft low "whump" of air, and a feathery edge on it.
      return { seconds: 0.45, level: 0.2, room: 0.04, build: (b) => {
        const k = b.r(0.92, 1.08);
        b.noise({ dur: 0.4, amp: 1, filter: "bp", freq: 260 * k, to: 520 * k, q: 0.8, color: "pink", swell: { attack: 0.09, release: 0.26, curve: 1.4 } });
        b.noise({ start: 0.04, dur: 0.3, amp: 0.2, filter: "bp", freq: 1200 * k, to: 800 * k, q: 1, color: "pink", swell: { attack: 0.06, release: 0.2 } });
      } };
    case "mount-jump":
      // The push-off: a firm thud of four feet and a rising rush of air.
      return { seconds: 0.4, level: 0.26, room: 0.05, highpass: FEET_HIGHPASS, build: (b) => {
        thump(b, 0, 130, 0.8, 0.05);
        b.noise({ start: 0.02, dur: 0.3, amp: 0.9, filter: "bp", freq: 380, to: 1100, q: 1.3, attack: 0.03, decay: 0.07, color: "pink" });
        b.tone({ start: 0.02, dur: 0.25, freq: hz(C4), to: hz(G4), glide: 0.06, amp: 0.2, attack: 0.01, decay: 0.06 });
      } };
    case "mount-land":
      // Front feet, then hind: two soft thuds close together, and a little dust.
      return { seconds: 0.45, level: 0.32, room: 0.05, highpass: FEET_HIGHPASS, build: (b) => {
        thump(b, 0, 120, 1, 0.07);
        thump(b, 0.085, 140, 0.75, 0.06);
        b.noise({ dur: 0.2, amp: 0.4, filter: "bp", freq: 1000, to: 600, q: 1, attack: 0.004, decay: 0.05, color: "pink" });
      } };
    case "mount-summon":
      // The mount arrives in a puff of dust: a soft "poof", and a glint as it appears.
      return { seconds: 0.9, level: 0.22, room: 0.1, build: (b) => {
        b.noise({ dur: 0.6, amp: 1, filter: "lp", freq: 1400, to: 380, color: "pink", swell: { attack: 0.04, release: 0.45, curve: 1.5 } });
        chime(b, 0.12, G5, 0.18, 0.25);
        sparkle(b, 0.15, 2, 0.05, 0.2);
      } };
    case "mount-up":
      // Up into the saddle: a hop (two kalimba notes, up), the leather taking the weight, a settle.
      return { seconds: 0.95, level: 0.26, room: 0.1, build: (b) => {
        kalimba(b, 0.02, G4, 0.35, 0.22);
        kalimba(b, 0.3, C5, 0.38, 0.3);
        b.noise({ start: 0.34, dur: 0.28, amp: 0.45, filter: "bp", freq: 620, to: 760, q: 5, swell: { attack: 0.08, release: 0.16 }, wobble: 21, wobbleDepth: 0.2 });
        thump(b, 0.4, 120, 0.5, 0.05);
      } };
    case "mount-down":
      // Hopping down: a swish, the notes coming down, and two small feet on the ground.
      return { seconds: 0.8, level: 0.24, room: 0.08, build: (b) => {
        b.noise({ dur: 0.22, amp: 0.6, filter: "bp", freq: 1000, to: 520, q: 1.1, attack: 0.03, decay: 0.06, color: "pink" });
        kalimba(b, 0.02, C5, 0.3, 0.2);
        kalimba(b, 0.16, G4, 0.3, 0.26);
        thump(b, 0.3, 125, 0.5, 0.035);
        thump(b, 0.36, 115, 0.4, 0.035);
      } };
    case "travel-start":
      // Off we go: a bright kalimba run up and a rush of air filling in behind it.
      return { seconds: 1.6, level: 0.32, room: 0.14, build: (b) => {
        [C4, E4, G4, C5].forEach((mi, i) => kalimba(b, i * 0.09, mi, 0.42, 0.3 + i * 0.06));
        b.noise({ start: 0.1, dur: 1.3, amp: b.calm ? 0.15 : 0.3, filter: "bp", freq: 350, to: 1000, q: 0.9, color: "pink", swell: { attack: 0.5, release: 0.7 } });
        sparkle(b, 0.35, 2, 0.05, 0.2);
      } };
    case "travel-arrive":
      // Here: the run comes home to C, and a soft bell names the place.
      return { seconds: 2.0, level: 0.3, room: 0.18, size: 1.1, build: (b) => {
        [E5, D5, C5].forEach((mi, i) => kalimba(b, i * 0.12, mi, 0.4, 0.3 + i * 0.12));
        bell(b, 0.3, hz(C5), 0.16, 0.8);
        thump(b, 0.02, 110, 0.35, 0.05);
      } };
    case "travel-stop":
      // Pulled up on the road: a gentle "whoa", two notes settling down.
      return { seconds: 1.0, level: 0.24, room: 0.1, build: (b) => {
        marimba(b, 0, G4, 0.45, 0.2);
        marimba(b, 0.15, C4, 0.5, 0.35);
      } };
    case "pet-lead":
      // The pet sets off: "this way!" — a quick little skip up on the marimba, a patter of paws
      // on a soft thump, and the top note left hanging, a question the child answers by following.
      return { seconds: 1.1, level: 0.24, room: 0.1, build: (b) => {
        marimba(b, 0, G4, 0.4, 0.14);
        marimba(b, 0.08, C5, 0.42, 0.14);
        kalimba(b, 0.17, E5, b.calm ? 0.26 : 0.36, 0.45);
        thump(b, 0.02, 150, 0.22, 0.03);
        thump(b, 0.1, 165, 0.18, 0.03);
        if (!b.calm) b.noise({ start: 0.05, dur: 0.22, amp: 0.12, filter: "bp", freq: 700, to: 1100, q: 1.2, color: "pink", attack: 0.02, decay: 0.08 });
      } };
    case "pet-arrive":
      // "Here it is!": the question answered — the same skip, landing home on C, with a small chime.
      return { seconds: 1.6, level: 0.26, room: 0.14, build: (b) => {
        marimba(b, 0, E5, 0.38, 0.16);
        marimba(b, 0.1, D5, 0.36, 0.16);
        kalimba(b, 0.2, C5, 0.42, 0.7);
        chime(b, 0.2, G5, b.calm ? 0.1 : 0.16, 0.5);
        thump(b, 0.2, 130, 0.2, 0.04);
      } };
    case "crown": {
      // THE CROWN IS WORN. A little fanfare in the key of everything else: a "ta-ta-TAA" on a
      // warm horn, a chord that swells under it, a kalimba run up to the top C, and a bell.
      // Nothing brassy or loud: it is a warm moment, not a startle. Calm: the horn and the chord.
      return { seconds: 3.6, level: 0.42, room: 0.2, size: 1.3, build: (b) => {
        const horn = (start: number, mi: number, dur: number, amp: number) =>
          b.tone({
            start,
            dur,
            freq: hz(mi),
            amp,
            wave: "warm",
            partials: [[2, 0.35, 1], [3, 0.12, 1]],
            swell: { attack: b.calm ? 0.05 : 0.025, release: Math.min(dur * 0.6, 0.5), curve: 1.4 },
            vib: 5,
            vibDepth: 0.004,
          });
        horn(0, G4, 0.2, 0.34);
        horn(0.2, G4, 0.2, 0.34);
        horn(0.4, C5, 0.95, 0.42);
        horn(0.4, E4, 0.95, 0.2);
        for (const [mi, a] of [[C3, 0.16], [G3, 0.13], [E4, 0.1], [G4, 0.08]] as const) b.tone({ start: 0.35, dur: 3.0, freq: hz(mi), amp: a, wave: "warm", swell: { attack: 0.5, release: 1.8 } });
        if (!b.calm) [C5, E5, G5, C6].forEach((mi, i) => kalimba(b, 1.1 + i * 0.1, mi, 0.3, 0.5 + i * 0.1));
        bell(b, 1.35, hz(C5), b.calm ? 0.12 : 0.2, 1.1);
        sparkle(b, 1.4, 5, 0.05, 0.7);
      } };
    }
    case "last-minute":
      // "Nearly time": a clock's soft two-note chime, falling, over a warm low C. Never an alarm.
      return { seconds: 2.2, level: 0.24, room: 0.2, size: 1.2, build: (b) => {
        chime(b, 0, G5, 0.42, 0.45);
        chime(b, 0.42, E5, 0.42, 0.7);
        bell(b, 0.42, hz(C5) * 0.5, 0.1, 1.0);
        b.tone({ dur: 1.9, freq: hz(C4), amp: 0.08, wave: "warm", swell: { attack: 0.3, release: 1.2 } });
      } };
    case "farewell":
      // The clock ran out: "Well played". A slow kalimba line coming home to C over a warm chord,
      // with a bell as it lands — the end of a story, not a door shut.
      return { seconds: 4.2, level: 0.32, room: 0.22, size: 1.3, build: (b) => {
        for (const [mi, a] of [[C3, 0.14], [G3, 0.11], [E4, 0.08]] as const) b.tone({ start: 0.1, dur: 3.9, freq: hz(mi), amp: a, wave: "warm", swell: { attack: 0.7, release: 2.2 } });
        [A4, G4, E4, D4].forEach((mi, i) => kalimba(b, i * 0.34, mi, 0.36, 0.4));
        kalimba(b, 1.36, C4, 0.42, 1.0);
        bell(b, 1.38, hz(C5), 0.14, 1.2);
      } };
  }
  return null;
}

/**
 * Recess and the Ring. The school's hand bell rings recess in and out — a bright "ding-ding" that
 * says play time, and the same bell falling home to C when it is over. A gleam is the smallest
 * glassy chime there is (they come often, so it is quiet and short); a post passed is a wooden
 * tick and a chime, "yes, that one"; a lap is a kalimba run up; a best is the run with a chord
 * swelling under it and a bell on top — still below a building finishing, which is the biggest
 * moment the village has. All in the key of everything else.
 */
function recessEffect(id: EffectId): Recipe | null {
  switch (id) {
    case "recess-bell":
      return { seconds: 2.2, level: 0.34, room: 0.16, size: 1.1, build: (b) => {
        // A hand bell swung twice, twice: ding-ding, ding-ding.
        for (const [t, mi, a] of [[0, G5, 0.26], [0.17, E5, 0.22], [0.42, G5, 0.26], [0.59, E5, 0.22]] as const) bell(b, t, hz(mi), a, 0.55);
        if (!b.calm) [C5, E5, G5, C6].forEach((mi, i) => kalimba(b, 0.95 + i * 0.08, mi, 0.3, 0.35 + i * 0.05));
        else kalimba(b, 0.95, C5, 0.3, 0.5);
        sparkle(b, 1.05, 3, 0.05, 0.35);
      } };
    case "gleam":
      // A little glassy "ting-ting", high and short.
      return { seconds: 0.8, level: 0.2, room: 0.1, build: (b) => {
        chime(b, 0, C6, 0.36, 0.16);
        chime(b, 0.07, E6, 0.32, 0.26);
        sparkle(b, 0.08, 1, 0.04, 0.1);
      } };
    case "ring-post":
      // A post passed: a wooden tick, and a chime that says "that one".
      return { seconds: 0.9, level: 0.26, room: 0.1, build: (b) => {
        marimba(b, 0, G4, 0.45, 0.12);
        chime(b, 0.08, G5, 0.36, 0.35);
      } };
    case "lap-done":
      // Home through the arch: a kalimba run up to the top C.
      return { seconds: 1.6, level: 0.32, room: 0.14, build: (b) => {
        [C5, E5, G5, C6].forEach((mi, i) => kalimba(b, i * 0.09, mi, 0.42, 0.3 + i * 0.07));
        bell(b, 0.35, hz(C5), 0.1, 0.6);
      } };
    case "lap-best":
      // A new best: the run, a chord swelling under it, and a bell — a warm "you did it".
      return { seconds: 2.6, level: 0.4, room: 0.18, size: 1.1, build: (b) => {
        for (const [mi, a] of [[C3, 0.16], [G3, 0.13], [E4, 0.1]] as const) b.tone({ dur: 2.2, freq: hz(mi), amp: a, wave: "warm", swell: { attack: 0.3, release: 1.2 } });
        [C5, D5, E5, G5, C6].forEach((mi, i) => kalimba(b, 0.04 + i * 0.08, mi, 0.4, 0.32 + i * 0.07));
        bell(b, 0.5, hz(C5), 0.18, 0.9);
        sparkle(b, 0.5, 4, 0.06, 0.5);
      } };
    case "recess-over":
      // The bell again, slower, coming home: recess is over, and it was good.
      return { seconds: 2.6, level: 0.3, room: 0.2, size: 1.2, build: (b) => {
        for (const [t, mi, a] of [[0, G5, 0.22], [0.36, E5, 0.2], [0.72, C5, 0.22]] as const) bell(b, t, hz(mi), a, 0.8);
        b.tone({ start: 0.7, dur: 1.8, freq: hz(C4), amp: 0.08, wave: "warm", swell: { attack: 0.3, release: 1.2 } });
      } };
  }
  return null;
}

function effect(id: EffectId): Recipe {
  const ridden = rideEffect(id);
  if (ridden) return ridden;
  const recessed = recessEffect(id);
  if (recessed) return recessed;
  if (id.startsWith("step-")) return step(id.slice(5) as Surface);
  if (id.startsWith("charge-")) return charge(id.slice(7) as Element);
  if (id.startsWith("release-")) return release(id.slice(8) as Element);
  if (id.startsWith("fixture-")) return fixture(id.slice(8) as FixtureSound);
  switch (id) {
    case "jump":
      return { seconds: 0.3, level: 0.2, room: 0.04, build: (b) => {
        b.noise({ dur: 0.22, amp: 1, filter: "bp", freq: 450, to: 1300, q: 1.4, attack: 0.02, decay: 0.05 });
        b.tone({ dur: 0.2, freq: hz(G3), to: hz(D4), glide: 0.05, amp: 0.25, attack: 0.01, decay: 0.05 });
      } };
    case "land":
      return { seconds: 0.35, level: 0.3, room: 0.05, build: (b) => {
        thump(b, 0, 100, 1, 0.07);
        b.noise({ dur: 0.12, amp: 0.4, filter: "bp", freq: 1200, to: 700, q: 1, attack: 0.003, decay: 0.03 });
      } };
    case "trouble-hit":
      // A spell landing: a soft "poff" of dust, and a little bump down in pitch.
      return { seconds: 0.5, level: 0.34, room: 0.08, build: (b) => {
        b.noise({ dur: 0.3, amp: 1, filter: "lp", freq: 1600, to: 500, attack: 0.003, decay: 0.06, color: "pink" });
        b.tone({ dur: 0.25, freq: hz(E4), to: hz(C4), glide: 0.04, amp: 0.4, attack: 0.003, decay: 0.05 });
      } };
    case "trouble-clear":
      // The reward: a pop, then a bright rising kalimba run and a little sparkle.
      return { seconds: 1.6, level: 0.42, room: 0.16, build: (b) => {
        b.noise({ dur: 0.12, amp: 0.5, filter: "bp", freq: 900, q: 1, attack: 0.002, decay: 0.03 });
        kalimba(b, 0.04, G4, 0.45, 0.35);
        kalimba(b, 0.11, C5, 0.45, 0.4);
        kalimba(b, 0.18, E5, 0.45, 0.45);
        kalimba(b, 0.25, G5, 0.5, 0.6);
        sparkle(b, 0.3, 4, 0.08, 0.35);
      } };
    case "blob-bounce":
      // Boing, rubber-soft: a springy wobble, low and rounded.
      return { seconds: 0.6, level: 0.34, room: 0.05, build: (b) => {
        b.tone({ dur: 0.45, freq: 140, to: 330, glide: 0.05, amp: 0.7, vib: 16, vibDepth: 0.08, attack: 0.005, decay: 0.12 });
        thump(b, 0, 80, 0.4, 0.05);
      } };
    case "trouble-sighted":
      // Something is near: two soft low wooden notes, a gentle "uh-oh".
      return { seconds: 0.9, level: 0.26, room: 0.12, build: (b) => {
        marimba(b, 0, G4, 0.5, 0.25);
        marimba(b, 0.18, E4, 0.5, 0.35);
      } };
    case "trouble-shielded":
      return { seconds: 0.8, level: 0.26, room: 0.14, build: (b) => {
        bell(b, 0, hz(C5), 0.3, 0.3);
      } };
    case "prompt":
      // The E prompt appearing: the smallest wooden tick there is.
      return { seconds: 0.3, level: 0.14, room: 0.06, build: (b) => {
        marimba(b, 0, A5, 0.5, 0.06);
      } };
    case "talk":
      // Greeting a villager: two friendly marimba notes, up.
      return { seconds: 0.8, level: 0.3, room: 0.1, build: (b) => {
        marimba(b, 0, G4, 0.5, 0.18);
        marimba(b, 0.11, C5, 0.55, 0.25);
      } };
    case "deed-right":
      return { seconds: 1.2, level: 0.36, room: 0.14, build: (b) => {
        kalimba(b, 0, C5, 0.5, 0.35);
        kalimba(b, 0.09, E5, 0.5, 0.4);
        kalimba(b, 0.18, G5, 0.55, 0.55);
        sparkle(b, 0.2, 2, 0.06, 0.2);
      } };
    case "deed-wrong":
      // Not a buzzer: a soft, low, falling "hmm" that says try again without a scold in it.
      return { seconds: 0.9, level: 0.26, room: 0.1, build: (b) => {
        marimba(b, 0, E4, 0.45, 0.22);
        marimba(b, 0.16, C4, 0.45, 0.3);
      } };
    case "rise":
      // A building goes up a stage: two hammer taps and a rising figure.
      return { seconds: 1.4, level: 0.38, room: 0.14, build: (b) => {
        b.tone({ dur: 0.15, freq: 260, amp: 0.4, attack: 0.001, decay: 0.03 });
        b.noise({ dur: 0.05, amp: 0.3, filter: "bp", freq: 1800, q: 2, attack: 0.001, decay: 0.008 });
        b.tone({ start: 0.16, dur: 0.15, freq: 290, amp: 0.4, attack: 0.001, decay: 0.03 });
        b.noise({ start: 0.16, dur: 0.05, amp: 0.3, filter: "bp", freq: 1900, q: 2, attack: 0.001, decay: 0.008 });
        kalimba(b, 0.34, G4, 0.45, 0.35);
        kalimba(b, 0.46, C5, 0.45, 0.35);
        kalimba(b, 0.58, D5, 0.5, 0.6);
      } };
    case "complete":
      // A building finished: the biggest moment the village has. A warm chord swells under a
      // kalimba run up an octave and a half, with a bell on top.
      return { seconds: 3.2, level: 0.46, room: 0.2, size: 1.2, build: (b) => {
        for (const [m, a] of [[C3, 0.2], [G3, 0.16], [E4, 0.12]] as const) b.tone({ dur: 2.6, freq: hz(m), amp: a, wave: "warm", swell: { attack: 0.4, release: 1.4 } });
        const run = [C4, E4, G4, C5, E5, G5];
        run.forEach((m, i) => kalimba(b, 0.05 + i * 0.1, m, 0.42, 0.4 + i * 0.08));
        bell(b, 0.7, hz(C5), 0.2, 0.9);
        sparkle(b, 0.7, 5, 0.06, 0.6);
      } };
    case "door-in":
      // A wooden door: a short creak, the latch, and the room closing round you.
      return { seconds: 1.0, level: 0.32, room: 0.12, size: 0.7, build: (b) => {
        b.noise({ dur: 0.35, amp: 0.7, filter: "bp", freq: 650, to: 900, q: 6, swell: { attack: 0.12, release: 0.15 }, wobble: 23, wobbleDepth: 0.2 });
        b.noise({ start: 0.34, dur: 0.05, amp: 0.4, filter: "bp", freq: 2000, q: 3, attack: 0.001, decay: 0.006 });
        thump(b, 0.4, 120, 0.7, 0.08);
      } };
    case "door-out":
      return { seconds: 1.0, level: 0.3, room: 0.06, build: (b) => {
        b.noise({ dur: 0.05, amp: 0.4, filter: "bp", freq: 1900, q: 3, attack: 0.001, decay: 0.006 });
        b.noise({ start: 0.05, dur: 0.3, amp: 0.6, filter: "bp", freq: 850, to: 620, q: 6, swell: { attack: 0.1, release: 0.15 }, wobble: 19, wobbleDepth: 0.2 });
        thump(b, 0.36, 115, 0.5, 0.07);
        b.noise({ start: 0.3, dur: 0.6, amp: 0.25, filter: "lp", freq: 900, swell: { attack: 0.2, release: 0.3 }, color: "pink" });
      } };
    case "ui-click":
      return { seconds: 0.12, level: 0.16, room: 0, build: (b) => {
        b.tone({ dur: 0.08, freq: 1050, amp: 0.6, attack: 0.001, decay: 0.012 });
        b.noise({ dur: 0.02, amp: 0.3, filter: "bp", freq: 2500, q: 2, attack: 0.001, decay: 0.004 });
      } };
    case "pause":
      return { seconds: 0.8, level: 0.26, room: 0.12, build: (b) => {
        marimba(b, 0, C5, 0.5, 0.2);
        marimba(b, 0.1, G4, 0.5, 0.3);
      } };
    case "resume":
      return { seconds: 0.8, level: 0.26, room: 0.12, build: (b) => {
        marimba(b, 0, G4, 0.5, 0.2);
        marimba(b, 0.1, C5, 0.5, 0.3);
      } };
    case "refuse":
      // Not enough mana, or not ready: a muffled low tap. It tells without nagging.
      return { seconds: 0.25, level: 0.2, room: 0.03, build: (b) => {
        b.tone({ dur: 0.2, freq: 160, to: 120, glide: 0.04, amp: 0.8, attack: 0.003, decay: 0.04 });
      } };
    case "lesson":
      return { seconds: 1.2, level: 0.28, room: 0.16, build: (b) => {
        chime(b, 0, E5, 0.4, 0.4);
        chime(b, 0.12, A5, 0.35, 0.55);
      } };
    case "tutorial-done":
      return { seconds: 2.2, level: 0.4, room: 0.18, build: (b) => {
        [C5, D5, E5, G5, C6].forEach((m, i) => kalimba(b, i * 0.12, m, 0.42, 0.35 + i * 0.1));
        sparkle(b, 0.55, 4, 0.06, 0.5);
      } };
    case "found":
      // A new place: a harp-like pluck run up the pentatonic, and a bell to name it.
      return { seconds: 2.4, level: 0.36, room: 0.2, size: 1.2, build: (b) => {
        [G3, C4, D4, E4, G4, A4].forEach((m, i) => b.pluck({ start: i * 0.07, freq: hz(m), amp: 0.35, decay: 0.9, bright: 0.35 }));
        bell(b, 0.45, hz(C5), 0.22, 1.0);
      } };
  }
  // Every id is covered above; this line only satisfies the type checker.
  throw new Error(`No recipe for ${id}`);
}

function detail(id: DetailId): Recipe {
  switch (id) {
    case "amb-bird-a":
      // A two-note warble, chirped: a blackbird a garden away.
      return { seconds: 0.9, level: 0.16, room: 0.12, build: (b) => {
        const k = b.r(0.94, 1.06);
        b.tone({ dur: 0.14, freq: 2400 * k, to: 3100 * k, glide: 0.04, amp: 0.5, attack: 0.01, decay: 0.04 });
        b.tone({ start: 0.17, dur: 0.2, freq: 3000 * k, to: 2200 * k, glide: 0.06, amp: 0.5, attack: 0.01, decay: 0.06, vib: 30, vibDepth: 0.04 });
      } };
    case "amb-bird-b":
      return { seconds: 1.1, level: 0.14, room: 0.12, build: (b) => {
        const k = b.r(0.92, 1.08);
        for (let i = 0; i < 4; i++) b.tone({ start: i * 0.11, dur: 0.08, freq: (2700 + i * 90) * k, to: 3300 * k, glide: 0.02, amp: 0.4, attack: 0.006, decay: 0.02 });
      } };
    case "amb-bird-c":
      // A wood pigeon, far off: two soft low hoots.
      return { seconds: 1.6, level: 0.14, room: 0.18, build: (b) => {
        b.tone({ dur: 0.5, freq: 520, to: 470, glide: 0.2, amp: 0.5, swell: { attack: 0.1, release: 0.25 } });
        b.tone({ start: 0.55, dur: 0.7, freq: 560, to: 480, glide: 0.3, amp: 0.5, swell: { attack: 0.1, release: 0.35 } });
      } };
    case "amb-lap":
      return { seconds: 1.4, level: 0.16, room: 0.05, build: (b) => {
        b.noise({ dur: 1.2, amp: 1, filter: "bp", freq: 900, to: 500, q: 0.9, swell: { attack: 0.3, release: 0.7 } });
      } };
    case "amb-owl":
      return { seconds: 1.8, level: 0.14, room: 0.25, size: 1.3, build: (b) => {
        b.tone({ dur: 0.35, freq: 390, to: 370, glide: 0.2, amp: 0.5, swell: { attack: 0.06, release: 0.2 } });
        b.tone({ start: 0.5, dur: 0.8, freq: 400, to: 350, glide: 0.4, amp: 0.5, vib: 5, vibDepth: 0.01, swell: { attack: 0.08, release: 0.4 } });
      } };
    case "amb-gust":
      return { seconds: 3.2, level: 0.18, room: 0, build: (b) => {
        b.noise({ dur: 3.2, amp: 1, filter: "bp", freq: 380, to: 700, q: 1.2, swell: { attack: 1.2, release: 1.6, curve: 1.3 }, color: "pink", wobble: 0.7, wobbleDepth: 0.3 });
      } };
    case "amb-cricket":
      return { seconds: 1.0, level: 0.08, room: 0.05, build: (b) => {
        for (let i = 0; i < 3; i++) b.tone({ start: i * 0.2, dur: 0.12, freq: 4200, amp: 0.4, trem: 60, tremDepth: 0.9, swell: { attack: 0.02, release: 0.04 } });
      } };
    case "amb-crackle":
      return { seconds: 1.5, level: 0.12, room: 0.05, build: (b) => {
        b.crackle({ dur: 1.4, rate: 12, amp: 0.8, freq: 1300, q: 2 });
        b.noise({ dur: 1.5, amp: 0.2, filter: "bp", freq: 300, q: 0.8, color: "pink", swell: { attack: 0.3, release: 0.4 } });
      } };
    case "amb-creak":
      return { seconds: 1.0, level: 0.1, room: 0.12, size: 0.7, build: (b) => {
        b.noise({ dur: 0.6, amp: 1, filter: "bp", freq: 520, to: 600, q: 8, swell: { attack: 0.2, release: 0.25 }, wobble: 17, wobbleDepth: 0.25 });
      } };
    case "amb-hammer":
      // Somewhere in the village someone is building something: three soft, far taps.
      return { seconds: 1.4, level: 0.08, room: 0.3, size: 1.2, build: (b) => {
        for (let i = 0; i < 3; i++) {
          b.tone({ start: i * 0.32, dur: 0.12, freq: 300, amp: 0.4, attack: 0.001, decay: 0.02 });
          b.noise({ start: i * 0.32, dur: 0.04, amp: 0.3, filter: "bp", freq: 1500, q: 2, attack: 0.001, decay: 0.006 });
        }
      } };
  }
}

/**
 * The beds under everything, as seamless loops. Each is noise shaped by slow wobbles whose
 * periods are chosen not to line up with the loop, so the ear does not catch the seam, and two
 * beds of different lengths play at once in every zone (`zoneBeds`), so the whole never repeats
 * inside a minute.
 */
function bed(id: BedId): Recipe {
  const over = 1.5;
  switch (id) {
    case "bed-air":
      // A light breeze: brown noise under a slowly moving low-pass.
      return { seconds: 11, loop: over, level: 0.22, lowpass: 900, build: (b) => {
        b.noise({ dur: 11 + over, amp: 1, filter: "bp", freq: 260, q: 0.7, color: "pink", hold: 99, attack: 0.01, wobble: 0.09, wobbleDepth: 0.45 });
        b.noise({ dur: 11 + over, amp: 0.35, filter: "bp", freq: 520, q: 0.9, color: "pink", hold: 99, attack: 0.01, wobble: 0.13, wobbleDepth: 0.4 });
      } };
    case "bed-meadow":
      // Open country: the same air, a touch brighter, grass moving in it.
      return { seconds: 7, loop: over, level: 0.13, lowpass: 1400, build: (b) => {
        b.noise({ dur: 7 + over, amp: 1, filter: "bp", freq: 700, q: 0.7, color: "pink", hold: 99, attack: 0.01, wobble: 0.21, wobbleDepth: 0.35 });
      } };
    case "bed-leaves":
      // The wood: leaves stirring overhead, a soft broadband rustle that breathes.
      return { seconds: 9, loop: over, level: 0.15, lowpass: 1800, build: (b) => {
        b.noise({ dur: 9 + over, amp: 1, filter: "bp", freq: 900, q: 0.6, color: "pink", hold: 99, attack: 0.01, wobble: 0.17, wobbleDepth: 0.3 });
        b.crackle({ dur: 9 + over, rate: 10, amp: 0.08, freq: 1600, q: 2 });
      } };
    case "bed-waves":
      // The shore: slow swells that rise, break softly and draw back.
      return { seconds: 12, loop: over, level: 0.28, lowpass: 2200, build: (b) => {
        const swells = [0, 4.3, 8.1];
        for (const s of swells) {
          const len = b.r(4.5, 5.5);
          b.noise({ start: s, dur: len, amp: b.r(0.7, 1), filter: "bp", freq: 300, to: 900, q: 0.7, color: "pink", swell: { attack: len * 0.55, release: len * 0.45, curve: 1.4 } });
          b.noise({ start: s + len * 0.45, dur: len * 0.5, amp: 0.25, filter: "bp", freq: 1600, to: 900, q: 0.8, color: "pink", swell: { attack: 0.3, release: len * 0.4 } });
        }
        b.noise({ dur: 12 + over, amp: 0.2, filter: "bp", freq: 220, q: 0.7, color: "pink", hold: 99, attack: 0.01 });
      } };
    case "bed-peak":
      // The summit: a steadier wind with a faint whistle through the rocks.
      return { seconds: 10, loop: over, level: 0.24, lowpass: 1800, build: (b) => {
        b.noise({ dur: 10 + over, amp: 1, filter: "bp", freq: 330, q: 0.7, color: "pink", hold: 99, attack: 0.01, wobble: 0.11, wobbleDepth: 0.5 });
        b.noise({ dur: 10 + over, amp: 0.35, filter: "bp", freq: 780, q: 7, color: "pink", hold: 99, attack: 0.01, wobble: 0.07, wobbleDepth: 0.2 });
      } };
    case "bed-room":
      // Indoors: nearly nothing — a warm room tone and a low fire. Rooms are for listening.
      return { seconds: 8, loop: over, level: 0.12, lowpass: 1200, build: (b) => {
        b.noise({ dur: 8 + over, amp: 1, filter: "bp", freq: 200, q: 0.7, color: "pink", hold: 99, attack: 0.01, wobble: 0.3, wobbleDepth: 0.3 });
        b.crackle({ dur: 8 + over, rate: 5, amp: 0.35, freq: 1200, q: 2 });
      } };
  }
}

/** The recipe behind any id. Throws for an id that is not in the catalogue. */
export function recipeFor(id: SoundId): Recipe {
  if ((BEDS as readonly string[]).includes(id)) return bed(id as BedId);
  if ((DETAILS as readonly string[]).includes(id)) return detail(id as DetailId);
  return effect(id as EffectId);
}

export function isBed(id: SoundId): id is BedId {
  return (BEDS as readonly string[]).includes(id);
}

/** How many takes of a sound there are: footsteps and birds vary, so a walk is not a metronome. */
export function variantsOf(id: SoundId): number {
  if (id.startsWith("step-")) return 4;
  if (/^(hoof|paw)-/.test(id)) return 4;
  if (id.startsWith("gallop-") || id === "wingbeat") return 2;
  if (id.startsWith("amb-bird")) return 3;
  return 1;
}

/**
 * Renders one take of one sound. Deterministic: the same id, variant and calm flag give the same
 * samples on every machine. Calm softens everything (a low-pass, lower level, no sparkle).
 */
export function renderSound(id: SoundId, opts: { calm?: boolean; variant?: number } = {}): { data: Float32Array; rate: number } {
  const calm = opts.calm ?? false;
  const variant = opts.variant ?? 0;
  const r = recipeFor(id);
  const rate = isBed(id) ? BED_RATE : SFX_RATE;
  const tail = r.tail ?? (r.room ? 0.35 * (r.size ?? 1) : 0);
  const total = r.seconds + (r.loop ?? 0) + tail;
  const b = new Builder(rate, total, seedOf(id, variant), calm, variant);
  r.build(b);
  if (r.room) reverb(b.buf, rate, r.room, r.size ?? 1);
  const lowpass = calm ? Math.min(r.lowpass ?? 2600, 2600) : r.lowpass;
  const highpass = r.highpass ?? (r.loop ? 100 : 75);
  if (r.loop) {
    const level = r.level * (calm ? 0.85 : 1);
    finish(b.buf, rate, { level, lowpass, highpass, fadeIn: 0, fadeOut: 0 });
    // The cross-fade can add up a little over the level where the two ends agree: bring it back.
    const data = seamless(b.buf, rate, r.loop);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > level) for (let i = 0; i < data.length; i++) data[i] *= level / peak;
    return { data, rate };
  }
  const data = finish(b.buf, rate, { level: r.level * (calm ? 0.8 : 1), lowpass, highpass, fadeOut: r.fadeOut ?? 0.03 });
  return { data, rate };
}
