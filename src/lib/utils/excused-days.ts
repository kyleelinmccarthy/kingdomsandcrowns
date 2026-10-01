/**
 * Excusing a day: a grown-up saying, after the fact, that a date should not
 * have counted — a sick day, an appointment, a family day, a holiday nobody
 * had entered on the calendar yet.
 *
 * Kept apart from the server actions because a `"use server"` module may only
 * export async functions, and the reasons are needed by client components too.
 */

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
 * `alreadyOnTarget` holds the keys the target date already carries.
 */
export function partitionMovable<T extends { childId: string; questId: string }>(
  candidates: readonly T[],
  alreadyOnTarget: Iterable<string>
): { movable: T[]; blocked: T[] } {
  const taken = new Set(alreadyOnTarget);
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
