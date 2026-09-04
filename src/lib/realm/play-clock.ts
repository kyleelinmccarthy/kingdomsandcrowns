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

/**
 * Only visible seconds count, so a tab left open in the background never
 * spends a hero's minutes. A record is emitted every 60 such seconds; the
 * caller writes it to the ledger and refreshes access.
 */
export function tickClock(clock: PlayClock, elapsedSeconds: number, visible: boolean): { clock: PlayClock; event: ClockEvent } {
  if (clock.closed) return { clock, event: null };
  if (clock.minutesRemaining <= 0) return { clock: { ...clock, closed: true }, event: "close" };
  if (!visible) return { clock, event: null };
  let seconds = clock.secondsThisMinute + elapsedSeconds;
  let event: ClockEvent = null;
  if (seconds >= 60) {
    seconds -= 60;
    event = "record";
  }
  let warned = clock.warned;
  if (!warned && clock.minutesRemaining <= 1) {
    warned = true;
    if (!event) event = "warn";
  }
  return { clock: { ...clock, secondsThisMinute: seconds, warned }, event };
}

/** A fresh access check replaces the remaining minutes and may warn or close. */
export function applyAccess(clock: PlayClock, result: AccessResult): { clock: PlayClock; event: ClockEvent } {
  if (!result.allowed || result.minutesRemaining <= 0) {
    return { clock: { ...clock, minutesRemaining: 0, closed: true }, event: "close" };
  }
  const minutesRemaining = Math.floor(result.minutesRemaining);
  const shouldWarn = minutesRemaining <= 1 && !clock.warned;
  return { clock: { ...clock, minutesRemaining, warned: clock.warned || shouldWarn }, event: shouldWarn ? "warn" : null };
}

export type GateCopy = { title: string; body: string };

/** Why the gate is shut, in the hero's own terms. Null when it is open. */
export function gateCopy(result: Extract<AccessResult, { allowed: true }>, next?: { recessStart?: string }): null;
export function gateCopy(result: Extract<AccessResult, { allowed: false }>, next?: { recessStart?: string }): GateCopy;
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
