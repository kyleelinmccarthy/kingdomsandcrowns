"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRealmAccess, recordRealmPlay, refundIdleMinutes } from "@/lib/actions/realm-play";
import { applyAccess, idleGiveBack, minutesBack, minutesToSettle, noteInput as inputSeen, startClock, tickClock, type PlayClock } from "@/lib/realm/play-clock";
import type { AccessDenied, AccessResult, AccessSource } from "@/lib/utils/realm-access";
import { beaconPlayCharge } from "@/lib/utils/realm-play-charge";

/** Why the Realm closed, in the gate's own vocabulary. `AccessDenied` already is that reason union. */
export type CloseReason = AccessDenied;

/** Why access is currently granted: declared once, in realm-access.ts; re-exported for the gate. */
export type { AccessSource };

/**
 * Out of minutes and the server will not answer: wait this many played seconds before each
 * retry, and once the last retry fails (about a minute in), close as the clock did before the
 * quiet world — an unreachable server must not leave a child in a Realm that never shuts.
 */
export const EMPTY_RETRY_SECONDS = [5, 15, 30] as const;

/**
 * Ticks the pure clock once a second, writes a minute to the ledger every 60
 * visible seconds, and refreshes access after each write. State updates happen
 * inside the interval callback, never synchronously in the effect body.
 *
 * At 0 it never closes by itself: it asks the server once (`empty`), and the
 * answer goes quiet (`onQuiet` — an earning mode at a 0 balance: nothing counts,
 * nothing is charged) or closes (a denial, e.g. the day's cap). Minutes landing
 * while quiet — any `refresh` that finds them — wake it (`onWake`). A failed ask
 * is retried with backoff and, with no answer at all, closes (`EMPTY_RETRY_SECONDS`).
 */
