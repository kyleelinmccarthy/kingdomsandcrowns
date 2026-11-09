import { getTimezoneForChild, usableTimeZone } from "@/lib/services/family-timezone";
import { todayInZone } from "@/lib/utils/dates";

/**
 * The Realm's one clock. Every Realm ledger read and write asks it what day (and time) it is,
 * never the device: with a free daily allowance, a child who could set the device's date could
 * mint extra days. The family's timezone decides, on the server (spec 2026-11-09 §2a, §5).
 */
export type RealmMoment = { date: string; timeOfDay: string };

/** The date (`YYYY-MM-DD`) and 24-hour time (`HH:mm`) in `timeZone` at `now`. Pure. */
export function nowInZone(timeZone: string, now: Date = new Date()): RealmMoment {
  const zone = usableTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: "hour" | "minute") => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: todayInZone(zone, now), timeOfDay: `${part("hour")}:${part("minute")}` };
}

/** Now, for this child's family. `getTimezoneForChild` is request-cached, so asking twice is free. */
export async function realmNow(childId: string, now: Date = new Date()): Promise<RealmMoment> {
  return nowInZone(await getTimezoneForChild(childId), now);
}
