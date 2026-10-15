/**
 * Excusing a day: a grown-up saying, after the fact, that a date should not
 * have counted — a sick day, an appointment, a family day, a holiday nobody
 * had entered on the calendar yet.
 *
 * Kept apart from the server actions because a `"use server"` module may only
 * export async functions, and the reasons are needed by client components too.
 */

import { getScheduledDates } from "@/lib/utils/schedule";

/** Why a grown-up excused a day. */
export const EXCUSE_REASONS = ["sick", "appointment", "family", "holiday", "other"] as const;
export type ExcuseReason = (typeof EXCUSE_REASONS)[number];

/** How each reason reads on screen. */
export const EXCUSE_REASON_LABELS: Record<ExcuseReason, string> = {
  sick: "Sick day",
  appointment: "Appointment",
  family: "Family day",
  holiday: "Holiday",
  other: "Other",
};

export function parseExcuseReason(raw: string | null | undefined): ExcuseReason {
  return EXCUSE_REASONS.includes(raw as ExcuseReason) ? (raw as ExcuseReason) : "other";
}

/**
 * `quest_assignment` is UNIQUE(child_id, quest_id, date), so a hero can hold
 * one assignment of a given quest per day. This is the key that uniqueness is
 * expressed in once the target date is fixed.
 */
export function collisionKey(row: { childId: string; questId: string }): string {
  return `${row.childId}:${row.questId}`;
}

/**
 * Split work being moved into what can land on the target day and what cannot.
 *
 * Moving Monday's maths to Wednesday is an ordinary thing for a parent to
 * want, and Wednesday very often already has maths on it — the unique index
 * would throw. Rather than fail the whole move, the colliding quest stays where
 * it is (the work is already scheduled on the target day, so there is nothing
 * to carry over) and the caller reports how many stayed behind.
 *
 * `alreadyOnTarget` holds the keys the target date already carries as rows.
 * `plannedOnTarget` holds the keys its schedule calls for even though no row
 * exists yet (see `plannedKeysOnDate`). Both block a move.
 *
 * The planned keys are what stop a double move from duplicating a day. Say
 * Monday's maths is moved to Tuesday before Tuesday's own maths has been
 * generated: nothing collides, so it lands. Move it on to Thursday and
 * `originalDate` still says Monday, so nothing claims Tuesday any more and
 * generation plants a fresh Tuesday row. Refusing the first move — Tuesday's
 * copy is already planned, so carrying another there is a duplicate — means a
 * moved row never sits on a scheduled day that nothing else claims, and moving
 * it again can never vacate a day that generation would then refill. (A
 * planned day that another moved row claims through its `originalDate` is not
 * passed in as planned; see `unclaimedPlannedKeys`.)
 */
export function partitionMovable<T extends { childId: string; questId: string }>(
  candidates: readonly T[],
  alreadyOnTarget: Iterable<string>,
  plannedOnTarget: Iterable<string> = []
): { movable: T[]; blocked: T[] } {
  const taken = new Set([...alreadyOnTarget, ...plannedOnTarget]);
  const movable: T[] = [];
  const blocked: T[] = [];

  for (const row of candidates) {
    const key = collisionKey(row);
    if (taken.has(key)) {
      blocked.push(row);
    } else {
      taken.add(key); // two of the same quest can't both land on the day either
      movable.push(row);
    }
  }

  return { movable, blocked };
}

/** A quest and its schedule as stored; the schedule fields are null for a quest with none. */
export type PlannedQuest = {
  childId: string;
  questId: string;
  isActive: boolean;
  frequency: "once" | "daily" | "weekly" | "monthly" | null;
  daysOfWeek: string | null; // JSON array, as stored
  intervalWeeks: number | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * The hero+quest keys whose schedule already calls for `date`, whether or not
 * a row has been generated for it yet.
 *
 * Uses the same date math as assignment generation, with the hero's own school
 * days, so "planned here" means exactly "generation would put a row here".
 * Retired quests and quests with no schedule plan nothing: an unscheduled
 * one-off is never the generator's to place.
 *
 * `schoolDaysByChild` maps a hero's id to their school days; a hero missing
 * from it is treated as having no school-day restriction.
 */
export function plannedKeysOnDate(
  date: string,
  quests: readonly PlannedQuest[],
  schoolDaysByChild: ReadonlyMap<string, readonly string[]>
): Set<string> {
  const planned = new Set<string>();

  for (const q of quests) {
    if (!q.isActive || !q.frequency || !q.startDate) continue;

    const daysOfWeek = q.daysOfWeek ? (JSON.parse(q.daysOfWeek) as string[]) : null;
    const covers = getScheduledDates(
      q.frequency,
      daysOfWeek,
      q.intervalWeeks,
      q.startDate,
      q.endDate,
      date,
      date,
      schoolDaysByChild.get(q.childId)?.slice() ?? null
    );
    if (covers.length > 0) planned.add(collisionKey(q));
  }

  return planned;
}

/**
 * Planned keys that really are still waiting to be generated.
 *
 * A planned day is not always up for grabs: if Tuesday's own maths row was
 * moved to Thursday, that row's `originalDate` still says Tuesday and
 * generation counts it as occupying Tuesday, so it will never plant a Tuesday
 * copy. Monday's maths can then land on Tuesday without duplicating anything,
 * and stays safe if it moves on again, because the Thursday row keeps
 * claiming Tuesday.
 *
 * `claimedByOriginalDate` holds the keys of rows (any status) whose
 * `originalDate` is the target day. A row actually sitting on the target is a
 * separate matter and still blocks through `alreadyOnTarget`.
 */
export function unclaimedPlannedKeys(
  planned: Iterable<string>,
  claimedByOriginalDate: Iterable<string>
): Set<string> {
  const unclaimed = new Set(planned);
  for (const key of claimedByOriginalDate) unclaimed.delete(key);
  return unclaimed;
}
