"use client";

/**
 * WHICH WALK (RI-a / N15): the routing between the Realm's two walks, so the frame holds one line for
 * "Set off" whatever the run. A run whose every task is a rune is a rune walk (R-I2, RI-a / N5);
 * any other walking run is the reading trail, as before. Only one walk is on at a time: beginning
 * one leaves the other (its run stays open on the server, as Leave leaves it).
 *
 * `canWalk` is the villager board's (RI-a / S7): a rune run is not walked while runes are off (one
 * started before the switch went off plays on the board's stone instead); any other walking run
 * always may be.
 */

import { useCallback } from "react";
import type { Villager } from "@/lib/realm/villagers";
import type { RunStart } from "@/lib/utils/deed-run-types";
import type { RuneWalkState } from "./use-rune-walk";
import type { TrailWalkState } from "./use-trail-walk";
import type { Walked } from "./use-walk";

/** A run whose every task is a rune (and there is one): the rune walk's. */
const allRunes = (run: RunStart): boolean => run.questions.length > 0 && run.questions.every((q) => q.kind === "rune");

export type Walks = {
  canWalk(run: RunStart): boolean;
  begin(run: RunStart, villager: Villager, buildingId: string): void;
  /** The walk just finished for this villager, the trail's or the rune's; null for anyone else. */
  walkedFor(villagerId: string): Walked | null;
};

export function useWalks(
  trail: Pick<TrailWalkState, "begin" | "leave" | "walked">,
  rune: Pick<RuneWalkState, "begin" | "leave" | "walked">,
  runesOn: boolean,
): Walks {
  const canWalk = useCallback((run: RunStart) => runesOn || !allRunes(run), [runesOn]);

  const { begin: beginTrail, leave: leaveTrail, walked: trailWalked } = trail;
  const { begin: beginRune, leave: leaveRune, walked: runeWalked } = rune;
  const begin = useCallback(
    (run: RunStart, villager: Villager, buildingId: string) => {
      if (allRunes(run)) {
        leaveTrail();
        beginRune(run, villager, buildingId);
      } else {
        leaveRune();
        beginTrail(run, villager, buildingId);
      }
    },
    [beginTrail, leaveTrail, beginRune, leaveRune],
  );

  const walkedFor = useCallback(
    (villagerId: string) => (trailWalked?.villagerId === villagerId ? trailWalked : runeWalked?.villagerId === villagerId ? runeWalked : null),
    [trailWalked, runeWalked],
  );

  return { canWalk, begin, walkedFor };
}
