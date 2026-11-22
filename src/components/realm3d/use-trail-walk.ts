"use client";

/**
 * A READING TRAIL, WALKED (R-H14): the frame's half of the walk. The walk itself (`begin`, `finish`,
 * `leave`, `walked` and F-8's clearing) is the shared `useWalk`; this adds the trail's own state.
 * While `walk` is set the canvas draws the fourteen stakes and E at one answers the clue through
 * `answerRef`, which the tracker (`trail-walk.tsx`) fills while it is mounted. A missed clue's
 * answer is `revealed` (its stake turns gold), and every begin, finish and leave clears it.
 *
 * Client state only: nothing here survives a reload (R-H14's planner call), and no query is added.
 */

import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { AnchorId } from "@/lib/realm/anchors";
import type { Villager } from "@/lib/realm/villagers";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { useWalk, type WalkOn, type Walked, type WalkState } from "./use-walk";

/** The walk on now (`useWalk`'s). */
export type TrailWalkOn = WalkOn;
/** A walk just finished, for its villager's board to open on (`useWalk`'s). */
export type TrailWalked = Walked;

export type TrailWalkState = WalkState & {
  /** The answer shown after a missed clue: its stake's flag turns gold. */
  revealed: AnchorId | null;
  /** E at a stake: the tracker's `answer` while it is mounted, otherwise null (no walk, no search). */
  answerRef: MutableRefObject<((id: AnchorId) => void) | null>;
  reveal(id: AnchorId | null): void;
};

/** `overlayKind` is the frame's overlay now (`useWalk`'s F-8). */
export function useTrailWalk(overlayKind: string | null): TrailWalkState {
  const { walk, walked, begin: beginWalk, finish: finishWalk, leave: leaveWalk, clearWalked } = useWalk(overlayKind);
  const [revealed, setRevealed] = useState<AnchorId | null>(null);
  const answerRef = useRef<((id: AnchorId) => void) | null>(null);

  const begin = useCallback(
    (run: RunStart, villager: Villager, buildingId: string) => {
      beginWalk(run, villager, buildingId);
      setRevealed(null);
    },
    [beginWalk],
  );

  const finish = useCallback(
    (summary: RunSummary) => {
      finishWalk(summary);
      setRevealed(null);
    },
    [finishWalk],
  );

  const leave = useCallback(() => {
    leaveWalk();
    setRevealed(null);
  }, [leaveWalk]);

  const reveal = useCallback((id: AnchorId | null) => setRevealed(id), []);

  return { walk, walked, revealed, answerRef, begin, finish, leave, reveal, clearWalked };
}
