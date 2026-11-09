/**
 * Charging Realm play time: the rules both ways in share. The play clock's server action
 * (`recordRealmPlay`) and its page-hide beacon (`app/api/realm/play/route.ts`) check a charge
 * here and write it with the same `appendLedger`, so a minute costs the same whichever way it
 * arrives.
 *
 * Why a beacon at all: a React unmount cleanup is how leaving the Realm charges the minute in
 * progress, and a reload, a closed tab or a typed URL unloads the document without running it.
 * A child with one minute left could play 55 seconds, press F5, and find the minute still there.
 * `pagehide` does fire on those exits, but a server action cannot be sent from it — only
 * `navigator.sendBeacon`, which needs a plain route.
 */

/** Where the play clock's page-hide beacon goes. */
export const REALM_PLAY_BEACON_PATH = "/api/realm/play";

/** The most minutes one charge may carry: a stuck client cannot burn a day at once. */
export const MAX_MINUTES_PER_CHARGE = 30;

/** A charge says who and how many minutes; never which day — the server decides that (`realmNow`). */
export type PlayCharge = { childId: string; minutes: number };

/** The problem with a charge's minutes, in words, or null when they are fine. */
export function playChargeProblem(minutes: unknown): string | null {
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES_PER_CHARGE) {
    return `Minutes must be a whole number from 1 to ${MAX_MINUTES_PER_CHARGE}.`;
  }
  return null;
}

/**
 * A beacon's body, parsed and checked; null for anything malformed. A `date` field (a tab opened
 * before the server owned the day still sends one) is ignored, never refused.
 */
export function parsePlayCharge(text: string): PlayCharge | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { childId, minutes } = body as Record<string, unknown>;
  if (typeof childId !== "string" || childId.length === 0 || childId.length > 128) return null;
  if (playChargeProblem(minutes) !== null) return null;
  return { childId, minutes: minutes as number };
}

/**
 * Sends a charge as the page goes away. `sendBeacon` is the one request a browser promises to
 * finish after the page is gone; a `keepalive` fetch is the fallback where it is missing or
 * refuses. The body is plain text (a CORS-safelisted type, so no preflight that could be dropped).
 * True when it was handed to the browser.
 */
export function beaconPlayCharge(charge: PlayCharge): boolean {
  const body = JSON.stringify(charge);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(REALM_PLAY_BEACON_PATH, body)) {
      return true;
    }
  } catch {
    // Fall through to the fetch.
  }
  try {
    if (typeof fetch !== "function") return false;
    void fetch(REALM_PLAY_BEACON_PATH, { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "content-type": "text/plain" } }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
