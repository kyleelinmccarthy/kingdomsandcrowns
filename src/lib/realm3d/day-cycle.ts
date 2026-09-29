/**
 * DAY AND NIGHT — the hour where the family lives, and the light the island gets at that hour.
 *
 * The owner: "make sure its aware of day/night cycles based on the players timezone". The family's
 * saved timezone (`family.timezone`) says where they live; this computer's own is the fallback, and
 * a zone that is not one is no zone. The light is a small table of moments — night, dawn, day, dusk
 * — blended between, so an evening visit reddens as the clock runs rather than switching. Night is
 * moonlit and stays playable: a child must always see themselves and a villager (`NIGHT_FLOOR`).
 *
 * Pure and `three`-free; the scene paints it (`components/realm3d/day-light.tsx`). Colours are
 * sRGB, 0..1. Nothing here allocates once the module has loaded.
 */

export type Rgb = { r: number; g: number; b: number };
export type Vec3 = { x: number; y: number; z: number };

export type DayLight = {
  /** Toward the sun (or the moon), unit length: the key light and its shadows come from here. */
  sunDir: Vec3;
  sun: Rgb;
  sunI: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiI: number;
  ambientI: number;
  skyTop: Rgb;
  skyLow: Rgb;
  fog: Rgb;
  /** Multiplies the ground and the foliage: white by day, blue at night, so the grass reads moonlit and not green. */
  groundTint: Rgb;
  /** Lamps and lit windows: 1 by day, brighter after dark. */
  lamp: number;
};

type Moment = {
  at: number;
  dir: readonly [number, number, number];
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  ambientI: number;
  skyTop: string;
  skyLow: string;
  fog: string;
  groundTint: string;
  lamp: number;
};

/**
 * Noon is the approved shot, unchanged: the spike's sun, low on purpose and raking from behind, so
 * the shadows stay long enough to read the hills; its colours and strengths are the ones it shipped.
 */
const DAY = { dir: [0.58, 0.44, -0.52], sun: "#fff3d2", sunI: 3.1, hemiSky: "#cfe4ff", hemiGround: "#3f5c1c", hemiI: 0.62, ambientI: 0.1, skyTop: "#2c6fb8", skyLow: "#d8e9ec", fog: "#bcdcec", groundTint: "#ffffff", lamp: 1 } as const;
/** A clear moonlit night: blue, soft, and bright enough to play in. */
const NIGHT = { dir: [-0.42, 0.62, -0.5], sun: "#7aa2ff", sunI: 1.25, hemiSky: "#4d6fe6", hemiGround: "#1a2a5c", hemiI: 0.95, ambientI: 0.45, skyTop: "#0a1a4a", skyLow: "#2a4a9a", fog: "#1f3a78", groundTint: "#a0b4ff", lamp: 2.4 } as const;

/** The day, hour by hour: in order, and round midnight the last blends into the first. */
export const MOMENTS: readonly Moment[] = [
  { at: 5, ...NIGHT },
  { at: 6.25, dir: [0.9, 0.2, -0.3], sun: "#ffb27a", sunI: 1.7, hemiSky: "#f3c6a8", hemiGround: "#3a3f2a", hemiI: 0.52, ambientI: 0.14, skyTop: "#5a6fa8", skyLow: "#f5b98a", fog: "#e0b9a0", groundTint: "#ffffff", lamp: 1.6 },
  { at: 8, ...DAY },
  { at: 17, ...DAY },
  { at: 18.75, dir: [-0.9, 0.2, -0.3], sun: "#ff9a5c", sunI: 1.6, hemiSky: "#e8a88f", hemiGround: "#3a3526", hemiI: 0.5, ambientI: 0.14, skyTop: "#4a4f8f", skyLow: "#f39a6b", fog: "#d9a38c", groundTint: "#ffffff", lamp: 1.8 },
  { at: 20.5, ...NIGHT },
];

/** Night is never darker than this share of noon (`brightness`): the floor that keeps it playable. */
export const NIGHT_FLOOR = 0.35;

/** The lit ground (light x the tint's linear luminance) is never darker than this share of noon's: between the old white-tint night (0.61) and the too-dark blue one (0.17). */
export const GROUND_FLOOR = 0.3;

