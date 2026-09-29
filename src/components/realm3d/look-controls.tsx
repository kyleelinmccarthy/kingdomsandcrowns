"use client";

/**
 * THE MOUSE, in the pause menu: how fast looking around turns the camera, and whether pushing the
 * mouse up looks up or down. Kept on this computer (`look-settings.ts`), handed to the scene on the
 * bus (`bus.setLook`) from the moment the game opens, so the settings are live before any menu is.
 */

import { useCallback, useEffect, useState } from "react";
import type { HudBus, LookSettings } from "@/lib/realm3d/hud-bus";
import { LOOK_KEY, LOOK_SPEED, readLook } from "@/lib/realm3d/look-settings";
import { deviceStorage } from "@/lib/utils/device-storage";
import { Slider } from "./realm-sound";

function kept(): LookSettings {
  try {
    return readLook(deviceStorage()?.getItem(LOOK_KEY) ?? null);
  } catch {
    return readLook(null);
  }
}

function keep(look: LookSettings): void {
  try {
    deviceStorage()?.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // A full or blocked store: the setting still holds for this visit.
  }
}

/** The settings, live on the bus and kept on the computer — written only when someone changes one. */
export function useLook(bus: HudBus): { look: LookSettings; change: (next: Partial<LookSettings>) => void } {
  const [look, setLook] = useState(kept);
  useEffect(() => {
    bus.setLook(look);
  }, [bus, look]);
  const change = useCallback(
    (next: Partial<LookSettings>) => {
      const merged = { ...look, ...next };
      setLook(merged);
      keep(merged);
    },
    [look],
  );
  return { look, change };
}

/** Beside the Sound section: the look speed, in percent of the scene's own, and Invert up/down. */
export function LookControls({ look, onChange }: { look: LookSettings; onChange: (next: Partial<LookSettings>) => void }) {
  return (
    <div className="r3-settings r3-look">
      <p className="r3-settings-title">Mouse</p>
      <Slider
        label="Look speed"
        value={Math.round(look.sensitivity * 100)}
        min={LOOK_SPEED.min * 100}
        max={LOOK_SPEED.max * 100}
        step={LOOK_SPEED.step * 100}
        onChange={(v) => onChange({ sensitivity: v / 100 })}
      />
      <div className="r3-setting">
        <span className="r3-setting-name">Invert up/down</span>
        <span className="r3-toggle" role="group" aria-label="Invert up/down">
          <button type="button" aria-pressed={!look.invertY} onClick={() => onChange({ invertY: false })}>
            Off
          </button>
          <button type="button" aria-pressed={look.invertY} onClick={() => onChange({ invertY: true })}>
            On
          </button>
        </span>
      </div>
    </div>
  );
}
