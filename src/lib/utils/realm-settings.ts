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
  /** Questions in a side quest (`SIDE_QUEST_LENGTH_RANGE`). */
  sideQuestLength: number;
  /** Whether a wrong first answer earns a hint and one more try. */
  secondChances: boolean;
  /** Free minutes a day, granted when the day opens (`ALLOWANCE_RANGE`); 0 turns the allowance off. */
  dailyAllowanceMinutes: number;
  /** Minutes one side-quest star pays (`MINUTES_PER_STAR_RANGE`); 0 turns practice pay off. */
  minutesPerStar: number;
  /** The most minutes a day side quests may pay (`SIDE_QUEST_PAY_CAP_RANGE`). */
  sideQuestDailyCapMinutes: number;
  /** The most minutes a day may carry into the next one (`BANK_CAP_RANGE`); 0 means nothing carries. */
  bankCapMinutes: number;
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
  sideQuestLength: 8,
  secondChances: true,
  dailyAllowanceMinutes: 10,
  minutesPerStar: 1,
  sideQuestDailyCapMinutes: 15,
  bankCapMinutes: 30,
};

const ACCESS_MODES: RealmAccessMode[] = ["earned", "scheduled", "both", "open"];
const TONES: ToneMode[] = ["gentle", "monsters"];
export const EARNED_MINUTES_RANGE = { min: 0, max: 60 } as const;
export const DAILY_CAP_RANGE = { min: 5, max: 240 } as const;
export const TROUBLE_BONUS_RANGE = { min: 0, max: 30 } as const;
export const SIDE_QUEST_LENGTH_RANGE = { min: 4, max: 12 } as const;
export const ALLOWANCE_RANGE = { min: 0, max: 60 } as const;
export const MINUTES_PER_STAR_RANGE = { min: 0, max: 5 } as const;
export const SIDE_QUEST_PAY_CAP_RANGE = { min: 0, max: 120 } as const;
export const BANK_CAP_RANGE = { min: 0, max: 240 } as const;

function inRange(v: unknown, r: { min: number; max: number }): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max;
}

// The upper bound is the ladders' own length, never a literal. A fifth step added to the flat
// `TUTORIAL_STEPS` used to make this reject a stored 5 and silently reset an advanced child
// to step 0, while the shell's Skip — which writes the ladder's length fire-and-forget — threw
// server-side into a `.catch(() => {})` and a grown-up's Skip came back next visit. The 3D
// Realm's lessons are stored above the flat ones, so the bound is theirs: `STORED_MAX`.
const isTutorialStep = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= STORED_MAX;

/**
 * Reading is kinder than writing: a whole number above `STORED_MAX` was written by a build with
 * a longer ladder (a rollback, or a tab left open across a deploy), so it means "finished" and is
 * clamped to this build's end. Reading it as 0 sent a finished child back to lesson 1, and their
 * next lesson then overwrote the finished value for good. Anything that is not a whole number
 * at or above 0 is corrupt and starts over.
 */
function storedTutorialStep(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return DEFAULT_REALM_SETTINGS.tutorialStep;
  return Math.min(v, STORED_MAX);
}

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
    tutorialStep: storedTutorialStep(row.tutorialStep),
    troubleBonusCapMinutes: inRange(row.troubleBonusCapMinutes, TROUBLE_BONUS_RANGE)
      ? row.troubleBonusCapMinutes
      : DEFAULT_REALM_SETTINGS.troubleBonusCapMinutes,
    sideQuestLength: inRange(row.sideQuestLength, SIDE_QUEST_LENGTH_RANGE) ? row.sideQuestLength : DEFAULT_REALM_SETTINGS.sideQuestLength,
    secondChances: typeof row.secondChances === "boolean" ? row.secondChances : DEFAULT_REALM_SETTINGS.secondChances,
    dailyAllowanceMinutes: inRange(row.dailyAllowanceMinutes, ALLOWANCE_RANGE) ? row.dailyAllowanceMinutes : DEFAULT_REALM_SETTINGS.dailyAllowanceMinutes,
    minutesPerStar: inRange(row.minutesPerStar, MINUTES_PER_STAR_RANGE) ? row.minutesPerStar : DEFAULT_REALM_SETTINGS.minutesPerStar,
    sideQuestDailyCapMinutes: inRange(row.sideQuestDailyCapMinutes, SIDE_QUEST_PAY_CAP_RANGE)
      ? row.sideQuestDailyCapMinutes
      : DEFAULT_REALM_SETTINGS.sideQuestDailyCapMinutes,
    bankCapMinutes: inRange(row.bankCapMinutes, BANK_CAP_RANGE) ? row.bankCapMinutes : DEFAULT_REALM_SETTINGS.bankCapMinutes,
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
      case "secondChances":
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
      case "sideQuestLength":
        if (!inRange(v, SIDE_QUEST_LENGTH_RANGE)) throw new Error(`Side quests must be ${SIDE_QUEST_LENGTH_RANGE.min}–${SIDE_QUEST_LENGTH_RANGE.max} questions.`);
        out.sideQuestLength = v;
        break;
      case "dailyAllowanceMinutes":
        if (!inRange(v, ALLOWANCE_RANGE)) throw new Error(`Free minutes must be ${ALLOWANCE_RANGE.min}–${ALLOWANCE_RANGE.max} a day.`);
        out.dailyAllowanceMinutes = v;
        break;
      case "minutesPerStar":
        if (!inRange(v, MINUTES_PER_STAR_RANGE)) throw new Error(`Minutes per star must be ${MINUTES_PER_STAR_RANGE.min}–${MINUTES_PER_STAR_RANGE.max}.`);
        out.minutesPerStar = v;
        break;
      case "sideQuestDailyCapMinutes":
        if (!inRange(v, SIDE_QUEST_PAY_CAP_RANGE)) throw new Error(`Side-quest minutes must be ${SIDE_QUEST_PAY_CAP_RANGE.min}–${SIDE_QUEST_PAY_CAP_RANGE.max} a day.`);
        out.sideQuestDailyCapMinutes = v;
        break;
      case "bankCapMinutes":
        if (!inRange(v, BANK_CAP_RANGE)) throw new Error(`The saved-minutes bank must be ${BANK_CAP_RANGE.min}–${BANK_CAP_RANGE.max} minutes.`);
        out.bankCapMinutes = v;
        break;
      default:
        throw new Error(`Unknown Realm setting: ${key}`);
    }
  }
  return out;
}
