import type { RealmAccessMode } from "./realm-access";
import { DEFAULT_DEPTH_OVERRIDE, isDepthOverride, type DepthOverride } from "@/lib/realm/depth";
import { STORED_MAX } from "@/lib/realm3d/tutorial";

export type ToneMode = "gentle" | "monsters";

export type RealmSettings = {
  enabled: boolean;
  accessMode: RealmAccessMode;
  earnedMinutesPerQuest: number;
  offHoursEnabled: boolean;
  dailyCapMinutes: number;
  toneMode: ToneMode;
  /** How much the Realm shows. A hero may set their own — it changes presentation, never access. */
  depthOverride: DepthOverride;
  /**
   * Tutorial progress, 0 through `STORED_MAX`: the flat Realm's 0..4, and above them the 3D
   * Realm's lessons (see `lib/realm3d/tutorial.ts` for why they are stored offset).
   */
  tutorialStep: number;
  /** The most minutes a day clearing troubles may earn; 0 turns the bounty off (`lib/realm/spells/bounty.ts`). */
  troubleBonusCapMinutes: number;
};

export const DEFAULT_REALM_SETTINGS: RealmSettings = {
  enabled: true,
  accessMode: "earned",
  earnedMinutesPerQuest: 5,
  offHoursEnabled: false,
  dailyCapMinutes: 30,
  toneMode: "gentle",
  depthOverride: DEFAULT_DEPTH_OVERRIDE,
  tutorialStep: 0,
  troubleBonusCapMinutes: 5,
};

const ACCESS_MODES: RealmAccessMode[] = ["earned", "scheduled", "both", "open"];
const TONES: ToneMode[] = ["gentle", "monsters"];
export const EARNED_MINUTES_RANGE = { min: 0, max: 60 } as const;
export const DAILY_CAP_RANGE = { min: 5, max: 240 } as const;
export const TROUBLE_BONUS_RANGE = { min: 0, max: 30 } as const;

function inRange(v: unknown, r: { min: number; max: number }): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max;
}

// The upper bound is the ladders' own length, never a literal. A fifth step added to the flat
// `TUTORIAL_STEPS` used to make this reject a stored 5 and silently reset an advanced child
// to step 0, while the shell's Skip — which writes the ladder's length fire-and-forget — threw
// server-side into a `.catch(() => {})` and a grown-up's Skip came back next visit. The 3D
// Realm's lessons are stored above the flat ones, so the bound is theirs: `STORED_MAX`.
const isTutorialStep = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= STORED_MAX;

export function settingsFromRow(row: Partial<Record<keyof RealmSettings, unknown>> | null | undefined): RealmSettings {
  if (!row) return { ...DEFAULT_REALM_SETTINGS };
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : DEFAULT_REALM_SETTINGS.enabled,
    accessMode: ACCESS_MODES.includes(row.accessMode as RealmAccessMode) ? (row.accessMode as RealmAccessMode) : DEFAULT_REALM_SETTINGS.accessMode,
    earnedMinutesPerQuest: inRange(row.earnedMinutesPerQuest, EARNED_MINUTES_RANGE) ? row.earnedMinutesPerQuest : DEFAULT_REALM_SETTINGS.earnedMinutesPerQuest,
    offHoursEnabled: typeof row.offHoursEnabled === "boolean" ? row.offHoursEnabled : DEFAULT_REALM_SETTINGS.offHoursEnabled,
    dailyCapMinutes: inRange(row.dailyCapMinutes, DAILY_CAP_RANGE) ? row.dailyCapMinutes : DEFAULT_REALM_SETTINGS.dailyCapMinutes,
    toneMode: TONES.includes(row.toneMode as ToneMode) ? (row.toneMode as ToneMode) : DEFAULT_REALM_SETTINGS.toneMode,
    depthOverride: isDepthOverride(row.depthOverride) ? row.depthOverride : DEFAULT_REALM_SETTINGS.depthOverride,
    tutorialStep: isTutorialStep(row.tutorialStep) ? row.tutorialStep : DEFAULT_REALM_SETTINGS.tutorialStep,
    troubleBonusCapMinutes: inRange(row.troubleBonusCapMinutes, TROUBLE_BONUS_RANGE)
      ? row.troubleBonusCapMinutes
      : DEFAULT_REALM_SETTINGS.troubleBonusCapMinutes,
  };
}

/** Strict: a grown-up's form must send exactly what the schema allows. */
export function validateRealmSettingsPatch(patch: unknown): Partial<RealmSettings> {
  if (!patch || typeof patch !== "object") throw new Error("Nothing to change.");
  const out: Partial<RealmSettings> = {};
  for (const [key, v] of Object.entries(patch as Record<string, unknown>)) {
    switch (key) {
      case "enabled":
      case "offHoursEnabled":
        if (typeof v !== "boolean") throw new Error(`${key} must be on or off.`);
        out[key] = v;
        break;
      case "accessMode":
        if (!ACCESS_MODES.includes(v as RealmAccessMode)) throw new Error("Choose earned, scheduled, both, or open.");
        out.accessMode = v as RealmAccessMode;
        break;
      case "toneMode":
        if (!TONES.includes(v as ToneMode)) throw new Error("Choose gentle or monsters.");
        out.toneMode = v as ToneMode;
        break;
      case "depthOverride":
        if (!isDepthOverride(v)) throw new Error("Choose automatic, simple, or everything.");
        out.depthOverride = v;
        break;
      case "tutorialStep":
        if (!isTutorialStep(v)) throw new Error("That tutorial step doesn't look right.");
        out.tutorialStep = v;
        break;
      case "earnedMinutesPerQuest":
        if (!inRange(v, EARNED_MINUTES_RANGE)) throw new Error(`Minutes per quest must be ${EARNED_MINUTES_RANGE.min}–${EARNED_MINUTES_RANGE.max}.`);
        out.earnedMinutesPerQuest = v;
        break;
      case "dailyCapMinutes":
        if (!inRange(v, DAILY_CAP_RANGE)) throw new Error(`The daily cap must be ${DAILY_CAP_RANGE.min}–${DAILY_CAP_RANGE.max} minutes.`);
        out.dailyCapMinutes = v;
        break;
      case "troubleBonusCapMinutes":
        if (!inRange(v, TROUBLE_BONUS_RANGE)) throw new Error(`Minutes from clearing troubles must be ${TROUBLE_BONUS_RANGE.min}–${TROUBLE_BONUS_RANGE.max} a day.`);
        out.troubleBonusCapMinutes = v;
        break;
      default:
        throw new Error(`Unknown Realm setting: ${key}`);
    }
  }
  return out;
}
