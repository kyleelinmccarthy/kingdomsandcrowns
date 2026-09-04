import { describe, it, expect } from "vitest";
import { renderSettingsFor } from "./render-settings";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

describe("renderSettingsFor", () => {
  it("keeps motion and the normal palette by default, stick only on touch devices", () => {
    expect(renderSettingsFor(DEFAULT_LEARNING_PROFILE, false)).toEqual({ motion: true, calmPalette: false, showStick: false, hudScale: 1 });
    expect(renderSettingsFor(DEFAULT_LEARNING_PROFILE, true).showStick).toBe(true);
  });
  it("disables motion for reduced motion or low stimulus, calm palette only for low stimulus", () => {
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, reducedMotion: true }, false)).toMatchObject({ motion: false, calmPalette: false });
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, lowStimulus: true }, false)).toMatchObject({ motion: false, calmPalette: true });
  });
  it("honors an explicit input mode over the device", () => {
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" }, false).showStick).toBe(true);
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, inputMode: "keyboard" }, true).showStick).toBe(false);
  });
  it("scales the HUD for larger text", () => {
    expect(renderSettingsFor({ ...DEFAULT_LEARNING_PROFILE, largerText: true }, false).hudScale).toBe(1.25);
  });
});
