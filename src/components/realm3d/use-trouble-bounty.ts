"use client";

/**
 * THE BOUNTY, client side: what a clear is worth, told to the child the moment it happens, and
 * the clears sent to the server, which decides.
 *
 * The rules are `lib/realm/spells/bounty.ts`; this hook is only the plumbing the slice-8 spec
 * describes (§3.11) — a purse seeded from `getTroubleBounty` when the visit starts, a prediction
 * per clear (`takeClear`), a flush that sends the clears and lets the server's answer overwrite
 * the prediction (`applyStatus`), and the clock told to look again when minutes landed.
 *
 * One change from the spec's batching: a clear the purse predicts will PAY is sent at once
 * rather than waiting for two more. There are at most five of those a day at the default cap,
 * and a child who has just been told "+1 minute" should see the clock go up while they are still
 * looking at it. Clears that pay nothing are batched (three, or four seconds idle).
 *
 * A visiting grown-up (`enabled` false) never asks and never sends: the purse stays unknown, so
 * no clear ever claims a minute, and the tally is just the visit's own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTroubleBounty, recordTroubleClears } from "@/lib/actions/realm-play";
import {
  applyStatus,
  CLEARS_PER_FLUSH,
  FLUSH_IDLE_MS,
  MAX_CLEARS_PER_CALL,
  MAX_FLUSH_FAILURES,
  startPurse,
  takeClear,
  type BountyStatus,
  type ClearOutcome,
} from "@/lib/realm/spells/bounty";
import { localDateOf } from "@/lib/utils/schedule-days";
import { beaconClears } from "@/lib/utils/realm-clear-beacon";
import { addTabClear, holdClears, mergeClears, readTabClears, tabClearsKey, type HeldClears, type RecentClear } from "@/lib/realm3d/trouble-reload";

function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Notes a clear in this tab, for a reload that beats the server to it (`trouble-reload.ts`). */
function noteTabClear(childId: string, homeId: string): void {
  const s = tabStorage();
  if (!s) return;
  try {
    const now = Date.now();
    s.setItem(tabClearsKey(childId), JSON.stringify(addTabClear(readTabClears(s.getItem(tabClearsKey(childId)), now), homeId, now)));
  } catch {
    // Blocked or full storage: the server's record still has it, a moment later.
  }
}

/**
 * The clears a new page should seed its troubles with: the bundle's (the server's record), and,
 * on the hero's own visit, this tab's note of clears the server may not have yet — held with the
 * moment the page got them. A visiting grown-up gets the server's alone.
 */
export function heldClearsFor(childId: string | null, server: readonly RecentClear[] | undefined, ownVisit: boolean): HeldClears {
  const s = ownVisit && childId ? tabStorage() : null;
  let tab: ReturnType<typeof readTabClears> = [];
  const now = Date.now();
  try {
    if (s && childId) tab = readTabClears(s.getItem(tabClearsKey(childId)), now);
  } catch {
    tab = [];
  }
  return holdClears(tab.length > 0 ? mergeClears(server ?? [], tab, now) : (server ?? []));
}

export type TroubleBounty = {
  enabled: boolean;
  /** A trouble was cleared at this home: what it is worth, predicted now. */
  claim: (homeId: string | null) => ClearOutcome;
  /** Send whatever is waiting. Also runs on unmount, so leaving never skips it. */
  flush: () => Promise<void>;
  /** Bumped on every paid clear, for the "+1 minute" by the clock. 0 until the first. */
  gained: number;
  /** The server's last word on today's bounty, or null before it has spoken: the earning copy reads it. */
  status?: BountyStatus | null;
};

