import { and, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/dates";
import { planSeasonTransition, type TransitionPlan } from "@/lib/utils/seasons";

/**
 * Keeps a hero's seasons in step with their grade. Plain module, not a
 * "use server" file: callers (the children actions) have already authorized
 * the child. The rules live in utils/seasons.ts; this file only loads state
 * and applies the plan.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadSeasonState(childId: string) {
  const rows = await db.select().from(schema.season).where(eq(schema.season.childId, childId));
  const open = rows.find((r) => r.completedAt === null) ?? null;
  const completed = rows
    .filter((r) => r.completedAt !== null)
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  return { open, previousCompleted: completed[0] ?? null, count: rows.length };
}

async function hasActivitySince(childId: string, startDate: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.activityLog.id })
    .from(schema.activityLog)
    .where(and(eq(schema.activityLog.childId, childId), gte(schema.activityLog.date, startDate)))
    .limit(1);
  return rows.length > 0;
}

async function applyPlan(childId: string, plan: TransitionPlan): Promise<void> {
  const now = new Date();
  switch (plan.type) {
    case "noop":
      return;
    case "open":
      await db.insert(schema.season).values({
        id: nanoid(),
        childId,
        grade: plan.grade,
        ordinal: plan.ordinal,
        startDate: plan.startDate,
        createdAt: now,
        updatedAt: now,
      });
      return;
    case "relabel":
      await db
        .update(schema.season)
        .set({ grade: plan.grade, updatedAt: now })
        .where(eq(schema.season.id, plan.seasonId));
      return;
    case "complete_and_open":
      // One transaction so grade and season can never disagree: the old season
      // must be closed before the new one is inserted (the partial unique
      // index allows only one open season per hero).
      await db.transaction(async (tx) => {
        await tx
          .update(schema.season)
          .set({ endDate: plan.endDate, completedAt: now, crownId: plan.crownId, updatedAt: now })
          .where(eq(schema.season.id, plan.completeId));
        await tx.insert(schema.season).values({
          id: nanoid(),
          childId,
          grade: plan.open.grade,
          ordinal: plan.open.ordinal,
          startDate: plan.open.startDate,
          createdAt: now,
          updatedAt: now,
        });
      });
      return;
    case "reopen_previous":
      await db.transaction(async (tx) => {
        await tx.delete(schema.season).where(eq(schema.season.id, plan.deleteId));
        await tx
          .update(schema.season)
          .set({ grade: plan.grade, endDate: null, completedAt: null, crownId: null, updatedAt: now })
          .where(eq(schema.season.id, plan.reopenId));
      });
      return;
  }
}

/** Called whenever a hero's grade is set. `today` is the caller's local ISO date. */
export async function syncSeasonForGrade(
  childId: string,
  newGrade: string,
  today: string
): Promise<TransitionPlan> {
  const date = ISO_DATE.test(today) ? today : formatDate(new Date());
  const state = await loadSeasonState(childId);
  const plan = planSeasonTransition({
    openSeason: state.open,
    previousCompleted: state.previousCompleted,
    openSeasonHasActivity: state.open ? await hasActivitySince(childId, state.open.startDate) : false,
    newGrade,
    today: date,
    seasonCount: state.count,
  });
  await applyPlan(childId, plan);
  return plan;
}

/**
 * Heroes who existed before seasons did get one opened lazily, dated from
 * when they joined, so history reads as if seasons were always there.
 */
export async function ensureSeason(childId: string): Promise<void> {
  const state = await loadSeasonState(childId);
  if (state.count > 0) return;
  const rows = await db
    .select({ grade: schema.child.grade, createdAt: schema.child.createdAt })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  const child = rows[0];
  if (!child?.grade) return;
  await applyPlan(childId, {
    type: "open",
    grade: child.grade,
    ordinal: 1,
    startDate: formatDate(child.createdAt),
  });
}
