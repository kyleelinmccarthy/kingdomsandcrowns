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
  loadLedgerAsOpened,
  loadRealmSettings,
  loadTroubleClears,
  openDay,
} from "@/lib/services/realm-play";
import { realmNow } from "@/lib/services/realm-clock";
import {
  bonusMinutesToday,
  bountyStatusFor,
  isTroubleHomeId,
  MAX_CLEARS_PER_CALL,
  type BountyStatus,
} from "@/lib/realm/spells/bounty";
import { computeRealmAccess, ledgerBalance, minutesSpent, type AccessResult } from "@/lib/utils/realm-access";
import { parseSchoolDays, weekdayOfDate } from "@/lib/utils/schedule-days";

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

/**
 * Today's rows for an access answer. The child's own check opens the day first (the free
 * allowance and yesterday's bank, written once); a grown-up's check previews it and writes nothing.
 */
async function ledgerForAccess(childId: string, date: string, childAsking: boolean) {
  const settings = await loadRealmSettings(childId);
  if (!childAsking) return { settings, ledgerToday: await loadLedgerAsOpened(childId, date, settings) };
  await openDay(childId, date, settings);
  return { settings, ledgerToday: await loadLedger(childId, date) };
}

/**
 * May the hero enter the Realm right now? Heroes may ask about themselves. "Now" is the family's
 * day and time on the server (`realmNow`), never the device's: a changed device clock changes nothing.
 * The child's own first check of the day opens it (`openDay`); at 0 minutes in an earning mode
 * the answer is `quiet`, not shut.
 */
export async function getRealmAccess(childId: string): Promise<AccessResult> {
  // The clock's read is the child's family's timezone, harmless to start beside the gate.
  const [{ access, familyId }, { date, timeOfDay }] = await Promise.all([requireChildAccess(childId), realmNow(childId)]);
  const day = weekdayOfDate(date);
  const [{ settings, ledgerToday }, classBlocksToday, recessBlocksToday, schoolDay] = await Promise.all([
    ledgerForAccess(childId, date, isChildActor(access)),
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

/** The Realm's heartbeat; capped per call so a stuck client can't burn a day at once. Charged on the server's today. */
export async function recordRealmPlay(childId: string, minutes: number): Promise<void> {
  const [, { date }] = await Promise.all([requireChildAccess(childId, { write: true }), realmNow(childId)]);
  // The same write as the page-hide beacon (`app/api/realm/play/route.ts`).
  await chargeRealmPlay(childId, date, minutes);
}

/** A grown-up's grant lands on the server's today, like every other Realm minute. */
export async function grantRealmMinutes(childId: string, minutes: number): Promise<void> {
  const [{ access }, { date }] = await Promise.all([requireChildAccess(childId, { write: true }), realmNow(childId)]);
  if (isChildActor(access)) throw new Error("Only a grown-up can grant Realm minutes.");
  assertMinutes(minutes, 240);
  await appendLedger(childId, date, "granted", minutes);
  revalidatePath("/settings");
}

/**
 * Today's minutes for the settings panel, on the server's day. Before the child has opened the
 * day it shows the allowance and carry they will open it with; it never opens the day itself.
 */
export async function getRealmPlaySummary(childId: string): Promise<{ date: string; balance: number; spent: number; bonus: number }> {
  const [, { date }] = await Promise.all([requireChildAccess(childId), realmNow(childId)]);
  // After the gate: reading settings creates the row if it is missing.
  const rows = await loadLedgerAsOpened(childId, date, await loadRealmSettings(childId));
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

/** What clearing troubles has earned today (the server's day) and may still earn. Read-only; a grown-up may ask too. */
export async function getTroubleBounty(childId: string): Promise<BountyStatus> {
  const [, { date }] = await Promise.all([requireChildAccess(childId), realmNow(childId)]);
  return bountyStatus(childId, date);
}

/**
 * The hero cleared these troubles (by home id, in order). Records every clear and banks the
 * minutes they earned. The client's say is only WHICH homes; what they are worth is decided here:
 *
 *   - only the hero themselves — a visiting grown-up writes nothing;
 *   - only on the server's today (`realmNow`), so tomorrow's allowance cannot be banked tonight;
 *   - only home ids the game writes, at most `MAX_CLEARS_PER_CALL` a call and
 *     `MAX_CLEARS_PER_MINUTE` a minute (the excess is dropped, not recorded);
 *   - a minute each for a home that has not paid today, under the day's sub-cap and the
 *     parent's daily cap (`awardClears`), and a unique index behind that;
 *   - nothing at all while the balance is 0 (the quiet world, where troubles are off), though
 *     the clears are still recorded;
 *   - all of it decided and written in one write transaction (`awardTroubleClears`), so two
 *     calls at once cannot each spend the same allowance.
 */
export async function recordTroubleClears(
  childId: string,
  homeIds: string[]
): Promise<{ awarded: number; status: BountyStatus }> {
  const [{ access }, { date }] = await Promise.all([requireChildAccess(childId, { write: true }), realmNow(childId)]);
  if (!isChildActor(access)) throw new Error("Only the hero earns minutes by clearing troubles.");
  if (!Array.isArray(homeIds) || homeIds.length < 1 || homeIds.length > MAX_CLEARS_PER_CALL) {
    throw new Error(`Send between 1 and ${MAX_CLEARS_PER_CALL} clears at a time.`);
  }
  if (!homeIds.every(isTroubleHomeId)) throw new Error("That isn't a trouble the Realm knows.");

  return awardTroubleClears(childId, date, homeIds);
}
