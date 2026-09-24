/**
 * The troubles' page-hide beacon: clears still waiting in the page's batch when it reloads or
 * closes. The same reason as the play clock's (`realm-play-charge.ts`): a reload unmounts
 * nothing, so the bounty hook's flush never runs, and a server action cannot be sent from
 * `pagehide` — only `navigator.sendBeacon`, which needs a plain route (`app/api/realm/troubles`).
 *
 * It matters twice over now that a reload reads the clears back (`lib/realm3d/trouble-reload.ts`):
 * a clear lost on the way out would be a trouble standing there again after the reload.
 */

import { MAX_CLEARS_PER_CALL, isNearToday, isTroubleHomeId } from "@/lib/realm/spells/bounty";

/** Where the troubles' page-hide beacon goes. */
export const REALM_CLEARS_BEACON_PATH = "/api/realm/troubles";

export type ClearBeacon = { childId: string; date: string; homeIds: string[] };

/** A beacon's body, parsed and checked exactly as `recordTroubleClears` checks it; null for anything else. */
export function parseClearBeacon(text: string, now: Date): ClearBeacon | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { childId, date, homeIds } = body as Record<string, unknown>;
  if (typeof childId !== "string" || childId.length === 0 || childId.length > 128) return null;
  if (typeof date !== "string" || !isNearToday(date, now)) return null;
  if (!Array.isArray(homeIds) || homeIds.length < 1 || homeIds.length > MAX_CLEARS_PER_CALL) return null;
  if (!homeIds.every(isTroubleHomeId)) return null;
  return { childId, date, homeIds: homeIds as string[] };
}

/** Sends waiting clears as the page goes away. True when the browser took it. */
export function beaconClears(beacon: ClearBeacon): boolean {
  const body = JSON.stringify(beacon);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(REALM_CLEARS_BEACON_PATH, body)) {
      return true;
    }
  } catch {
    // Fall through to the fetch.
  }
  try {
    if (typeof fetch !== "function") return false;
    void fetch(REALM_CLEARS_BEACON_PATH, { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "content-type": "text/plain" } }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
