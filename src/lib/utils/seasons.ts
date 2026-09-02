import { compareGrades } from "./age-mode";
import { crownForOrdinal } from "./crown-catalog";

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
  newGrade: string;
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
  | { type: "reopen_previous"; deleteId: string; reopenId: string; grade: string };

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
