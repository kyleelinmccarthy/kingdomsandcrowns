"use server";

import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireQuestAccess, requireReminderAccess } from "@/lib/auth/access";

export async function getReminders(questId: string) {
  await requireQuestAccess(questId);
  return db
    .select()
    .from(schema.questReminder)
    .where(eq(schema.questReminder.questId, questId));
}

export async function upsertReminder(
  questId: string,
  data: {
    type: "day_before" | "morning_of" | "custom";
    timeOfDay?: string;
    channel?: "email" | "push";
    enabled?: boolean;
  }
) {
  await requireQuestAccess(questId, { write: true });
  // Check if a reminder of this type already exists for this quest
  const existing = await db
    .select()
    .from(schema.questReminder)
    .where(
      and(
        eq(schema.questReminder.questId, questId),
        eq(schema.questReminder.type, data.type)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.questReminder)
      .set({
        timeOfDay: data.timeOfDay ?? null,
        channel: data.channel ?? "push",
        enabled: data.enabled ?? true,
      })
      .where(eq(schema.questReminder.id, existing[0].id));
    return { id: existing[0].id };
  }

  const id = nanoid();
  await db.insert(schema.questReminder).values({
    id,
    questId,
    type: data.type,
    timeOfDay: data.timeOfDay ?? null,
    channel: data.channel ?? "push",
    enabled: data.enabled ?? true,
    createdAt: new Date(),
  });
  return { id };
}

export async function deleteReminder(reminderId: string) {
  await requireReminderAccess(reminderId, { write: true });
  await db
    .delete(schema.questReminder)
    .where(eq(schema.questReminder.id, reminderId));
}