export function usePlayClock({
  enabled,
  childId,
  initialMinutes,
  onClose,
  onQuiet,
  onWake,
  paused = false,
  initialSource = null,
}: {
  enabled: boolean;
  childId: string;
  initialMinutes: number;
  onClose: (reason: CloseReason) => void;
  onQuiet?: () => void;
  onWake?: (minutes: number) => void;
  paused?: boolean;
  initialSource?: AccessSource | null;
}) {
  const [clock, setClock] = useState<PlayClock>(() => startClock(initialMinutes, initialSource === "quiet"));
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<AccessSource | null>(initialSource ?? null);
  const clockRef = useRef(clock);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const quietRef = useRef(onQuiet);
  quietRef.current = onQuiet;
  const wakeRef = useRef(onWake);
  wakeRef.current = onWake;
  // An `empty` tick has asked the server and the answer is not in yet: one question, not one a second.
  const askingRef = useRef(false);
  // Failed `empty` asks in a row, and the played seconds left before the next one (`EMPTY_RETRY_SECONDS`).
  const emptyFailsRef = useRef(0);
  const emptyWaitRef = useRef(0);
  // Minutes recorded locally but not yet confirmed by the server. A failed
  // record is retried with the next minute's record (or on Try again); a
  // lost response can double-charge one minute, which is rarer than the free
  // minute the old behaviour handed out.
  const pendingRef = useRef(0);
  const recordingRef = useRef(false);
  // The whole minutes a `recordRealmPlay` still in flight is carrying. They are in `pendingRef`
  // until it answers, and the page-hide beacon must not send them a second time.
  const inFlightRef = useRef(0);
  // That record itself, resolving true once it landed: an idle give-back waits on it (`giveBackIdle`).
  const flightRef = useRef<Promise<boolean>>(Promise.resolve(false));
  const pausedRef = useRef(paused);
  const refreshOnResumeRef = useRef(false);
  // Refs change in an effect, never during render (the React Compiler rejects render-time ref writes).
  useEffect(() => {
    if (pausedRef.current && !paused) refreshOnResumeRef.current = true; // leaving a pause: check the gate on the next tick
    pausedRef.current = paused;
  }, [paused]);

  /** Adopts a fresh access answer: the one place an answer becomes clock state and callbacks. */
  const adopt = useCallback((access: AccessResult) => {
    emptyFailsRef.current = 0; // an answer: any backoff starts over
    emptyWaitRef.current = 0;
    const applied = applyAccess(clockRef.current, access);
    clockRef.current = applied.clock;
    setClock(applied.clock);
    setError("");
    if (access.allowed) setSource(access.source);
    if (applied.event === "warn") setWarning(true);
    // The last minute's banner comes down on a top-up, and never hangs over the quiet world.
    if (applied.clock.minutesRemaining > 1 || applied.clock.quiet) setWarning(false);
    if (applied.event === "quiet") quietRef.current?.();
    if (applied.event === "wake") wakeRef.current?.(applied.clock.minutesRemaining);
    // Allowed at 0 but not quiet is no answer the server gives; it closes as it always did.
    if (applied.event === "close") closeRef.current(access.allowed ? "no_minutes" : access.reason);
  }, []);

  /** Re-asks the gate. Resolves true when the server answered, false when the ask failed. */
  const refresh = useCallback(async () => {
    try {
      adopt(await getRealmAccess(childId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
      return false;
    }
  }, [childId, adopt]);

  /**
   * Writes `minutes` to the ledger and refreshes access. The caller decides the
   * number: the interval passes the whole minutes it has just banked, and
   * `flushPending` passes `minutesToSettle(…)`, which adds the rounded-up
   * remainder of the minute in progress. Nothing is sent for 0 — `recordRealmPlay`
   * rejects `minutes < 1`.
   */
  const record = useCallback(
    async (minutes: number): Promise<boolean> => {
      const sent = Math.min(minutes, 30);
      if (sent < 1) return false;
      recordingRef.current = true;
      inFlightRef.current = sent;
      let landed = false;
      try {
        await recordRealmPlay(childId, sent);
        landed = true;
        // Unbilled time is `pending` whole minutes plus the seconds of the
        // minute in progress — `pending * 60 + secondsThisMinute` seconds
        // total — and a successful send pays for `sent * 60` of it. Both
        // sides are re-read from the live refs, not a pre-await snapshot:
        // `tickClock` keeps running during this round trip (only the next
        // `settle` call is held off by `recordingRef`), so more seconds, and
        // even a whole rolled-over minute added to `pendingRef`, may have
        // accrued while this was in flight. Recomputing the delta from the
        // live totals — rather than separately subtracting `sent` from
        // `pendingRef` and zeroing `secondsThisMinute` — is what keeps a
        // minute that rolls over mid-flight from being charged twice: once
        // as this remainder's round-up, once again as the fresh `pending`
        // increment the roll-over produced.
        const unbilled = pendingRef.current * 60 + clockRef.current.secondsThisMinute;
        const remaining = Math.max(0, unbilled - sent * 60);
        pendingRef.current = Math.floor(remaining / 60);
        clockRef.current = { ...clockRef.current, secondsThisMinute: remaining % 60 };
        adopt(await getRealmAccess(childId));
      } catch (err) {
        // pendingRef and the clock's seconds are left exactly as they were:
        // the failed minutes carry into the next record, and an unbilled
        // remainder is not touched just because a send was attempted.
        setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
      } finally {
        recordingRef.current = false;
        inFlightRef.current = 0;
      }
      return landed;
    },
    [childId, adopt]
  );
  /** `record`, kept as the flight an idle give-back can wait on. Resolves whether the minutes landed. */
  const settle = useCallback((minutes: number) => (flightRef.current = record(minutes)), [record]);

  useEffect(() => {
    if (!enabled) return;
    let live = true; // false once unmounted or switched off: a late answer must not close anything
    const id = setInterval(() => {
      if (pausedRef.current) return; // a deed is running: no seconds, no records, no warnings
      if (refreshOnResumeRef.current) {
        refreshOnResumeRef.current = false;
        void refresh();
        return;
      }
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const ticked = tickClock(clockRef.current, 1, visible);
      clockRef.current = ticked.clock;
      setClock(ticked.clock);
      if (ticked.event === "warn") setWarning(true);
      // Out of minutes: ask once. A record in flight is already asking (`settle` adopts its answer).
      if (ticked.event === "empty" && !askingRef.current && !recordingRef.current) {
        if (emptyWaitRef.current > 0) emptyWaitRef.current -= 1;
        else {
          askingRef.current = true;
          setWarning(false); // the last minute is over, whatever the answer
          void refresh().then((answered) => {
            askingRef.current = false;
            if (answered) return;
            const failed = ++emptyFailsRef.current;
            if (failed <= EMPTY_RETRY_SECONDS.length) {
              emptyWaitRef.current = EMPTY_RETRY_SECONDS[failed - 1];
              return;
            }
            // Only a clock still out of minutes closes: not one already closed, quiet or woken meanwhile.
            const now = clockRef.current;
            if (!live || now.closed || now.quiet || now.minutesRemaining > 0) return;
            clockRef.current = { ...now, closed: true };
            setClock(clockRef.current);
            closeRef.current("no_minutes");
          });
        }
      }
      if (ticked.event !== "record") return;
      pendingRef.current += ticked.records;
      if (recordingRef.current) return;
      void settle(pendingRef.current);
    }, 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [enabled, settle, refresh]);

  /**
   * Writes what this visit owes right now: the pending whole minutes plus the
   * minute in progress, rounded half-up. Called by the HUD's Try-again button
   * and — above all — by RealmOpen's unmount cleanup, so every exit path
   * charges the minute the child actually played.
   */
  const flushPending = useCallback(async () => {
    if (recordingRef.current) return;
    await settle(minutesToSettle(clockRef.current, pendingRef.current));
  }, [settle]);

  /**
   * A reload, a closed tab or a typed URL unloads the page without unmounting anything, so the
   * flush above never runs on those exits and the minute in progress went uncharged — a child
   * with one minute left could play 55 seconds, reload, and have it still. `pagehide` does fire,
   * and a beacon (`lib/utils/realm-play-charge.ts`) is the request that outlives the page. What
   * it sends is booked at once exactly as a successful `settle` books it, so a page restored from
   * the back-forward cache, or unmounted after all, never charges the same seconds twice. The
   * minutes a record in flight carries are left to that record.
   */
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onHide = () => {
      const inFlight = inFlightRef.current;
      const owed = minutesToSettle(clockRef.current, pendingRef.current - inFlight);
      if (owed < 1) return;
      if (!beaconPlayCharge({ childId, minutes: owed })) return;
      const unbilled = (pendingRef.current - inFlight) * 60 + clockRef.current.secondsThisMinute;
      const remaining = Math.max(0, unbilled - owed * 60);
      pendingRef.current = inFlight + Math.floor(remaining / 60);
      clockRef.current = { ...clockRef.current, secondsThisMinute: remaining % 60 };
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [enabled, childId]);

  /** The child touched the game (`usePause`): the idle count starts again. Fires on every mouse move, so it only touches a ref. */
  const noteInput = useCallback(() => {
    clockRef.current = inputSeen(clockRef.current);
  }, []);

  /**
   * The idle pause fired: give back what this clock charged since the last input (spec §4.6,
   * `idleGiveBack`). Seconds in progress are rewound and unwritten minutes dropped here — so
   * neither a flush nor the page-hide beacon sends them; minutes already written are refunded by
   * the server (`refundIdleMinutes`), then its access answer is adopted (which wakes a clock that ran
   * out and went quiet while idle). A record still in flight
   * counts as written: the refund waits for it, and if it failed its minutes are dropped from
   * pending instead, never both. Resolves to the minutes the server gave back; 0 when nothing was
   * written (a clock quiet throughout counted nothing), or when the refund fails (the minutes then stay charged, and no error shows).
   */
  const giveBackIdle = useCallback(async (): Promise<number> => {
    const inFlight = inFlightRef.current;
    const flight = flightRef.current;
    const back = idleGiveBack(clockRef.current, pendingRef.current - inFlight);
    clockRef.current = back.clock;
    setClock(back.clock);
    pendingRef.current -= back.dropPending;
    let ask = back.refundRecorded;
    if (ask < 1) return 0;
    if (inFlight > 0 && !(await flight)) {
      // The newest "written" minutes were that record's, and it failed: they are back in pending, unwritten.
      const unwritten = Math.min(inFlight, ask, pendingRef.current);
      pendingRef.current -= unwritten;
      clockRef.current = minutesBack(clockRef.current, unwritten);
      setClock(clockRef.current);
      ask -= unwritten;
      if (ask < 1) return 0;
    }
    let refunded = 0;
    try {
      ({ refunded } = await refundIdleMinutes(childId, ask));
    } catch {
      return 0;
    }
    // The server's count now holds the refund: adopt it. A failed re-check stays silent (the card
    // already has its answer) and leaving the pause re-checks anyway (`refreshOnResumeRef`).
    if (refunded > 0) await getRealmAccess(childId).then(adopt, () => {});
    return refunded;
  }, [childId, adopt]);

  // `refresh` re-asks the gate now: minutes landed from elsewhere (a cleared trouble's bounty).
  return { minutesRemaining: clock.minutesRemaining, warning, error, clearError: () => setError(""), flushPending, refresh, source, quiet: clock.quiet, noteInput, giveBackIdle };
}
