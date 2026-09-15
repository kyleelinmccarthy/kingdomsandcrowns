import { NO_OFFSETS, type SubjectOffsets } from "./grade-levels";

export type InputMode = "auto" | "touch" | "keyboard";
const INPUT_MODES: InputMode[] = ["auto", "touch", "keyboard"];

/**
 * What helps this hero learn. Toggles only — a preset is a shortcut that fills
 * these in, never a label that gets stored.
 */
export type LearningProfile = {
  readingFont: boolean;
  largerText: boolean;
  extraSpacing: boolean;
  readAloud: boolean;
  untimed: boolean;
  sessionMinutes: number | null;
  fewerChoices: boolean;
  reducedMotion: boolean;
  lowStimulus: boolean;
  predictableRoutine: boolean;
  soundEnabled: boolean;
  inputMode: InputMode;
  subjectOffsets: SubjectOffsets;
};

export const DEFAULT_LEARNING_PROFILE: LearningProfile = {
  readingFont: false,
  largerText: false,
  extraSpacing: false,
  readAloud: false,
  untimed: false,
  sessionMinutes: null,
  fewerChoices: false,
  reducedMotion: false,
  lowStimulus: false,
  predictableRoutine: false,
  soundEnabled: true,
  inputMode: "auto",
  subjectOffsets: NO_OFFSETS,
};

export const LEARNING_PROFILE_KEYS = Object.keys(DEFAULT_LEARNING_PROFILE) as (keyof LearningProfile)[];

export type LearningPresetId = "reading-support" | "focus-support" | "sensory-routine-support";

export type LearningPreset = {
  id: LearningPresetId;
  label: string;
  description: string;
  toggles: Partial<LearningProfile>;
};

export const LEARNING_PRESETS: LearningPreset[] = [
  {
    id: "reading-support",
    label: "Reading support",
    description: "A clearer font, larger text, more spacing, and read-aloud in the Realm.",
    toggles: { readingFont: true, largerText: true, extraSpacing: true, readAloud: true },
  },
  {
    id: "focus-support",
    label: "Focus support",
    description: "No timers, fewer choices, a steady routine, and a break every 15 minutes.",
    toggles: { untimed: true, fewerChoices: true, predictableRoutine: true, sessionMinutes: 15 },
  },
  {
    id: "sensory-routine-support",
    label: "Sensory & routine support",
    description: "Calm visuals, no sudden motion, sound off, and a predictable order of play.",
    toggles: { reducedMotion: true, lowStimulus: true, predictableRoutine: true, soundEnabled: false },
  },
];

export function applyPreset(current: LearningProfile, presetId: string): LearningProfile {
  const preset = LEARNING_PRESETS.find((p) => p.id === presetId);
  return preset ? { ...current, ...preset.toggles } : current;
}

const SESSION_MIN = 5;
const SESSION_MAX = 120;

function isSessionMinutes(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= SESSION_MIN && v <= SESSION_MAX;
}

/** A corrupt or fractional stored value falls back to grade level rather than reaching the engine. */
function offset(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) ? v : 0;
}

/**
 * A DB row: most columns line up 1:1 with `LearningProfile`, but the four subject offsets
 * are stored flat (`mathOffset`, ...) rather than nested under `subjectOffsets`.
 */
type LearningProfileRow = Partial<Record<keyof LearningProfile, unknown>> & {
  mathOffset?: unknown;
  readingOffset?: unknown;
  languageOffset?: unknown;
  scienceOffset?: unknown;
};

/** Tolerant read from a DB row: missing or malformed columns fall back to defaults. */
export function profileFromRow(row: LearningProfileRow | null | undefined): LearningProfile {
  if (!row) return { ...DEFAULT_LEARNING_PROFILE };
  const out: LearningProfile = { ...DEFAULT_LEARNING_PROFILE };
  for (const key of LEARNING_PROFILE_KEYS) {
    if (key === "subjectOffsets") continue;
    const v = row[key];
    if (key === "sessionMinutes") {
      out.sessionMinutes = isSessionMinutes(v) ? v : null;
    } else if (key === "inputMode") {
      out.inputMode = INPUT_MODES.includes(v as InputMode) ? (v as InputMode) : "auto";
    } else if (typeof v === "boolean") {
      out[key] = v;
    }
  }
  out.subjectOffsets = {
    math: offset(row.mathOffset),
    reading: offset(row.readingOffset),
    language: offset(row.languageOffset),
    science: offset(row.scienceOffset),
  };
  return out;
}

/** Strict read from a client: anything unexpected is an error, not a default. */
export function validateProfilePatch(patch: unknown): Partial<LearningProfile> {
  if (!patch || typeof patch !== "object") throw new Error("Nothing to change.");
  const out: Partial<LearningProfile> = {};
  for (const [key, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!LEARNING_PROFILE_KEYS.includes(key as keyof LearningProfile)) {
      throw new Error(`Unknown learning setting: ${key}`);
    }
    if (key === "sessionMinutes") {
      if (v !== null && !isSessionMinutes(v)) {
        throw new Error(`Break length must be between ${SESSION_MIN} and ${SESSION_MAX} minutes.`);
      }
      out.sessionMinutes = v as number | null;
    } else if (key === "inputMode") {
      if (!INPUT_MODES.includes(v as InputMode)) throw new Error("Choose touch, keyboard, or auto.");
      out.inputMode = v as InputMode;
    } else if (key === "subjectOffsets") {
      throw new Error("Subject levels are set individually.");
    } else {
      if (typeof v !== "boolean") throw new Error(`${key} must be on or off.`);
      out[key as Exclude<keyof LearningProfile, "sessionMinutes" | "inputMode" | "subjectOffsets">] = v;
    }
  }
  return out;
}

/** Data attributes the app shell sets so CSS can restyle text for this hero. */
export function readingAttributes(profile: LearningProfile): Record<string, "on"> {
  const attrs: Record<string, "on"> = {};
  if (profile.readingFont) attrs["data-reading-font"] = "on";
  if (profile.largerText) attrs["data-larger-text"] = "on";
  if (profile.extraSpacing) attrs["data-extra-spacing"] = "on";
  return attrs;
}
