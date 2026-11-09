import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { RealmMoment } from "@/lib/services/realm-clock";
import { loadRealmSettings } from "@/lib/services/realm-play";
import type { AccessInput } from "@/lib/utils/realm-access";
import type { RealmSettings } from "@/lib/utils/realm-settings";
import { parseSchoolDays, weekdayOfDate } from "@/lib/utils/schedule-days";

/**
 * Everything an access answer reads except today's ledger: the settings, the server's time of
 * day, the day's classes and recesses, and whether it is a school day. Shared by the access
 * check and the trouble bounty (action and beacon), so the bounty asks exactly the question the
 * gate does ("is this child in the quiet world?"). The ledger is left to the caller because each
 * reads it its own way: the child's check opens the day, a grown-up's previews it, and the bounty
 * reads it under the child's lock. Plain module: callers have already authorized the child.
 */
export type AccessScene = Omit<AccessInput, "ledgerToday"> & { settings: RealmSettings };

/** Is `date` a school day for this hero: a listed weekday and not inside their family's Long Rest. */
async function isSchoolDay(childId: string, date: string): Promise<boolean> {
  const child = await db
    .select({ schoolDays: schema.child.schoolDays, familyId: schema.child.familyId })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!parseSchoolDays(child[0]?.schoolDays).includes(weekdayOfDate(date))) return false;
  const familyId = child[0]?.familyId;
  if (!familyId) return true;
  const breaks = await db
    .select({ id: schema.schoolBreak.id })
    .from(schema.schoolBreak)
    .where(
      and(
        eq(schema.schoolBreak.familyId, familyId),
        lte(schema.schoolBreak.startDate, date),
        gte(schema.schoolBreak.endDate, date)
      )
    )
    .limit(1);
  return breaks.length === 0;
}

export async function loadAccessScene(childId: string, { date, timeOfDay }: RealmMoment): Promise<AccessScene> {
  const day = weekdayOfDate(date);
  const [settings, classBlocksToday, recessBlocksToday, schoolDay] = await Promise.all([
    loadRealmSettings(childId),
    db
      .select({ startTime: schema.scheduleBlock.startTime, endTime: schema.scheduleBlock.endTime })
      .from(schema.scheduleBlock)
      .where(and(eq(schema.scheduleBlock.childId, childId), eq(schema.scheduleBlock.dayOfWeek, day))),
    db
      .select({ startTime: schema.recessBlock.startTime, endTime: schema.recessBlock.endTime })
      .from(schema.recessBlock)
      .where(and(eq(schema.recessBlock.childId, childId), eq(schema.recessBlock.dayOfWeek, day))),
    isSchoolDay(childId, date),
  ]);
  return { settings, timeOfDay, isSchoolDay: schoolDay, classBlocksToday, recessBlocksToday };
}
