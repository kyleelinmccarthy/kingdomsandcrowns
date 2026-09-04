import type { LearningProfile } from "@/lib/utils/learning-profile";

export type RenderSettings = {
  motion: boolean;      // idle bob, sparkle, camera easing
  calmPalette: boolean; // muted ground and sky, no day-night shift
  showStick: boolean;   // on-screen joystick
  hudScale: number;     // 1 or 1.25
};

/** The learning profile decides how the world moves and looks; nothing here is a preference the hero toggles in-game. */
export function renderSettingsFor(profile: LearningProfile, isTouchDevice: boolean): RenderSettings {
  return {
    motion: !(profile.reducedMotion || profile.lowStimulus),
    calmPalette: profile.lowStimulus,
    showStick: profile.inputMode === "touch" || (profile.inputMode === "auto" && isTouchDevice),
    hudScale: profile.largerText ? 1.25 : 1,
  };
}
