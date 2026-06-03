"use server";

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireQuestAccess } from "@/lib/auth/access";

export async function getSchedule(questId: string) {
  await requireQuestAccess(questId);
  const rows = await db
    .select()
    .from(schema.questSchedule)
    .where(eq(schema.questSchedule.questId, questId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSchedule(
  questId: string,
  data: {
    frequency: "daily" | "specific_days";
    daysOfWeek?: string[];
    startDate: string;
    endDate?: string;
  }
) {
  await requireQuestAccess(questId, { write: true });
  const existing = await getSchedule(questId);

  if (existing) {
    await db
      .update(schema.questSchedule)
      .set({
        frequency: data.frequency,
        daysOfWeek: data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
      })
      .where(eq(schema.questSchedule.id, existing.id));
    return { id: existing.id };
  }

  const id = nanoid();
  await db.insert(schema.questSchedule).values({
    id,
    questId,
    frequency: data.frequency,
    daysOfWeek: data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    createdAt: new Date(),
  });
  return { id };
}

export async function deleteSchedule(questId: string) {
  await requireQuestAccess(questId, { write: true });
  await db
    .delete(schema.questSchedule)
    .where(eq(schema.questSchedule.questId, questId));
}
