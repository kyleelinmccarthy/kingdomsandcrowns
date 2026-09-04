"use client";

import { useEffect, useRef, useState } from "react";
import { getRealmAccess, recordRealmPlay } from "@/lib/actions/realm-play";
import { applyAccess, startClock, tickClock, type PlayClock } from "@/lib/realm/play-clock";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";

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
  onClose: () => void;
}) {
  const [clock, setClock] = useState<PlayClock>(() => startClock(initialMinutes));
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState("");
  const clockRef = useRef(clock);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    let recording = false;
    const id = setInterval(async () => {
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const ticked = tickClock(clockRef.current, 1, visible);
      clockRef.current = ticked.clock;
      setClock(ticked.clock);
      if (ticked.event === "warn") setWarning(true);
      if (ticked.event === "close") closeRef.current();
      if (ticked.event !== "record" || recording) return;
      recording = true;
      try {
        const date = localDateOf(new Date());
        await recordRealmPlay(childId, date, ticked.records);
        const access = await getRealmAccess(childId, date, currentTimeOfDay());
        const applied = applyAccess(clockRef.current, access);
        clockRef.current = applied.clock;
        setClock(applied.clock);
        setError("");
        if (applied.event === "warn") setWarning(true);
        if (applied.event === "close") closeRef.current();
      } catch (err) {
        // The minute is not re-charged: the clock already moved on. Next minute tries again.
        setError(err instanceof Error ? err.message : "The Realm lost track of time for a moment.");
      } finally {
        recording = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, childId]);

  return { minutesRemaining: clock.minutesRemaining, warning, error, clearError: () => setError("") };
}
