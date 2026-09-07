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
