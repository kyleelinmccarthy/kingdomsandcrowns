"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import {
  appendLedger,
  awardTroubleClears,
  chargeRealmPlay,
  loadLedger,
  loadRealmSettings,
  loadTroubleClears,
} from "@/lib/services/realm-play";
import {
  bonusMinutesToday,
  bountyStatusFor,
  isNearToday,
  isTroubleHomeId,
  MAX_CLEARS_PER_CALL,
  type BountyStatus,
} from "@/lib/realm/spells/bounty";
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
  // The same write as the page-hide beacon (`app/api/realm/play/route.ts`).
  await chargeRealmPlay(childId, date, minutes);
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
): Promise<{ date: string; balance: number; spent: number; bonus: number }> {
  await requireChildAccess(childId);
  assertDate(date);
  const rows = await loadLedger(childId, date);
  return { date, balance: ledgerBalance(rows), spent: minutesSpent(rows), bonus: bonusMinutesToday(rows) };
}

/* ---- the bounty: clearing troubles earns Realm minutes (lib/realm/spells/bounty.ts) ---- */

async function bountyStatus(childId: string, date: string): Promise<BountyStatus> {
  const [settings, ledgerToday, clears] = await Promise.all([
    loadRealmSettings(childId),
    loadLedger(childId, date),
    loadTroubleClears(childId, date),
  ]);
  return bountyStatusFor(ledgerToday, settings, clears);
}

/** What clearing troubles has earned today and may still earn. Read-only; a grown-up may ask too. */
export async function getTroubleBounty(childId: string, date: string): Promise<BountyStatus> {
  await requireChildAccess(childId);
  assertDate(date);
  return bountyStatus(childId, date);
}

/**
 * The hero cleared these troubles (by home id, in order). Records every clear and banks the
 * minutes they earned. The client's say is only WHICH homes; what they are worth is decided here:
 *
 *   - only the hero themselves — a visiting grown-up writes nothing;
 *   - only today, somewhere on Earth, so tomorrow's allowance cannot be banked tonight;
 *   - only home ids the game writes, at most `MAX_CLEARS_PER_CALL` a call and
 *     `MAX_CLEARS_PER_MINUTE` a minute (the excess is dropped, not recorded);
 *   - a minute each for a home that has not paid today, under the day's sub-cap and the
 *     parent's daily cap (`awardClears`), and a unique index behind that;
 *   - all of it decided and written in one write transaction (`awardTroubleClears`), so two
 *     calls at once cannot each spend the same allowance.
 */
export async function recordTroubleClears(
  childId: string,
  date: string,
  homeIds: string[]
): Promise<{ awarded: number; status: BountyStatus }> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error("Only the hero earns minutes by clearing troubles.");
  assertDate(date);
  if (!isNearToday(date, new Date())) throw new Error("That date doesn't look right.");
  if (!Array.isArray(homeIds) || homeIds.length < 1 || homeIds.length > MAX_CLEARS_PER_CALL) {
    throw new Error(`Send between 1 and ${MAX_CLEARS_PER_CALL} clears at a time.`);
  }
  if (!homeIds.every(isTroubleHomeId)) throw new Error("That isn't a trouble the Realm knows.");

  return awardTroubleClears(childId, date, homeIds);
}
