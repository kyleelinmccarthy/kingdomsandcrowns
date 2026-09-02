"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { DAYS_OF_WEEK, type DayOfWeek } from "@/lib/utils/schedule-days";
import { findRecessConflict, isValidTimeRange } from "@/lib/utils/recess-blocks";

export type RecessBlockRecord = { id: string; dayOfWeek: DayOfWeek; startTime: string; endTime: string };

export async function getRecessBlocks(childId: string): Promise<RecessBlockRecord[]> {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      id: schema.recessBlock.id,
      dayOfWeek: schema.recessBlock.dayOfWeek,
      startTime: schema.recessBlock.startTime,
      endTime: schema.recessBlock.endTime,
    })
    .from(schema.recessBlock)
    .where(eq(schema.recessBlock.childId, childId));
  return rows.sort((a, b) =>
    a.dayOfWeek === b.dayOfWeek
      ? a.startTime.localeCompare(b.startTime)
      : DAYS_OF_WEEK.indexOf(a.dayOfWeek) - DAYS_OF_WEEK.indexOf(b.dayOfWeek)
  );
}

export async function addRecessBlock(
  childId: string,
  block: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }
): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can schedule recess.");
  if (!DAYS_OF_WEEK.includes(block.dayOfWeek)) throw new Error("Pick a day of the week.");
  if (!isValidTimeRange(block.startTime, block.endTime)) throw new Error("Recess must start before it ends.");

  const [classes, recesses] = await Promise.all([
    db
      .select({ startTime: schema.scheduleBlock.startTime, endTime: schema.scheduleBlock.endTime })
      .from(schema.scheduleBlock)
      .where(and(eq(schema.scheduleBlock.childId, childId), eq(schema.scheduleBlock.dayOfWeek, block.dayOfWeek))),
    db
      .select({ startTime: schema.recessBlock.startTime, endTime: schema.recessBlock.endTime })
      .from(schema.recessBlock)
      .where(and(eq(schema.recessBlock.childId, childId), eq(schema.recessBlock.dayOfWeek, block.dayOfWeek))),
  ]);
  const clash = findRecessConflict(block, classes, recesses);
  if (clash) throw new Error(`That overlaps ${clash.startTime}–${clash.endTime}. Recess needs its own time.`);

  const now = new Date();
  await db.insert(schema.recessBlock).values({ id: nanoid(), childId, ...block, createdAt: now, updatedAt: now });
  revalidatePath("/schedule");
}

export async function removeRecessBlock(blockId: string): Promise<void> {
  const rows = await db
    .select({ childId: schema.recessBlock.childId })
    .from(schema.recessBlock)
    .where(eq(schema.recessBlock.id, blockId))
    .limit(1);
  if (!rows[0]) throw new Error("That recess is already gone.");
  const { access } = await requireChildAccess(rows[0].childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can remove recess.");
  await db.delete(schema.recessBlock).where(eq(schema.recessBlock.id, blockId));
  revalidatePath("/schedule");
}
