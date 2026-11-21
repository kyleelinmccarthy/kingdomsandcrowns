"use client";

/**
 * A READING TRAIL, WALKED (R-H14): the frame's half of the walk. "Set off" on a villager's board hands
 * the run here (`begin`); while `walk` is set the canvas draws the fourteen stakes and E at one
 * answers the clue through `answerRef`, which the tracker (`trail-walk.tsx`) fills while it is
 * mounted. The tracker's last clue finished, the run moves to `walked` and the villager's board
 * opens on its result card; "Leave the trail" drops the walk and the run stays open on the server,
 * so the villager picks it back up within the hour.
 *
 * Client state only: nothing here survives a reload (R-H14's planner call), and no query is added.
 */

import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { AnchorId } from "@/lib/realm/anchors";
import type { Villager } from "@/lib/realm/villagers";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";

/** The walk on now. `key` is new for every "Set off", so a run picked back up mounts a fresh tracker. */
export type TrailWalkOn = { key: number; run: RunStart; villager: Villager; buildingId: string };
/** A walk just finished, for its villager's board to open on (`DeedBoard`'s `walked`). */
export type TrailWalked = { villagerId: string; run: RunStart; summary: RunSummary };

export type TrailWalkState = {
  walk: TrailWalkOn | null;
  walked: TrailWalked | null;
  /** The answer shown after a missed clue: its stake's flag turns gold. */
  revealed: AnchorId | null;
  /** E at a stake: the tracker's `answer` while it is mounted, otherwise null (no walk, no search). */
  answerRef: MutableRefObject<((id: AnchorId) => void) | null>;
  begin(run: RunStart, villager: Villager, buildingId: string): void;
  finish(summary: RunSummary): void;
  leave(): void;
  reveal(id: AnchorId | null): void;
  clearWalked(): void;
};

/**
 * `overlayKind` is the frame's overlay now. `walked` is cleared whenever it changes to anything but
 * `"interact"` (F-8), so the result card is shown once, however its board was closed: its own button,
 * Esc, or a click on the dim (all of them `go(...)`); the next talk with that villager is the talk.
 */
export function useTrailWalk(overlayKind: string | null): TrailWalkState {
  const [walk, setWalk] = useState<TrailWalkOn | null>(null);
  const [walked, setWalked] = useState<TrailWalked | null>(null);
  const [revealed, setRevealed] = useState<AnchorId | null>(null);
  const answerRef = useRef<((id: AnchorId) => void) | null>(null);
  // The walk as of the last call, for `finish`, which runs from an answer's callback, not a render.
  const walkRef = useRef<TrailWalkOn | null>(null);
  const keyRef = useRef(0);

  const begin = useCallback((run: RunStart, villager: Villager, buildingId: string) => {
    keyRef.current += 1;
    walkRef.current = { key: keyRef.current, run, villager, buildingId };
    setWalk(walkRef.current);
    setRevealed(null);
  }, []);

  const finish = useCallback((summary: RunSummary) => {
    const was = walkRef.current;
    if (!was) return;
    walkRef.current = null;
    setWalked({ villagerId: was.villager.id, run: was.run, summary });
    setWalk(null);
    setRevealed(null);
  }, []);

  const leave = useCallback(() => {
    walkRef.current = null;
    setWalk(null);
    setRevealed(null);
  }, []);

  const reveal = useCallback((id: AnchorId | null) => setRevealed(id), []);
  const clearWalked = useCallback(() => setWalked(null), []);

  // F-8, as React's "adjust state when a prop changes" (the lint forbids a setState in an effect body):
  // the overlay this hook last saw, and on a change away from the board, the result card goes.
  const [seenOverlay, setSeenOverlay] = useState(overlayKind);
  if (seenOverlay !== overlayKind) {
    setSeenOverlay(overlayKind);
    if (overlayKind !== "interact" && walked) setWalked(null);
  }

  return { walk, walked, revealed, answerRef, begin, finish, leave, reveal, clearWalked };
}
