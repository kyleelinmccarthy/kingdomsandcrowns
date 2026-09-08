import { compareGrades } from "./age-mode";
import { crownById, crownForOrdinal, type CrownTier } from "./crown-catalog";

export type SeasonRecord = {
  id: string;
  grade: string;
  ordinal: number;
  startDate: string;
  endDate: string | null;
  crownId: string | null;
};

export type SeasonLike = Pick<SeasonRecord, "id" | "grade" | "ordinal" | "startDate">;

export type TransitionInput = {
  openSeason: SeasonLike | null;
  /** Most recently completed season, if any. */
  previousCompleted: SeasonLike | null;
  /** Any activity_log row dated inside the open season. */
  openSeasonHasActivity: boolean;
  /** null when the grade is being cleared. */
  newGrade: string | null;
  today: string; // ISO date
  /** Every season row this hero has, open or not. */
  seasonCount: number;
};

export type TransitionPlan =
  | { type: "noop" }
  | { type: "open"; grade: string; ordinal: number; startDate: string }
  | { type: "relabel"; seasonId: string; grade: string }
  | {
      type: "complete_and_open";
      completeId: string;
      endDate: string;
      crownId: string;
      open: { grade: string; ordinal: number; startDate: string };
    }
  | { type: "reopen_previous"; deleteId: string; reopenId: string; grade: string }
  | { type: "pause"; seasonId: string } // the grade was cleared while the open season has activity: keep it, no crown
  | { type: "delete_open"; seasonId: string }; // the grade was cleared and nothing happened in the season: a label that never became a year

/** "2026–27" from the season's start date. */
export function seasonLabel(startDate: string): string {
  const year = parseInt(startDate.slice(0, 4), 10);
  const next = String((year + 1) % 100).padStart(2, "0");
  return `${year}–${next}`;
}

export function nextOrdinal(existingSeasonCount: number): number {
  return existingSeasonCount + 1;
}

/**
 * What a grade change means for the hero's seasons. Promotion is the only
 * completion signal (a homeschool parent moving a hero up a grade is how they
 * say "this grade is done"), and a season with no activity is treated as a
 * label rather than a year, so a typo fixed the next day can't mint a crown.
 */
export function planSeasonTransition(input: TransitionInput): TransitionPlan {
  const { openSeason, previousCompleted, openSeasonHasActivity, newGrade, today, seasonCount } = input;

  // Clearing the grade neither promotes nor demotes. A season with work in it
  // waits for a grade again; an empty one never was a year.
  if (newGrade === null) {
    if (!openSeason) return { type: "noop" };
    return openSeasonHasActivity ? { type: "pause", seasonId: openSeason.id } : { type: "delete_open", seasonId: openSeason.id };
  }

  if (!openSeason) {
    return { type: "open", grade: newGrade, ordinal: nextOrdinal(seasonCount), startDate: today };
  }

  const direction = compareGrades(newGrade, openSeason.grade);
  if (direction === 0) return { type: "noop" };

  if (direction > 0) {
    if (!openSeasonHasActivity) {
      return { type: "relabel", seasonId: openSeason.id, grade: newGrade };
    }
    // A clock that says "today" is before the season began is a skew, not a
    // time machine: never end a season before it started.
    const endDate = today < openSeason.startDate ? openSeason.startDate : today;
    return {
      type: "complete_and_open",
      completeId: openSeason.id,
      endDate,
      crownId: crownForOrdinal(openSeason.ordinal).id,
      open: { grade: newGrade, ordinal: openSeason.ordinal + 1, startDate: endDate },
    };
  }

  // Lower grade: a correction. Undo a mistaken promotion if nothing has
  // happened in the new season yet; otherwise just fix the label.
  if (!openSeasonHasActivity && previousCompleted) {
    return { type: "reopen_previous", deleteId: openSeason.id, reopenId: previousCompleted.id, grade: newGrade };
  }
  return { type: "relabel", seasonId: openSeason.id, grade: newGrade };
}

export function gradeName(grade: string): string {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

// ── Ceremonies and regalia ──────────────────────────────────

/** A season row as the client sees it: timestamps as ISO strings, never Dates. */
export type SeasonWithCeremony = SeasonRecord & { completedAt: string | null; ceremonySeenAt: string | null };
export type CompletedCrown = { season: SeasonWithCeremony; crown: CrownTier };
/** What the customizer's Crown tab lists. */
export type CrownChoice = { id: string; label: string; color: string; seasonLabel: string };

/** The castle carries at most this many banners, however many seasons are done. */
export const BANNER_CAP = 8;

function completedNewestFirst(seasons: SeasonWithCeremony[]): SeasonWithCeremony[] {
  return seasons.filter((s) => s.completedAt !== null).sort((a, b) => b.ordinal - a.ordinal);
}

/** The newest completed season with a crown whose ceremony nobody has seen yet. An unknown crown id still gets its ceremony. */
export function pendingCeremony(seasons: SeasonWithCeremony[]): SeasonWithCeremony | null {
  return completedNewestFirst(seasons).find((s) => s.crownId !== null && s.ceremonySeenAt === null) ?? null;
}

/** Every earned crown with its season, newest first; a crown id the catalog does not know is skipped. */
export function completedCrowns(seasons: SeasonWithCeremony[]): CompletedCrown[] {
  const out: CompletedCrown[] = [];
  for (const season of completedNewestFirst(seasons)) {
    const crown = season.crownId ? crownById(season.crownId) : null;
    if (crown) out.push({ season, crown });
  }
  return out;
}

export function crownChoices(seasons: SeasonWithCeremony[]): CrownChoice[] {
  return completedCrowns(seasons).map(({ season, crown }) => ({ id: crown.id, label: crown.label, color: crown.color, seasonLabel: seasonLabel(season.startDate) }));
}

export function bannerCount(seasons: SeasonWithCeremony[]): number {
  return Math.min(BANNER_CAP, completedNewestFirst(seasons).length);
}

export function wearableCrownIds(seasons: SeasonWithCeremony[]): Set<string> {
  return new Set(completedCrowns(seasons).map((c) => c.crown.id));
}

/**
 * Which seasons a "seen" mark on `seasonId` covers: that season and every
 * older completed season still unmarked, so a backlog never plays as a queue.
 * Empty when the id is not one of this hero's completed seasons.
 */
export function seasonsToMark(seasons: SeasonWithCeremony[], seasonId: string): string[] {
  const target = seasons.find((s) => s.id === seasonId && s.completedAt !== null);
  if (!target) return [];
  return seasons.filter((s) => s.completedAt !== null && s.ceremonySeenAt === null && s.ordinal <= target.ordinal).map((s) => s.id);
}
