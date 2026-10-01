"use server";

import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { todayInZone } from "@/lib/utils/dates";
import { requireChildAccess, requireUpkeepTaskAccess } from "@/lib/auth/access";
import { requireAdultActor } from "@/lib/auth/actor";
import { assertUpkeepEnabled } from "@/lib/services/upkeep-context";
import { clearPendingUpkeepAssignmentsForTask } from "@/lib/services/upkeep-assignment-sync";
import { getTimezoneForChild } from "@/lib/services/family-timezone";

/** Active task templates for a hero, each joined to its current schedule (if any). */
export async function getUpkeepTasks(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      task: schema.upkeepTask,
      scheduleId: schema.upkeepTaskSchedule.id,
      frequency: schema.upkeepTaskSchedule.frequency,
      daysOfWeek: schema.upkeepTaskSchedule.daysOfWeek,
      intervalWeeks: schema.upkeepTaskSchedule.intervalWeeks,
      startDate: schema.upkeepTaskSchedule.startDate,
      endDate: schema.upkeepTaskSchedule.endDate,
    })
    .from(schema.upkeepTask)
    .leftJoin(
      schema.upkeepTaskSchedule,
      eq(schema.upkeepTaskSchedule.taskId, schema.upkeepTask.id)
    )
    .where(
      and(
        eq(schema.upkeepTask.childId, childId),
        eq(schema.upkeepTask.isActive, true)
      )
    )
    .orderBy(schema.upkeepTask.sortOrder);
  return rows.map((r) => ({
    ...r.task,
    schedule: r.scheduleId
      ? {
          frequency: r.frequency!,
          daysOfWeek: r.daysOfWeek,
          intervalWeeks: r.intervalWeeks,
          startDate: r.startDate!,
          endDate: r.endDate,
        }
      : null,
  }));
}

/** Owning child id for a task — needed before the upkeep-enabled gate. */
async function taskChildId(taskId: string): Promise<string> {
  const rows = await db
    .select({ childId: schema.upkeepTask.childId })
    .from(schema.upkeepTask)
    .where(eq(schema.upkeepTask.id, taskId))
    .limit(1);
  if (!rows[0]) throw new Error("Upkeep task not found.");
  return rows[0].childId;
}

export async function getUpkeepTask(taskId: string) {
  try {
    await requireUpkeepTaskAccess(taskId);
  } catch {
    return null;
  }
  const rows = await db
    .select()
    .from(schema.upkeepTask)
    .where(eq(schema.upkeepTask.id, taskId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUpkeepTask(data: {
  childId: string;
  title: string;
  description?: string | null;
  valueCents?: number | null;
  isRequired?: boolean;
  rewardXp?: number | null;
  estimatedMinutes?: number | null;
  schedule?: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek?: string[];
    intervalWeeks?: number;
    startDate: string;
    endDate?: string;
  };
}) {
  await requireAdultActor();
  await requireChildAccess(data.childId, { write: true });
  await assertUpkeepEnabled(data.childId);

  const title = sanitizeName(data.title);
  if (!title) throw new Error("Task title is required");

  // Money is always whole cents. A fractional value here means a caller did
  // its own arithmetic instead of using parseDollarsToCents.
  if (data.valueCents != null && !Number.isInteger(data.valueCents)) {
    throw new Error("Task value must be whole cents");
  }
  if (data.valueCents != null && data.valueCents < 0) {
    throw new Error("Task value cannot be negative");
  }

  const existing = await db
    .select({ sortOrder: schema.upkeepTask.sortOrder })
    .from(schema.upkeepTask)
    .where(eq(schema.upkeepTask.childId, data.childId));
  const maxSort = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1);

  const id = nanoid();
  const now = new Date();

  await db.insert(schema.upkeepTask).values({
    id,
    childId: data.childId,
    title,
    description: data.description ? sanitizeText(data.description) : null,
    valueCents: data.valueCents ?? null,
    isRequired: data.isRequired ?? true,
    rewardXp: data.rewardXp ?? null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    isActive: true,
    sortOrder: maxSort + 1,
    createdAt: now,
    updatedAt: now,
  });

  if (data.schedule) {
    const isWeekly = data.schedule.frequency === "weekly";
    await db.insert(schema.upkeepTaskSchedule).values({
      id: nanoid(),
      taskId: id,
      frequency: data.schedule.frequency,
      daysOfWeek:
        isWeekly && data.schedule.daysOfWeek
          ? JSON.stringify(data.schedule.daysOfWeek)
          : null,
      intervalWeeks: isWeekly ? (data.schedule.intervalWeeks ?? 1) : null,
      startDate: data.schedule.startDate,
      endDate: data.schedule.endDate ?? null,
      createdAt: now,
    });
  }

  return { id, title };
}

export async function updateUpkeepTask(
  taskId: string,
  data: {
    title?: string;
    description?: string | null;
    valueCents?: number | null;
    isRequired?: boolean;
    rewardXp?: number | null;
    estimatedMinutes?: number | null;
    isActive?: boolean;
  }
) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });
  await assertUpkeepEnabled(await taskChildId(taskId));

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title) updates.title = sanitizeName(data.title);
  if (data.description !== undefined)
    updates.description = data.description ? sanitizeText(data.description) : null;
  if (data.valueCents !== undefined) {
    if (data.valueCents != null && !Number.isInteger(data.valueCents)) {
      throw new Error("Task value must be whole cents");
    }
    if (data.valueCents != null && data.valueCents < 0) {
      throw new Error("Task value cannot be negative");
    }
    updates.valueCents = data.valueCents;
  }
  if (data.isRequired !== undefined) updates.isRequired = data.isRequired;
  if (data.rewardXp !== undefined) updates.rewardXp = data.rewardXp;
  if (data.estimatedMinutes !== undefined)
    updates.estimatedMinutes = data.estimatedMinutes;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  await db
    .update(schema.upkeepTask)
    .set(updates)
    .where(eq(schema.upkeepTask.id, taskId));
}

/**
 * Soft-deletes the template and retracts the days it had already planned.
 *
 * Only pending rows from today forward: completed and excused assignments are
 * the hero's history, and the ledger lines that reference them must keep
 * making sense.
 */
export async function deleteUpkeepTask(taskId: string) {
  await requireAdultActor();
  await requireUpkeepTaskAccess(taskId, { write: true });
  const childId = await taskChildId(taskId);
  await assertUpkeepEnabled(childId);

  await db
    .update(schema.upkeepTask)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.upkeepTask.id, taskId));

  const timeZone = await getTimezoneForChild(childId);
  await clearPendingUpkeepAssignmentsForTask(taskId, todayInZone(timeZone));
}