export function useTroubleBounty({
  enabled,
  childId,
  onAwarded,
}: {
  enabled: boolean;
  childId: string;
  /** Minutes landed in the ledger: the clock should ask the server again. */
  onAwarded?: () => void;
}): TroubleBounty {
  const purse = useRef(startPurse());
  const queue = useRef<string[]>([]);
  const inflight = useRef(false);
  /** Refusals in a row of the batch at the head of the queue. */
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awardedRef = useRef(onAwarded);
  const [gained, setGained] = useState(0);
  const [status, setStatus] = useState<BountyStatus | null>(null);
  /** The latest `flush`, for the retry timer a flush schedules for itself. */
  const again = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    awardedRef.current = onAwarded;
  }, [onAwarded]);

  // Seed the purse: until this answers, no clear claims a minute.
  useEffect(() => {
    if (!enabled || !childId) return;
    let live = true;
    getTroubleBounty(childId, localDateOf(new Date()))
      .then((s) => {
        if (!live) return;
        applyStatus(purse.current, s, queue.current);
        setStatus(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, childId]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!enabled || !childId || inflight.current || queue.current.length === 0) return;
    const batch = queue.current.splice(0, MAX_CLEARS_PER_CALL);
    inflight.current = true;
    let failed = false;
    try {
      const r = await recordTroubleClears(childId, localDateOf(new Date()), batch);
      failures.current = 0;
      applyStatus(purse.current, r.status, queue.current);
      setStatus(r.status);
      if (r.awarded > 0) awardedRef.current?.();
    } catch {
      // Not lost: the batch goes back to the front of the queue and rides the next flush. A
      // clear is worth a minute at most, and the ledger is append-only — losing one on a torn
      // down page is strictly better than paying one twice. But not for ever: a refusal that
      // lasts would hold back every later clear for the rest of the visit, so after
      // MAX_FLUSH_FAILURES the batch is dropped and the next clears go out on their own.
      failures.current += 1;
      if (failures.current < MAX_FLUSH_FAILURES) queue.current.unshift(...batch);
      else failures.current = 0;
      failed = true;
    } finally {
      inflight.current = false;
    }
    // Clears made while that was in flight go next, shortly; after a failure, not so shortly.
    if (queue.current.length > 0 && !timer.current) {
      timer.current = setTimeout(
        () => {
          timer.current = null;
          void again.current();
        },
        failed ? FLUSH_IDLE_MS * 3 : 600,
      );
    }
  }, [enabled, childId]);
  useEffect(() => {
    again.current = flush;
  }, [flush]);

  const claim = useCallback(
    (homeId: string | null): ClearOutcome => {
      const id = homeId ?? "";
      const outcome = takeClear(purse.current, id);
      if (!enabled || !childId || !homeId) return outcome;
      noteTabClear(childId, homeId);
      queue.current.push(homeId);
      if (outcome.paid) setGained((n) => n + 1);
      if (outcome.paid || queue.current.length >= CLEARS_PER_FLUSH) {
        void flush();
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          void flush();
        }, FLUSH_IDLE_MS);
      }
      return outcome;
    },
    [enabled, childId, flush],
  );

  // Every way out unmounts this: send what is waiting.
  useEffect(() => () => void flush(), [flush]);

  // ...except a reload, a closed tab or a typed URL, which unmount nothing. `pagehide` still
  // fires, and a beacon outlives the page (`lib/utils/realm-clear-beacon.ts`): without it a clear
  // still in the batch was lost, and — now a reload reads the clears back — its trouble stood
  // there again after the reload. What a beacon took leaves the queue, so a page restored from
  // the back-forward cache never sends it twice. A batch already in flight is left to its call.
  useEffect(() => {
    if (!enabled || !childId || typeof window === "undefined") return;
    const onHide = () => {
      if (queue.current.length === 0) return;
      const batch = queue.current.slice(0, MAX_CLEARS_PER_CALL);
      if (beaconClears({ childId, date: localDateOf(new Date()), homeIds: batch })) queue.current.splice(0, batch.length);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [enabled, childId]);

  return useMemo(() => ({ enabled: enabled && !!childId, claim, flush, gained, status }), [enabled, childId, claim, flush, gained, status]);
}
