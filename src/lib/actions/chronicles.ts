"use server";

import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getAssignmentsForDateRange } from "@/lib/actions/quest-assignments";
import { formatLearningLog } from "@/lib/utils/learning-log-format";
import { requireChildAccess } from "@/lib/auth/access";

export async function generateLearningLog(
  childId: string,
  childName: string,
  startDate: string,
  endDate: string
) {
  // getAssignmentsForDateRange enforces child access.
  const assignments = await getAssignmentsForDateRange(childId, startDate, endDate);

  // Fetch actual durations from activity_log for completed assignments
  const durationMap = new Map<string, number>();
  const completedIds = assignments
    .filter((a) => a.assignment.status === "completed" && a.assignment.activityLogId)
    .map((a) => a.assignment.activityLogId!);

  if (completedIds.length > 0) {
    const activities = await db
      .select({
        id: schema.activityLog.id,
        durationMinutes: schema.activityLog.durationMinutes,
      })
      .from(schema.activityLog)
      .where(
        sql`${schema.activityLog.id} IN (${sql.join(
          completedIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    for (const a of activities) {
      if (a.durationMinutes) durationMap.set(a.id, a.durationMinutes);
    }
  }

  // Merge duration data into assignment rows
  const enriched = assignments
    .filter((a) => a.assignment.status !== "pending")
    .map((a) => ({
      ...a,
      durationMinutes: a.assignment.activityLogId
        ? durationMap.get(a.assignment.activityLogId) ?? null
        : null,
    }));

  return formatLearningLog(childName, startDate, endDate, enriched);
}

export async function getSavedLog(childId: string, startDate: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select()
    .from(schema.weeklySummary)
    .where(
      and(
        eq(schema.weeklySummary.childId, childId),
        eq(schema.weeklySummary.weekStartDate, startDate)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function saveLearningLog(
  childId: string,
  startDate: string,
  endDate: string,
  generatedText: string,
  editedText: string
) {
  await requireChildAccess(childId, { write: true });
  const now = new Date();
  const existing = await getSavedLog(childId, startDate);

  if (existing) {
    await db
      .update(schema.weeklySummary)
      .set({
        weekEndDate: endDate,
        generatedText,
        editedText,
        updatedAt: now,
      })
      .where(eq(schema.weeklySummary.id, existing.id));
    return { id: existing.id };
  }

  const id = nanoid();
  await db.insert(schema.weeklySummary).values({
    id,
    childId,
    weekStartDate: startDate,
    weekEndDate: endDate,
    generatedText,
    editedText,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function markLogCopied(summaryId: string) {
  const rows = await db
    .select({ childId: schema.weeklySummary.childId })
    .from(schema.weeklySummary)
    .where(eq(schema.weeklySummary.id, summaryId))
    .limit(1);
  if (!rows[0]) throw new Error("Chronicle not found.");
  await requireChildAccess(rows[0].childId, { write: true });

  await db
    .update(schema.weeklySummary)
    .set({ copiedAt: new Date() })
    .where(eq(schema.weeklySummary.id, summaryId));
}
