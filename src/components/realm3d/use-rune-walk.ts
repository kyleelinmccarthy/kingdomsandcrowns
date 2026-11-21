"use client";

/**
 * A RUNE WALK (R-I2): the frame's half of a language side quest walked to its rune objects. The walk
 * itself (`begin`, `finish`, `leave`, `walked` and F-8's clearing) is the shared `useWalk`; this adds
 * the stop the tracker is on (`at`, reported by `rune-walk.tsx` from its flow, RI-a / S1), the
 * objects cast right on this walk (`mended`, R-I21), what the canvas draws of it, and E's routing.
 *
 * - `stopOf(id)` is what E at an object means now (`runeStopOf`, RI-a / S2): the current stop opens
 *   the stone, a later one is named, one mended on this walk holds, and anything else, a passed and
 *   missed stop included, opens that object's own board.
 * - `casts(id)` is whether the stone is the one open at `id`: by the stop's index alone, mended or
 *   not, so the stone stays after a right cast until Done (RI-a / B1).
 * - `canvas` is `{ named, mended }` for the painter: the stops still ahead (a passed stop is no longer
 *   one the walk is going to) and what was mended; none named for a walk picked back up with every
 *   word cast (its finish step). The same object until either changes; null with no walk, so the
 *   memoised `World`'s sibling never redraws for nothing.
 *
 * Every begin, finish and leave starts again at stop 0 with nothing mended but what the server says
 * a walk picked back up already cast right (`run.mended`): "Leave the rune walk" drops the marks, and
 * the objects show as their rows say until a run is finished (R-I21). While the walk is on, the frame
 * draws its objects through `canvas` (`withRuneWalk`, owner 2026-11-21): every stop still ahead broken,
 * whatever its record says, and each one mended on this walk fixed, so E's verb and label follow.
 * Client state otherwise, as the trail's.
 */

import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Villager } from "@/lib/realm/villagers";
import { runeStopOf, runeStops, type RuneStop } from "@/lib/tasks/rune-stops";
import { initialFlow, readyToFinish } from "@/lib/utils/deed-run-flow";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { useWalk, type WalkState } from "./use-walk";

/** What the painter draws of a walk (`RealmCanvasProps.runeWalk`). */
export type RuneWalkCanvas = { named: readonly string[]; mended: readonly string[] };

export type RuneWalkState = WalkState & {
  /** The walk's stops, in order (`runeStops`); none with no walk. */
  stops: readonly RuneStop[];
  /** The stop on now, reported by the tracker (`onAt`). */
  at: number;
  /** Object ids cast right on this walk. */
  mended: readonly string[];
  canvas: RuneWalkCanvas | null;
  setAt(i: number): void;
  markMended(id: string): void;
  /** E's routing: `runeStopOf(stops, at, mended, id)` (RI-a / S2); null with no walk. */
  stopOf(id: string): "current" | "later" | "done" | null;
  /** The stone stays open on its stop by index alone, mended or not (RI-a / B1). */
  casts(id: string): boolean;
  /** Shows a line on the tracker's card, while the tracker is mounted (it fills this). */
  sayRef: MutableRefObject<((line: string) => void) | null>;
};

const NONE: readonly string[] = [];

export function useRuneWalk(overlayKind: string | null): RuneWalkState {
  const { walk, walked, begin: beginWalk, finish: finishWalk, leave: leaveWalk, clearWalked } = useWalk(overlayKind);
  const [at, setAtState] = useState(0);
  const [mended, setMended] = useState<readonly string[]>(NONE);
  const sayRef = useRef<((line: string) => void) | null>(null);

  const reset = useCallback(() => {
    setAtState(0);
    setMended(NONE);
  }, []);

  // A walk picked back up starts with what the server says it already cast right (`run.mended`), so
  // its card keeps those ticks and the canvas draws them mended (smoke bug 3).
  const begin = useCallback((run: RunStart, villager: Villager, buildingId: string) => {
    beginWalk(run, villager, buildingId);
    setAtState(0);
    setMended(run.mended ?? NONE);
  }, [beginWalk]);

  const finish = useCallback(
    (summary: RunSummary) => {
      finishWalk(summary);
      reset();
    },
    [finishWalk, reset],
  );

  const leave = useCallback(() => {
    leaveWalk();
    reset();
  }, [leaveWalk, reset]);

  const setAt = useCallback((i: number) => setAtState(i), []);
  const markMended = useCallback((id: string) => setMended((m) => (m.includes(id) ? m : [...m, id])), []);

  const stops = useMemo(() => (walk ? runeStops(walk.run) : []), [walk]);
  // A walk picked back up at its finish step (every word cast) has nothing left to walk to: no mark.
  const allCast = useMemo(() => walk !== null && readyToFinish(initialFlow(walk.run), walk.run.questions.length), [walk]);
  const stopOf = useCallback((id: string) => (walk ? runeStopOf(stops, at, mended, id) : null), [walk, stops, at, mended]);
  const casts = useCallback((id: string) => walk !== null && stops[at]?.id === id, [walk, stops, at]);
  const canvas = useMemo(() => (walk ? { named: allCast ? NONE : stops.slice(at).map((s) => s.id), mended } : null), [walk, allCast, stops, at, mended]);

  return { walk, walked, begin, finish, leave, clearWalked, stops, at, mended, canvas, setAt, markMended, stopOf, casts, sayRef };
}
