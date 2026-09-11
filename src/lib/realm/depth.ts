import type { LearningProfile } from "@/lib/utils/learning-profile";

export type RealmDepth = "simple" | "full";
export type DepthOverride = "auto" | "simple" | "full";
export const DEPTH_OVERRIDES: DepthOverride[] = ["auto", "simple", "full"];
export const DEFAULT_DEPTH_OVERRIDE: DepthOverride = "auto";

/**
 * What each surface shows. This is the **whole** contract: every field any of the thirteen
 * slices reads is declared here, once, in one vocabulary. No later spec adds a field, and no
 * later spec invents a local rule. A slice that wants a new surface amends this type and this
 * table in slice 1's spec first.
 */
export type Surfaces = {
  /** false → pips (●●○○○), true → numerals. One vocabulary for progress, mana, signs and laps. */
  numerals: boolean;
  /** How many objectives the card tracks at once. Capped at 1 by `fewerChoices` at both depths. */
  trackedObjectives: number;
  /** Which spell pages the ability bar contains. */
  abilitySlots: "earned" | "all";
  /** Whether number keycaps are drawn on the ability bar's slots. */
  keycapHints: boolean;
  /** Rows a list shows before it collapses the rest behind "and N more". Capped at 3 by `fewerChoices`. */
  listRows: number;
  /** false → a district announces its name alone; true → its name and what stands in it. */
  districtDetail: boolean;
  /** Whether the hitching-post sheet offers every unlocked district or only the objective's. */
  fastTravel: boolean;
  /** false → a trouble's plate is the ⚠ glyph; true → it carries the name from TROUBLE_COPY. */
  troubleNames: boolean;
  /** Per-trouble detail: the companion's trouble break-off, the plate's second line. */
  troubleDetail: boolean;
  /** The damage pip row on a plate for kinds with maxHits > 1. */
  troubleHitPips: boolean;
  /** The running `Cleared 4` chip on the ability bar's status row. */
  clearCount: boolean;
  /** Whether the clock's accessible text names bonus minutes as a separate source. */
  bountyLedgerLine: boolean;
  /** Whether lap times are shown as times rather than as "a new best". */
  lapTimes: boolean;
};

const SIMPLE: Surfaces = {
  numerals: false,
  trackedObjectives: 1,
  abilitySlots: "earned",
  keycapHints: false,
  listRows: 3,
  districtDetail: false,
  fastTravel: false,
  troubleNames: false,
  troubleDetail: false,
  troubleHitPips: false,
  clearCount: false,
  bountyLedgerLine: false,
  lapTimes: false,
};

const FULL: Surfaces = {
  numerals: true,
  trackedObjectives: 3,
  abilitySlots: "all",
  keycapHints: true,
  listRows: 8,
  districtDetail: true,
  fastTravel: true,
  troubleNames: true,
  troubleDetail: true,
  troubleHitPips: true,
  clearCount: true,
  bountyLedgerLine: true,
  lapTimes: true,
};

export function isDepthOverride(value: unknown): value is DepthOverride {
  return typeof value === "string" && DEPTH_OVERRIDES.includes(value as DepthOverride);
}

/** `auto` follows the tutorial; an explicit override always wins. */
export function realmDepth(input: { tutorialComplete: boolean; override: DepthOverride }): RealmDepth {
  if (input.override !== "auto") return input.override;
  return input.tutorialComplete ? "full" : "simple";
}

/**
 * The surfaces for a depth, with the profile's caps applied. `fewerChoices` caps
 * `trackedObjectives` at 1, `abilitySlots` at "earned" and `listRows` at 3 at **both** depths —
 * this is the only place that rule is written, and no consumer re-implements it. Every simple
 * surface is a substitution, never a removal: pips replace numerals, one tracked objective
 * replaces three, earned slots replace all slots.
 */
export function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces {
  const out: Surfaces = { ...(depth === "simple" ? SIMPLE : FULL) };
  if (profile.fewerChoices) {
    out.trackedObjectives = Math.min(out.trackedObjectives, 1);
    out.abilitySlots = "earned";
    out.listRows = Math.min(out.listRows, 3);
  }
  return out;
}
