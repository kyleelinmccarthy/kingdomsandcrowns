/**
 * HOW THE MOUSE LOOKS AROUND: its speed and whether up is up. Kept on the computer, not with a
 * hero, because they belong to the mouse in front of it. The pause menu writes them; the scene
 * reads them off the bus (`HudBus.look`) every time the mouse moves.
 */

import type { LookSettings } from "./hud-bus";

/** The device's storage key. One per computer: Emma and Noah at the same desk share one mouse. */
export const LOOK_KEY = "realm3d:look";

/** The look speed, as a multiple of the scene's own: a quarter as fast up to three times, on quarter steps. */
export const LOOK_SPEED = { min: 0.25, max: 3, step: 0.25 } as const;

export const DEFAULT_LOOK: LookSettings = { sensitivity: 1, invertY: false };

/** What this computer kept, made safe: anything unreadable, out of range or between steps comes back valid. */
export function readLook(raw: string | null): LookSettings {
  let kept: unknown = null;
  try {
    kept = raw === null ? null : JSON.parse(raw);
  } catch {
    kept = null;
  }
  if (!kept || typeof kept !== "object" || Array.isArray(kept)) return { ...DEFAULT_LOOK };
  const { sensitivity, invertY } = kept as Record<string, unknown>;
  return {
    sensitivity: typeof sensitivity === "number" && Number.isFinite(sensitivity) ? onStep(sensitivity) : DEFAULT_LOOK.sensitivity,
    invertY: typeof invertY === "boolean" ? invertY : DEFAULT_LOOK.invertY,
  };
}

function onStep(n: number): number {
  const stepped = Math.round(n / LOOK_SPEED.step) * LOOK_SPEED.step;
  return Math.min(LOOK_SPEED.max, Math.max(LOOK_SPEED.min, stepped));
}
