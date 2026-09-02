"use server";

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/dates";
import { requireChildAccess, requireUpkeepTaskAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";
import {
  clearPendingUpkeepAssignmentsForTask,
  syncPendingUpkeepAssignmentsToSchedule,
} from "@/lib/services/upkeep-assignment-sync";

export async function getUpkeepSchedulesForChild(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({ schedule: schema.upkeepTaskSchedule })
    .from(schema.upkeepTaskSchedule)
    .innerJoin(
      schema.upkeepTask,
      eq(schema.upkeepTask.id, schema.upkeepTaskSchedule.taskId)
    )
    .where(eq(schema.upkeepTask.childId, childId));
  return rows.map((r) => r.schedule);
}

export async function getUpkeepSchedule(taskId: string) {
  await requireUpkeepTaskAccess(taskId);
  const rows = await db
    .select()
    .from(schema.upkeepTaskSchedule)
    .where(eq(schema.upkeepTaskSchedule.taskId, taskId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertUpkeepSchedule(
  taskId: string,
  data: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek?: string[];
    intervalWeeks?: number;
    startDate: string;
    endDate?: string;
  }
) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });

  const existing = await db
    .select({ id: schema.upkeepTaskSchedule.id })
    .from(schema.upkeepTaskSchedule)
    .where(eq(schema.upkeepTaskSchedule.taskId, taskId))
    .limit(1);

  const isWeekly = data.frequency === "weekly";
  const values = {
    frequency: data.frequency,
    daysOfWeek: isWeekly && data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
    intervalWeeks: isWeekly ? (data.intervalWeeks ?? 1) : null,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
  };

  if (existing[0]) {
    await db
      .update(schema.upkeepTaskSchedule)
      .set(values)
      .where(eq(schema.upkeepTaskSchedule.id, existing[0].id));
    // Narrowing a repeat leaves rows the old pattern already generated. Drop
    // the days the schedule no longer calls for.
    await syncPendingUpkeepAssignmentsToSchedule(taskId, formatDate(new Date()));
    return { id: existing[0].id };
  }

  const id = nanoid();
  await db.insert(schema.upkeepTaskSchedule).values({
    id,
    taskId,
    ...values,
    createdAt: new Date(),
  });
  return { id };
}

export async function deleteUpkeepSchedule(taskId: string) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });
  await db
    .delete(schema.upkeepTaskSchedule)
    .where(eq(schema.upkeepTaskSchedule.taskId, taskId));

  // Turning the repeat off has to retract the days it already planned.
  await clearPendingUpkeepAssignmentsForTask(taskId, formatDate(new Date()));
}
