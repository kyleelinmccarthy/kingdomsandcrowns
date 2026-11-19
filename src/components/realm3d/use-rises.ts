"use client";

import { useEffect, useRef, useState } from "react";
import { markBuildingsAnnounced } from "@/lib/actions/improvements";
import { objectiveState, riseToast } from "@/lib/realm/objective";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import type { Overlay } from "@/lib/realm3d/frame";
import { retroRiseSentence, riseWords, type DeedToast } from "@/lib/realm3d/talk";
import type { SkillArea } from "@/lib/utils/skills";

/** How long the village's answer to a side quest, or a rise, stays over the world. */
export const TOAST_MS = 5200;

const NO_FOCUS: ReadonlySet<SkillArea> = new Set();

type Rises = {
  /** The hero's own view: a grown-up visiting plays and marks nothing. */
  isChild: boolean;
  /** What is on screen over the world; a rise plays only when nothing is (the entry chain has run its course). */
  overlay: Overlay | null;
  /** The buildings that stand but were never shown rising (`bundle.unannounced`), in kingdom order. */
  unannounced: string[];
  /** The migration finished them (`bundle.regraded`): the line says their side quests already did. */
  regraded: boolean;
  kingdom: KingdomState;
  childId: string | null;
  /** The frame's own toast path: the toast on screen, and read aloud when the hero has that on. */
  show: (toast: DeedToast) => void;
  /** The strands the beacon leans toward, so the "Next:" in a rise agrees with a board hand-up's. */
  focusAreas?: ReadonlySet<SkillArea>;
};

/**
 * A building finished away from the Realm (on the Side Quests page, or by the retro-completion
 * migration) rises the next time the hero is in the world: the existing rise toast, one building after
 * another, each given its time on screen. The world already draws it standing; this only says so.
 *
 * It waits for `overlay` to be null, so the welcome, the ceremony and whatever comes after them are
 * never talked over. The rises to play are fixed when the hero enters; once the last is on screen all
 * the ones shown are marked announced, in one call, so none rises twice. A mark that fails is logged
 * and costs nothing but a repeat next visit.
 */
export function useRises({ isChild, overlay, unannounced, regraded, kingdom, childId, show, focusAreas = NO_FOCUS }: Rises): void {
  // The rises to play, fixed on entry (and only for buildings the kingdom lists): a later render
  // with a different list must never replay or skip one.
  const [queue] = useState(() => (isChild ? unannounced.flatMap((id) => kingdom.buildings.filter((b) => b.id === id)) : []));
  const [step, setStep] = useState(0);
  const shown = useRef(-1);
  const kingdomRef = useRef(kingdom);
  useEffect(() => {
    kingdomRef.current = kingdom;
  }, [kingdom]);

  useEffect(() => {
    if (!childId || overlay !== null || step >= queue.length) return;
    if (shown.current < step) {
      shown.current = step;
      const site = queue[step];
      const sentence = regraded
        ? retroRiseSentence(site.label)
        : riseToast(site.label, objectiveState(kingdomRef.current.buildings, 1, focusAreas));
      show(riseWords(sentence, site));
      // Everything shown is marked as soon as the last is on screen, so leaving during it is no repeat.
      if (step === queue.length - 1) {
        void markBuildingsAnnounced(childId, queue.map((b) => b.id)).catch((err: unknown) => {
          console.error("Realm rises could not be marked", err);
        });
      }
    }
    const id = window.setTimeout(() => setStep((s) => s + 1), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [childId, overlay, step, queue, regraded, show, focusAreas]);
}
