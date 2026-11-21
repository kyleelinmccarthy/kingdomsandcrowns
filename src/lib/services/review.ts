import { reviewDue, type ReviewScope } from "@/lib/utils/review-run";
import type { MasteryTiming } from "@/lib/utils/review-schedule";
import { loadMasteryRows } from "./deed-run-store";
import { loadFocusSkillIds } from "./learning-focus";

/**
 * Review's reads, shared by `actions/review.ts` and the Realm's bundle (`actions/realm.ts`), which
 * has already checked access and so must not pay for a second check. Plain module: callers authorize.
 */

type MasteryRow = Awaited<ReturnType<typeof loadMasteryRows>>[number];

/** A mastery row as the review schedule reads it. */
export const masteryTiming = (m: MasteryRow): MasteryTiming => ({
  skillId: m.skillId, level: m.level, lastPracticedAt: m.lastPracticedAt ? m.lastPracticedAt.getTime() : null,
});

/**
 * Whether anything the hero may review is past its review interval. The caller passes the hero's
 * grades (it holds them already), so nothing above the hero's grade lights the stones but a
 * grown-up's focus pick (RH-c); the picks are read here, judged on those same grades.
 */
export async function loadReviewDue(childId: string, grades: ReviewScope["grades"]): Promise<boolean> {
  const [rows, focusSkillIds] = await Promise.all([loadMasteryRows(childId), loadFocusSkillIds(childId, grades)]);
  return reviewDue(rows.map(masteryTiming), Date.now(), { grades, focusSkillIds });
}
