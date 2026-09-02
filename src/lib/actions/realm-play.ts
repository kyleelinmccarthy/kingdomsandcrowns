"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { appendLedger, loadLedger, loadRealmSettings } from "@/lib/services/realm-play";
import { computeRealmAccess, ledgerBalance, minutesSpent, type AccessResult } from "@/lib/utils/realm-access";
import { parseSchoolDays, weekdayOfDate } from "@/lib/utils/schedule-days";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function assertDate(date: string) {
  if (!ISO_DATE.test(date)) throw new Error("That date doesn't look right.");
}

function assertMinutes(minutes: number, max: number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > max) {
    throw new Error(`Minutes must be a whole number from 1 to ${max}.`);
  }
}

/** Is `date` a school day for this hero: a listed weekday and not inside a Long Rest. */
async function isSchoolDay(childId: string, familyId: string, date: string): Promise<boolean> {
  const child = await db
    .select({ schoolDays: schema.child.schoolDays })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!parseSchoolDays(child[0]?.schoolDays).includes(weekdayOfDate(date))) return false;
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

/** May the hero enter the Realm right now? Heroes may ask about themselves. */
export async function getRealmAccess(childId: string, date: string, timeOfDay: string): Promise<AccessResult> {
  const { familyId } = await requireChildAccess(childId);
  assertDate(date);
  if (!TIME.test(timeOfDay)) throw new Error("That time doesn't look right.");
  const day = weekdayOfDate(date);
  const [settings, ledgerToday, classBlocksToday, recessBlocksToday, schoolDay] = await Promise.all([
    loadRealmSettings(childId),
    loadLedger(childId, date),
    db
      .select({ startTime: schema.scheduleBlock.startTime, endTime: schema.scheduleBlock.endTime })
      .from(schema.scheduleBlock)
      .where(and(eq(schema.scheduleBlock.childId, childId), eq(schema.scheduleBlock.dayOfWeek, day))),
    db
      .select({ startTime: schema.recessBlock.startTime, endTime: schema.recessBlock.endTime })
      .from(schema.recessBlock)
      .where(and(eq(schema.recessBlock.childId, childId), eq(schema.recessBlock.dayOfWeek, day))),
    isSchoolDay(childId, familyId, date),
  ]);
  return computeRealmAccess({ timeOfDay, isSchoolDay: schoolDay, settings, ledgerToday, classBlocksToday, recessBlocksToday });
}

/** The Realm's heartbeat will call this; capped per call so a stuck client can't burn a day at once. */
export async function recordRealmPlay(childId: string, date: string, minutes: number): Promise<void> {
  await requireChildAccess(childId, { write: true });
  assertDate(date);
  assertMinutes(minutes, 30);
  await appendLedger(childId, date, "spent", minutes);
}

export async function grantRealmMinutes(childId: string, date: string, minutes: number): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can grant Realm minutes.");
  assertDate(date);
  assertMinutes(minutes, 240);
  await appendLedger(childId, date, "granted", minutes);
  revalidatePath("/settings");
}

export async function getRealmPlaySummary(
  childId: string,
  date: string
): Promise<{ date: string; balance: number; spent: number }> {
  await requireChildAccess(childId);
  assertDate(date);
  const rows = await loadLedger(childId, date);
  return { date, balance: ledgerBalance(rows), spent: minutesSpent(rows) };
}
