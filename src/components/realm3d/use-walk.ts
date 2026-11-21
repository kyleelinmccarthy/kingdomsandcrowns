"use client";

/**
 * A WALK, THE FRAME'S HALF (R-H14, R-I2): the state every walked run shares, whatever it is walked
 * to. "Set off" on a villager's board hands the run here (`begin`); while `walk` is set the frame
 * mounts its tracker. The tracker's last stop finished, the run moves to `walked` and the villager's
 * board opens on its result card; "Leave" drops the walk and the run stays open on the server, so the
 * villager picks it back up within the hour.
 *
 * The reading trail (`use-trail-walk.ts`) and the rune walk (`use-rune-walk.ts`) are each this plus
 * their own state. Client state only: nothing here survives a reload (R-H14's planner call), and no
 * query is added.
 */

import { useCallback, useRef, useState } from "react";
import type { Villager } from "@/lib/realm/villagers";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";

/** The walk on now. `key` is new for every "Set off", so a run picked back up mounts a fresh tracker. */
export type WalkOn = { key: number; run: RunStart; villager: Villager; buildingId: string };
/** A walk just finished, for its villager's board to open on (`DeedBoard`'s `walked`). */
export type Walked = { villagerId: string; run: RunStart; summary: RunSummary };

export type WalkState = {
  walk: WalkOn | null;
  walked: Walked | null;
  begin(run: RunStart, villager: Villager, buildingId: string): void;
  finish(summary: RunSummary): void;
  leave(): void;
  clearWalked(): void;
};

/**
 * `overlayKind` is the frame's overlay now. `walked` is cleared whenever it changes to anything but
 * `"interact"` (F-8), so the result card is shown once, however its board was closed: its own button,
 * Esc, or a click on the dim (all of them `go(...)`); the next talk with that villager is the talk.
 */
export function useWalk(overlayKind: string | null): WalkState {
  const [walk, setWalk] = useState<WalkOn | null>(null);
  const [walked, setWalked] = useState<Walked | null>(null);
  // The walk as of the last call, for `finish`, which runs from an answer's callback, not a render.
  const walkRef = useRef<WalkOn | null>(null);
  const keyRef = useRef(0);

  const begin = useCallback((run: RunStart, villager: Villager, buildingId: string) => {
    keyRef.current += 1;
    walkRef.current = { key: keyRef.current, run, villager, buildingId };
    setWalk(walkRef.current);
  }, []);

  const finish = useCallback((summary: RunSummary) => {
    const was = walkRef.current;
    if (!was) return;
    walkRef.current = null;
    setWalked({ villagerId: was.villager.id, run: was.run, summary });
    setWalk(null);
  }, []);

  const leave = useCallback(() => {
    walkRef.current = null;
    setWalk(null);
  }, []);

  const clearWalked = useCallback(() => setWalked(null), []);

  // F-8, as React's "adjust state when a prop changes" (the lint forbids a setState in an effect body):
  // the overlay this hook last saw, and on a change away from the board, the result card goes.
  const [seenOverlay, setSeenOverlay] = useState(overlayKind);
  if (seenOverlay !== overlayKind) {
    setSeenOverlay(overlayKind);
    if (overlayKind !== "interact" && walked) setWalked(null);
  }

  return { walk, walked, begin, finish, leave, clearWalked };
}
