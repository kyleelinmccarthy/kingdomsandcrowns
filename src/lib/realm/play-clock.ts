import type { AccessResult } from "@/lib/utils/realm-access";
import { formatTimeOfDay } from "@/lib/utils/schedule-days";

export type PlayClock = {
  minutesRemaining: number; // from the last access check
  secondsThisMinute: number; // 0..59 of visible play since the last record
  warned: boolean;
  closed: boolean;
};
export type ClockEvent = "record" | "warn" | "close" | null;

export function startClock(minutesRemaining: number): PlayClock {
  return { minutesRemaining: Math.max(0, Math.floor(minutesRemaining)), secondsThisMinute: 0, warned: false, closed: false };
}

/** At or above this many seconds into the current minute, the minute is charged. */
export const ROUND_UP_SECONDS = 30;

/**
 * Whole minutes to write when a visit ends: the records still pending, plus
 * the minute in progress rounded half-up. `flushPending` alone only rescues
 * whole minutes that were mid-flight or had failed to record — normally zero.
 * The free play came from `secondsThisMinute`, 0-59 seconds of real, visible,
 * already-played time thrown away on every unmount; a child who bounced out
 * every 50 seconds played forever for nothing.
 *
 * A child who leaves at 5 seconds is charged nothing; one who leaves at 50 is
 * charged the minute they played, so while the gate is open the leak is capped
 * at 29 seconds a visit instead of 59 and cannot be farmed. That cap is
 * specific to an open gate: while the gate is closed (see below), up to 59
 * seconds are dropped on every visit by deliberate rule, not by omission, and
 * this function does nothing to narrow that. Clamped to the minutes the hero
 * actually has left and to the ledger's 30-minute ceiling, so
 * `recordRealmPlay`'s `assertMinutes(minutes, 30)` is never made to throw. A 0
 * is simply not sent: `recordRealmPlay` rejects `minutes < 1`.
 */
export function minutesToSettle(clock: PlayClock, pending: number): number {
  if (clock.closed) return 0; // the gate already charged and shut
  const owed = pending + (clock.secondsThisMinute >= ROUND_UP_SECONDS ? 1 : 0);
  return Math.max(0, Math.min(owed, clock.minutesRemaining, 30));
}

/**
 * Only visible seconds count, so a tab left open in the background never
 * spends a hero's minutes. A record is emitted every 60 such seconds; the
 * caller writes it to the ledger and refreshes access. The `records` field
 * counts how many 60-second boundaries were crossed in this tick. Minutes
 * are decremented locally; the next tick closes if they hit 0.
 */
export function tickClock(clock: PlayClock, elapsedSeconds: number, visible: boolean): { clock: PlayClock; event: ClockEvent; records: number } {
  if (clock.closed) return { clock, event: null, records: 0 };
  if (clock.minutesRemaining <= 0) return { clock: { ...clock, closed: true }, event: "close", records: 0 };
  if (!visible) return { clock, event: null, records: 0 };
  let seconds = clock.secondsThisMinute + elapsedSeconds;
  let records = 0;
  let event: ClockEvent = null;
  // Count how many complete 60-second boundaries are crossed.
  if (seconds >= 60) {
    records = Math.floor(seconds / 60);
    seconds = seconds % 60;
    event = "record";
  }
  // Decrement minutes based on records and clamp to 0.
  const minutesRemaining = Math.max(0, clock.minutesRemaining - records);
  // The latch is held only while the last minute lasts. Minutes CAN rise mid-visit — a
  // parent grants them, or a quest finished on another device pays out — and a latch that
  // never clears would spend the child's one warning on a last minute that stopped being
  // the last minute, then close the Realm on them in silence at the real one.
  let warned = clock.warned && minutesRemaining <= 1;
  // Warn only when actually emitting the "warn" event, not when recording.
  // Use the decremented minutesRemaining for the warn check.
  if (!warned && minutesRemaining <= 1 && !event) {
    event = "warn";
    warned = true;
  }
  return { clock: { ...clock, secondsThisMinute: seconds, minutesRemaining, warned }, event, records };
}

/** A fresh access check replaces the remaining minutes and may warn or close. */
export function applyAccess(clock: PlayClock, result: AccessResult): { clock: PlayClock; event: ClockEvent } {
  if (!result.allowed || result.minutesRemaining <= 0) {
    return { clock: { ...clock, minutesRemaining: 0, closed: true }, event: "close" };
  }
  const minutesRemaining = Math.floor(result.minutesRemaining);
  // Same rule as `tickClock`: a top-up above the last minute releases the latch, so the
  // real last minute still gets its banner. `use-play-clock.ts` tests the same condition,
  // but it is NOT a duplicate of this one and must not be deleted: releasing the latch
  // here only lets a second `warn` event fire, while the hook's line clears the `warning`
  // React state that draws the banner. Nothing else sets that state false, and the
  // quest-timer message is gated on `!clock.warning`, so dropping it would strand both.
  const warned = clock.warned && minutesRemaining <= 1;
  const shouldWarn = minutesRemaining <= 1 && !warned;
  return { clock: { ...clock, minutesRemaining, warned: warned || shouldWarn }, event: shouldWarn ? "warn" : null };
}

export type GateCopy = { title: string; body: string };

/** Why the gate is shut, in the hero's own terms. Null when it is open. */
export function gateCopy(result: AccessResult, next?: { recessStart?: string }): GateCopy | null {
  if (result.allowed) return null;
  switch (result.reason) {
    case "no_minutes":
      return { title: "The Realm opens when you finish a quest.", body: "Every quest you complete banks minutes here." };
    case "outside_recess":
      return {
        title: "Recess hasn't started.",
        body: next?.recessStart ? `Recess opens at ${formatTimeOfDay(next.recessStart)}.` : "Ask a grown-up when recess is.",
      };
    case "cap_reached":
      return { title: "You've played your minutes for today.", body: "The Realm will be waiting tomorrow." };
    case "school_hours":
      return { title: "It's school time.", body: "The Realm opens after your last class." };
    case "disabled":
      return { title: "The Realm is closed for this hero.", body: "A grown-up can open it in the Chronicle." };
    default:
      const _: never = result.reason;
      return _;
  }
}
