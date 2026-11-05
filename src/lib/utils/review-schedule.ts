import { MASTERY_MAX } from "./mastery";

/**
 * The widening schedule for coming back to what a child has learned. `intervalDays` is
 * indexed by mastery level: the surer the skill, the longer it can rest. Level 0 is never
 * due, because there is nothing learned yet to keep sharp.
 */
export const REVIEW = { maxDue: 2, maxTotal: 3, intervalDays: [Infinity, 2, 4, 7, 14] } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MasteryTiming = { skillId: string; level: number; lastPracticedAt: number | null };

/**
 * Every skill past its interval, most overdue first, with no cap. The run builder takes this
 * so it can drop the skills the run already practises BEFORE applying `REVIEW.maxDue`. `now`
 * is passed in so this stays a pure function of its inputs.
 */
export function overdueSkills(rows: readonly MasteryTiming[], candidateIds: readonly string[], now: number): string[] {
  return rows
    .filter((r) => candidateIds.includes(r.skillId) && r.lastPracticedAt !== null)
    .map((r) => {
      const level = Math.min(MASTERY_MAX, Math.floor(r.level));
      const interval = level >= 1 ? REVIEW.intervalDays[level] * DAY_MS : Infinity;
      return { id: r.skillId, overdue: (now - (r.lastPracticedAt as number)) / interval };
    })
    .filter((r) => r.overdue >= 1)
    .sort((a, b) => b.overdue - a.overdue)
    .map((r) => r.id);
}
