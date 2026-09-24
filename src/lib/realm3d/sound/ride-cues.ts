/**
 * WHAT A MOUNT SOUNDS LIKE, as pure rules: which feet it has, how its voice is pitched, which
 * hello it gives, whether it has wings — and the two little clocks that turn the mount's own
 * gait into footfalls and wingbeats, the way `stride.ts` turns the hero's into footsteps.
 *
 * The mount's legs turn over with the ground covered (`riding-scene.tsx`), about seven strides a
 * second at a pony's gallop — far too many to hear one by one. So a footfall waits for the next
 * foot to come down after a short rest: a walk is a clip-clop of single feet, and a gallop is a
 * three-beat "ba-da-DUM" about three times a second, each landing with a foot on screen.
 *
 * No `three`, no allocation, tested.
 */

import { MOUNT_SURFACES, type EffectId, type MountCall, type MountFeet, type MountSurface, type SoundId } from "./recipes";

export type MountVoice = {
  feet: MountFeet;
  /** Playback rate for its feet and its landing: a goat is light and quick, a wyrm heavy. */
  rate: number;
  call: MountCall;
  /** The gryphon and the wyrm: wingbeats when the wings are open. */
  wings: boolean;
};

const VOICES: Readonly<Record<string, MountVoice>> = {
  pony: { feet: "hoof", rate: 1, call: "whinny", wings: false },
  donkey: { feet: "hoof", rate: 1.06, call: "bray", wings: false },
  goat: { feet: "hoof", rate: 1.2, call: "bleat", wings: false },
  stag: { feet: "hoof", rate: 1.1, call: "bugle", wings: false },
  boar: { feet: "paw", rate: 0.92, call: "grunt", wings: false },
  direwolf: { feet: "paw", rate: 1, call: "howl", wings: false },
  gryphon: { feet: "paw", rate: 0.96, call: "trill", wings: true },
  wyrm: { feet: "paw", rate: 0.84, call: "rumble", wings: true },
};

/** A mount's sound, by its catalogue id. Anything unknown sounds like a pony. */
export function mountVoice(id: string | null | undefined): MountVoice {
  return VOICES[id ?? ""] ?? VOICES.pony;
}

/** The footfall for these feet on this ground: a single foot, or a gallop's three beats. */
export function footfallCue(feet: MountFeet, surface: MountSurface, gallop: boolean): EffectId {
  return gallop ? `gallop-${feet}-${surface}` : `${feet}-${surface}`;
}

/** Every sound a rider of this mount may need this visit, for the engine to make ahead (`SoundEngine.want`). */
export function mountSounds(v: MountVoice): SoundId[] {
  const out: SoundId[] = ["mount-up", "mount-summon", `call-${v.call}`];
  for (const s of MOUNT_SURFACES) out.push(`${v.feet}-${s}`);
  for (const s of MOUNT_SURFACES) out.push(`gallop-${v.feet}-${s}`);
  out.push("mount-jump", "mount-land", "mount-down", "travel-start", "travel-arrive", "travel-stop");
  if (v.wings) out.push("wingbeat");
  return out;
}

/** The mount's surfaces are the outdoor three: a hero's `wood` or `stone` never happens on one. */
export function mountSurface(s: string): MountSurface {
  return s === "water" || s === "road" ? s : "grass";
}

/* ------------------------------------------------------------------ the clocks */

export type HoofClock = {
  /** Which half-cycle of the gait the feet were in last frame. */
  half: number;
  /** Seconds since the last footfall. */
  since: number;
  /** Which wing cycle the wings were in last frame. */
  wing: number;
};

export function makeHoofClock(): HoofClock {
  return { half: 0, since: 99, wing: 0 };
}

/** Past this, the mount is galloping: its footfalls are the three-beat pattern. */
export const GALLOP_RUN = 0.5;
/** The least time between two single footfalls, and between two gallop patterns. */
export const WALK_GAP = 0.2;
export const GALLOP_GAP = 0.34;

/** A footfall, and whether it is a gallop's; null for none this frame. */
export type Fall = "walk" | "gallop" | null;

/**
 * One frame of the mount's feet. `phase` is the gait phase (radians, turned by ground covered),
 * `run` 0..1 how far into a gallop it is, `moving` whether the ground went by this frame. A foot
 * comes down at each half-cycle; one is heard when enough time has gone since the last.
 */
export function hoofTick(c: HoofClock, phase: number, run: number, moving: boolean, dt: number): Fall {
  const half = Math.floor(phase / Math.PI);
  const crossed = half !== c.half;
  c.half = half;
  c.since += dt;
  if (!moving || !crossed) return null;
  const gallop = run >= GALLOP_RUN;
  if (c.since < (gallop ? GALLOP_GAP : WALK_GAP)) return null;
  c.since = 0;
  return gallop ? "gallop" : "walk";
}

/** The wings' beat rate (`mount-figure.tsx`: `sin(t · 11)`), and how open they must be to be heard. */
export const WING_RATE = 11;
export const WING_OPEN = 0.5;

/**
 * One frame of the wings: true on each downstroke — the moment `sin(t · 11)` passes its top and
 * the wing starts down — while they are open. `t` is the gait's own clock.
 */
export function wingTick(c: HoofClock, t: number, open: number): boolean {
  const cycle = Math.floor((t * WING_RATE - Math.PI / 2) / (Math.PI * 2));
  const crossed = cycle !== c.wing;
  c.wing = cycle;
  return crossed && open >= WING_OPEN;
}

/** How open the wings are, as `mount-figure.tsx` draws them: in the air, or flat out. */
export function wingsOpen(air: number, run: number): number {
  return Math.min(1, Math.max(air, Math.max(0, run - 0.55) * 1.6));
}
