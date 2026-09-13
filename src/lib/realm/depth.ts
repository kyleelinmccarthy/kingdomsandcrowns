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
  /**
   * Which spell pages the ability bar contains — the pages a hero has earned, or every page.
   * A membership rule, not a count: `spell-bar.tsx` keeps its own four-page cap (see
   * `surfacesFor` below). No consumer reads this field yet.
   */
  abilitySlots: "earned" | "all";
  /**
   * How much the minimap draws. "full" is bounds, hero and every site; "objectiveOnly" is
   * bounds, hero and the objective alone. Capped at "objectiveOnly" by `fewerChoices` at both
   * depths — a substitution, never a removal: the child keeps a map.
   *
   * `minimapView` also draws every trouble under "full", and this doc used to say so — but the
   * shell passes `troubles: []` unconditionally (parked, with a reason, in the slice that made
   * the map), so no child has ever seen a trouble dot. The code stays, ready for the slice that
   * feeds it; the sentence a reader trusts should not describe a thing that is not on screen.
   */
  minimap: "full" | "objectiveOnly";
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
  minimap: "full",
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
  minimap: "full",
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
 * `trackedObjectives` at 1, `abilitySlots` at "earned", `listRows` at 3 and `minimap` at
 * "objectiveOnly" at **both** depths.
 *
 * This is the only place those four caps are written — with one named exception, so the claim
 * stays true: `spell-bar.tsx` is handed the raw `fewerChoices` and applies its own `FEWER = 4`
 * page cap. That is a COUNT of pages shown; `abilitySlots` is a MEMBERSHIP (earned pages, or
 * all of them), and the bar pads with empty pages, which "earned" would forbid. The two are
 * therefore not the same rule, and `abilitySlots` still has no consumer.
 *
 * Most simple surfaces are substitutions rather than removals: pips replace numerals, one
 * tracked objective replaces three, earned slots replace all slots, the ⚠ glyph replaces a
 * trouble's name. Four are removals with no substitute named — `keycapHints`, `troubleDetail`,
 * `troubleHitPips` and `clearCount`. None of the four has a consumer yet; the slice that ships
 * one owes it either a substitute or a reason it needs none.
 */
export function surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces {
  const out: Surfaces = { ...(depth === "simple" ? SIMPLE : FULL) };
  if (profile.fewerChoices) {
    out.trackedObjectives = Math.min(out.trackedObjectives, 1);
    out.abilitySlots = "earned";
    out.listRows = Math.min(out.listRows, 3);
    out.minimap = "objectiveOnly";
  }
  return out;
}
