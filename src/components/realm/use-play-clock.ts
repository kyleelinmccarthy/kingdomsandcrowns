"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRealmAccess, recordRealmPlay } from "@/lib/actions/realm-play";
import { applyAccess, startClock, tickClock, type PlayClock } from "@/lib/realm/play-clock";
import type { AccessDenied } from "@/lib/utils/realm-access";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";

/** Why the Realm closed, in the gate's own vocabulary. `AccessDenied` already is that reason union. */
export type CloseReason = AccessDenied;

/**
 * Ticks the pure clock once a second, writes a minute to the ledger every 60
 * visible seconds, and refreshes access after each write. State updates happen
 * inside the interval callback, never synchronously in the effect body.
 */
export function usePlayClock({
  enabled,
  childId,
  initialMinutes,
  onClose,
}: {
  enabled: boolean;
  childId: string;
  initialMinutes: number;
  onClose: (reason: CloseReason) => void;
}) {
  const [clock, setClock] = useState<PlayClock>(() => startClock(initialMinutes));
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState("");
  const clockRef = useRef(clock);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Minutes recorded locally but not yet confirmed by the server. A failed
  // record is retried with the next minute's record (or on Try again); a
  // lost response can double-charge one minute, which is rarer than the free
  // minute the old behaviour handed out.
  const pendingRef = useRef(0);
  const recordingRef = useRef(false);

  const settle = useCallback(
    async () => {
      recordingRef.current = true;
      const sent = Math.min(pendingRef.current, 30);
      try {
        const date = localDateOf(new Date());
        await recordRealmPlay(childId, date, sent);
        // Only the minutes actually sent are cleared: more may have accrued
        // locally while this round-trip was in flight, and those stay
        // pending for the next record.
        pendingRef.current -= sent;
        const access = await getRealmAccess(childId, date, currentTimeOfDay());
        const applied = applyAccess(clockRef.current, access);
        clockRef.current = applied.clock;
        setClock(applied.clock);
        setError("");
        if (applied.event === "warn") setWarning(true);
        if (applied.clock.minutesRemaining > 1) setWarning(false);
        if (applied.event === "close") closeRef.current(access.allowed ? "no_minutes" : access.reason);
      } catch (err) {
        // pendingRef is left as-is: the failed minutes carry into the next record.
        setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
      } finally {
        recordingRef.current = false;
      }
    },
    [childId]
  );

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const ticked = tickClock(clockRef.current, 1, visible);
      clockRef.current = ticked.clock;
      setClock(ticked.clock);
      if (ticked.event === "warn") setWarning(true);
      if (ticked.event === "close") closeRef.current("no_minutes");
      if (ticked.event !== "record") return;
      pendingRef.current += ticked.records;
      if (recordingRef.current) return;
      void settle();
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, settle]);

  const flushPending = useCallback(async () => {
    if (pendingRef.current > 0 && !recordingRef.current) {
      await settle();
    }
  }, [settle]);

  return { minutesRemaining: clock.minutesRemaining, warning, error, clearError: () => setError(""), flushPending };
}
