import { reviewDue } from "@/lib/utils/review-run";
import type { MasteryTiming } from "@/lib/utils/review-schedule";
import { loadMasteryRows } from "./deed-run-store";

/**
 * Review's reads, shared by `actions/review.ts` and the Realm's bundle (`actions/realm.ts`), which
 * has already checked access and so must not pay for a second check. Plain module: callers authorize.
 */

type MasteryRow = Awaited<ReturnType<typeof loadMasteryRows>>[number];

/** A mastery row as the review schedule reads it. */
export const masteryTiming = (m: MasteryRow): MasteryTiming => ({
  skillId: m.skillId, level: m.level, lastPracticedAt: m.lastPracticedAt ? m.lastPracticedAt.getTime() : null,
});

/** Whether anything the hero has learned is past its review interval. */
export async function loadReviewDue(childId: string): Promise<boolean> {
  return reviewDue((await loadMasteryRows(childId)).map(masteryTiming), Date.now());
}