type Parsed = Omit<Moment, "dir" | "sun" | "hemiSky" | "hemiGround" | "skyTop" | "skyLow" | "fog" | "groundTint"> & {
  dir: Vec3;
  sun: Rgb;
  hemiSky: Rgb;
  hemiGround: Rgb;
  skyTop: Rgb;
  skyLow: Rgb;
  fog: Rgb;
  groundTint: Rgb;
};

const rgb = (hex: string): Rgb => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 });

const PARSED: readonly Parsed[] = MOMENTS.map((m) => ({
  ...m,
  dir: { x: m.dir[0], y: m.dir[1], z: m.dir[2] },
  sun: rgb(m.sun),
  hemiSky: rgb(m.hemiSky),
  hemiGround: rgb(m.hemiGround),
  skyTop: rgb(m.skyTop),
  skyLow: rgb(m.skyLow),
  fog: rgb(m.fog),
  groundTint: rgb(m.groundTint),
}));

const black = (): Rgb => ({ r: 0, g: 0, b: 0 });

export function makeDayLight(): DayLight {
  return { sunDir: { x: 0, y: 1, z: 0 }, sun: black(), sunI: 0, hemiSky: black(), hemiGround: black(), hemiI: 0, ambientI: 0, skyTop: black(), skyLow: black(), fog: black(), groundTint: { r: 1, g: 1, b: 1 }, lamp: 1 };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixRgb(out: Rgb, a: Rgb, b: Rgb, t: number): void {
  out.r = mix(a.r, b.r, t);
  out.g = mix(a.g, b.g, t);
  out.b = mix(a.b, b.b, t);
}

/** The light at `hour` (0..24, any real number wraps), written into `out`. */
export function lightAt(hour: number, out: DayLight): DayLight {
  const h = ((hour % 24) + 24) % 24;
  let i = PARSED.length - 1;
  for (let k = 0; k < PARSED.length; k++) if (PARSED[k].at <= h) i = k;
  const a = PARSED[i];
  const b = PARSED[(i + 1) % PARSED.length];
  const span = (b.at - a.at + 24) % 24 || 24;
  const u = ((h - a.at + 24) % 24) / span;
  // Eased, so no moment is a corner.
  const t = u * u * (3 - 2 * u);
  const x = mix(a.dir.x, b.dir.x, t);
  const y = mix(a.dir.y, b.dir.y, t);
  const z = mix(a.dir.z, b.dir.z, t);
  const len = Math.hypot(x, y, z) || 1;
  out.sunDir.x = x / len;
  out.sunDir.y = y / len;
  out.sunDir.z = z / len;
  mixRgb(out.sun, a.sun, b.sun, t);
  out.sunI = mix(a.sunI, b.sunI, t);
  mixRgb(out.hemiSky, a.hemiSky, b.hemiSky, t);
  mixRgb(out.hemiGround, a.hemiGround, b.hemiGround, t);
  out.hemiI = mix(a.hemiI, b.hemiI, t);
  out.ambientI = mix(a.ambientI, b.ambientI, t);
  mixRgb(out.skyTop, a.skyTop, b.skyTop, t);
  mixRgb(out.skyLow, a.skyLow, b.skyLow, t);
  mixRgb(out.fog, a.fog, b.fog, t);
  mixRgb(out.groundTint, a.groundTint, b.groundTint, t);
  out.lamp = mix(a.lamp, b.lamp, t);
  return out;
}

/** How much light there is to see by, as one number: the key light, the sky's and the fill. */
export function brightness(l: DayLight): number {
  return l.sunI + l.hemiI + l.ambientI;
}

function hourIn(now: Date, zone: string | undefined): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
    let h = 0;
    let m = 0;
    for (const p of parts) {
      if (p.type === "hour") h = Number(p.value);
      else if (p.type === "minute") m = Number(p.value);
    }
    return (h % 24) + m / 60;
  } catch {
    return null;
  }
}

/** The hour, with minutes as a fraction, in `timeZone`; this computer's own when there is none or it is not a zone. */
export function localHour(now: Date, timeZone: string | null | undefined): number {
  return (timeZone ? hourIn(now, timeZone) : null) ?? hourIn(now, undefined) ?? 12;
}

/** `?hour=21` for a screenshot: a real hour, 0 up to (not including) 24, or null. */
export function hourFrom(query: string | null): number | null {
  if (query === null || query.trim() === "") return null;
  const h = Number(query);
  return Number.isFinite(h) && h >= 0 && h < 24 ? h : null;
}
