"use client";

/**
 * THE QUIET WORLD, on screen: the toast as minutes land and the world wakes. (The invitation that
 * stands where the minutes chip is, `QUIET_LINE`, is the clock corner's own line; the rules are
 * `lib/realm3d/quiet.ts`.)
 *
 * Mounted in the clock corner's notice slot, like the bounty's "+1 minute", and wearing its
 * classes (`troubles.css`): a gain by the clock, and the clock plank pulses gold while it shows.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { wakeToast } from "@/lib/realm3d/quiet";
import { speak } from "@/lib/utils/speech";

/** How long the wake toast stays by the clock. */
export const WAKE_MS = 4200;

export type Wake = { id: number; minutes: number };

/** Holds the wake toast. `show` is the play clock's `onWake`; read aloud for a child who asked. */
export function useWake(readAloud: boolean) {
  const [wake, setWake] = useState<Wake | null>(null);
  const seq = useRef(0);
  const show = useCallback(
    (minutes: number) => {
      setWake({ id: ++seq.current, minutes });
      if (readAloud) speak(wakeToast(minutes));
    },
    [readAloud],
  );
  useEffect(() => {
    if (!wake) return;
    const id = window.setTimeout(() => setWake((w) => (w?.id === wake.id ? null : w)), WAKE_MS);
    return () => window.clearTimeout(id);
  }, [wake]);
  return { wake, show };
}

/** "+3 minutes — the Realm wakes up!" */
export function WakeToast({ wake }: { wake: Wake | null }) {
  if (!wake) return null;
  return (
    <p key={wake.id} className="r3t-gain r3-plank" role="status" aria-live="polite">
      {wakeToast(wake.minutes)}
    </p>
  );
}
