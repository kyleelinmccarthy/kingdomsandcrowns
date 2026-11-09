"use server";

import { revalidatePath } from "next/cache";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import {
  appendToOpenedDay,
  awardTroubleClears,
  chargeRealmPlay,
  loadLedgerAsOpened,
  loadRealmSettings,
  loadTroubleClears,
  openDay,
} from "@/lib/services/realm-play";
import { loadAccessScene } from "@/lib/services/realm-access-scene";
import { realmNow } from "@/lib/services/realm-clock";
import {
  bonusMinutesToday,
  bountyStatusFor,
  isTroubleHomeId,
  MAX_CLEARS_PER_CALL,
  type BountyStatus,
} from "@/lib/realm/spells/bounty";
import { computeRealmAccess, isQuiet, ledgerBalance, minutesSpent, type AccessResult } from "@/lib/utils/realm-access";

function assertMinutes(minutes: number, max: number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > max) {
    throw new Error(`Minutes must be a whole number from 1 to ${max}.`);
  }
}

/**
 * May the hero enter the Realm right now? Heroes may ask about themselves. "Now" is the family's
 * day and time on the server (`realmNow`), never the device's: a changed device clock changes nothing.
 * The child's own check opens the day (`openDay`, which hands back the day's rows); a grown-up's
 * previews it and writes nothing. At 0 minutes in an earning mode the answer is `quiet`, not shut.
 */
export async function getRealmAccess(childId: string): Promise<AccessResult> {
  // The clock's read is the child's family's timezone, harmless to start beside the gate.
  const [{ access }, moment] = await Promise.all([requireChildAccess(childId), realmNow(childId)]);
  const scene = await loadAccessScene(childId, moment);
  const ledgerToday = isChildActor(access)
    ? await openDay(childId, moment.date, scene.settings)
    : await loadLedgerAsOpened(childId, moment.date, scene.settings);
  return computeRealmAccess({ ...scene, ledgerToday });
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
  // A write to the child's day, so it opens the day (a grown-up's write may; their views never do).
  await appendToOpenedDay(childId, date, "granted", minutes);
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

/**
 * What clearing troubles has earned today (the server's day) and may still earn: nothing in the
 * quiet world. Read-only (the day as it will open); a grown-up may ask too.
 */
export async function getTroubleBounty(childId: string): Promise<BountyStatus> {
  const [, moment] = await Promise.all([requireChildAccess(childId), realmNow(childId)]);
  const scene = await loadAccessScene(childId, moment);
  const [ledgerToday, clears] = await Promise.all([
    loadLedgerAsOpened(childId, moment.date, scene.settings),
    loadTroubleClears(childId, moment.date),
  ]);
  return bountyStatusFor(ledgerToday, scene.settings, clears, isQuiet(computeRealmAccess({ ...scene, ledgerToday })));
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
 *   - nothing at all in the quiet world (the gate's own answer, where troubles are off), though
 *     the clears are still recorded — a recess or off hours at a 0 balance is real play and pays;
 *   - all of it decided and written in one write transaction (`awardTroubleClears`), so two
 *     calls at once cannot each spend the same allowance.
 */
export async function recordTroubleClears(
  childId: string,
  homeIds: string[]
): Promise<{ awarded: number; status: BountyStatus }> {
  const [{ access }, moment] = await Promise.all([requireChildAccess(childId, { write: true }), realmNow(childId)]);
  if (!isChildActor(access)) throw new Error("Only the hero earns minutes by clearing troubles.");
  if (!Array.isArray(homeIds) || homeIds.length < 1 || homeIds.length > MAX_CLEARS_PER_CALL) {
    throw new Error(`Send between 1 and ${MAX_CLEARS_PER_CALL} clears at a time.`);
  }
  if (!homeIds.every(isTroubleHomeId)) throw new Error("That isn't a trouble the Realm knows.");

  return awardTroubleClears(childId, moment.date, homeIds, await loadAccessScene(childId, moment));
}
