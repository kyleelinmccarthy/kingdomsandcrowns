"use client";

/**
 * The island's light by the hour (`lib/realm3d/day-cycle.ts`), for the sun, the sky, the fog, the
 * lanterns and the windows to paint from. The hour is read as the scene opens and once a minute
 * after, so a visit that runs into the evening watches the sun go down; painting it is a handful of
 * assignments a frame and allocates nothing. Rooms keep their own lamplight.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hourFrom, lightAt, localHour, makeDayLight, type DayLight, type Rgb } from "@/lib/realm3d/day-cycle";

/** Every lit window in the village shares this material, so the night lights them all at once. Module-level, so shared by every scene mount; the day-light effect repaints it on each mount. */
export const LIT_WINDOW = new THREE.MeshStandardMaterial({ color: "#ffe9a8", emissive: "#e8bd4a", emissiveIntensity: 0.55, flatShading: true });
/**
 * One colour for all the ground and its scatter (grass, trees, rocks): white by day, blue at night.
 * Their materials point at it (`mat.color = GROUND_TINT`), and the scene paints it once a frame.
 */
export const GROUND_TINT = new THREE.Color(1, 1, 1);
/** The windows' glow by day; `lamp` scales it after dark. */
const WINDOW_GLOW = 0.55;
const EVERY_MS = 60_000;

/** A colour from the table (sRGB) onto a three.js colour, which works in linear. */
export function paintColor(c: THREE.Color, v: Rgb): void {
  c.setRGB(v.r, v.g, v.b, THREE.SRGBColorSpace);
}

function hourNow(timeZone: string | null): number {
  // `?hour=21`, in development only: the night, for a screenshot, without waiting for it.
  const forced = process.env.NODE_ENV !== "production" ? hourFrom(new URLSearchParams(window.location.search).get("hour")) : null;
  return forced ?? localHour(new Date(), timeZone);
}

function lightWindows(l: DayLight): void {
  LIT_WINDOW.emissiveIntensity = WINDOW_GLOW * l.lamp;
}

/** The light now: one object, mutated in place once a minute, stable for the life of the scene. */
export function useDayLight(timeZone: string | null): DayLight {
  const light = useMemo(() => lightAt(hourNow(timeZone), makeDayLight()), [timeZone]);
  useEffect(() => {
    lightWindows(light);
    const id = window.setInterval(() => {
      lightAt(hourNow(timeZone), light);
      lightWindows(light);
    }, EVERY_MS);
    return () => window.clearInterval(id);
  }, [light, timeZone]);
  return light;
}
