"use client";

/**
 * A RIDDLE STONE'S BOARD: E at one of the five stones (`lib/realm/riddle-stones.ts`) reads a short
 * review run — three riddles from what the hero has already learned (`startReviewRun`, origin
 * "stone"). The run itself is the villager board's own `DeedRun`, so the questions, second chances
 * and read-aloud are the same everywhere; a review raises no building and pays no minutes.
 *
 * It starts the moment it opens: walking up and pressing E was the choice. Nothing learned yet,
 * and the stone is quiet. A grown-up visiting starts nothing (the server refuses them anyway) and
 * is told why. Once a run is finished it asks again whether anything is still due, so the stones'
 * glow follows (`onDue`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import { getReviewDue, startReviewRun } from "@/lib/actions/review";
import { placeById } from "@/lib/realm/layout";
import { riddleStoneById } from "@/lib/realm/riddle-stones";
import type { Viewer } from "@/lib/realm3d/talk";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { deedErrorLine, HERO_ONLY } from "@/lib/utils/deed-refusals";
import { stoneTitle } from "@/lib/utils/review-copy";
import { DeedRun } from "./deed-board";
import { Panel } from "./frame-hud";

/** What a stone says when there is nothing to review yet. */
export const RIDDLE_QUIET = "The stone is quiet today. Come back after a side quest or two.";
const BACK = "Back to the Realm";

type State = { kind: "reading" } | { kind: "run"; run: RunStart } | { kind: "quiet" } | { kind: "error"; line: string };

export function RiddleStoneBoard({
  childId,
  placeId,
  viewer,
  numerals,
  profile,
  calm,
  onDue,
  onClose,
}: {
  childId: string | null;
  placeId: string;
  viewer: Viewer;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** Whether anything is still due, asked again once a run is finished. */
  onDue: (due: boolean) => void;
  onClose: () => void;
}) {
  const canPlay = viewer === "child" && childId !== null;
  const [state, setState] = useState<State>(() => (canPlay ? { kind: "reading" } : { kind: "error", line: HERO_ONLY }));

  const start = useCallback(() => {
    if (!canPlay) return;
    startReviewRun(childId!, { kind: "stone", placeId })
      .then((started) => setState("empty" in started ? { kind: "quiet" } : { kind: "run", run: started }))
      .catch((err: unknown) => setState({ kind: "error", line: deedErrorLine(err) }));
  }, [canPlay, childId, placeId]);
  // Once per opening: a development double-mount must not start two runs side by side.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    start();
  }, [start]);
  const retry = () => {
    setState({ kind: "reading" });
    start();
  };

  const place = placeById(placeId);
  const title = state.kind === "run" ? state.run.deed.title : stoneTitle(place?.name ?? "");
  const icon = <GameIcon name="scroll" className="r3-board-icon" />;

  if (state.kind === "run") {
    const finished = () => {
      getReviewDue(childId!).then(onDue, () => {});
    };
    return (
      <Panel title={title} label={title} wide className="r3-board--deed" icon={icon} onClose={onClose}>
        <DeedRun run={state.run} profile={profile} calm={calm} numerals={numerals} onResult={finished} onClose={onClose} />
      </Panel>
    );
  }

  return (
    <Panel title={title} label={title} icon={icon} onClose={onClose}>
      <p className="r3-talk-role">&ldquo;{riddleStoneById(placeId)?.line}&rdquo;</p>
      {state.kind === "reading" && <p role="status">The letters begin to glow&hellip;</p>}
      {state.kind === "quiet" && <p className="r3-speech">{RIDDLE_QUIET}</p>}
      {state.kind === "error" && (
        <p className="r3-board-error" role="alert">
          {state.line}{" "}
          {canPlay && (
            <button type="button" className="r3-link-button" onClick={retry}>
              Try again
            </button>
          )}
        </p>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          {BACK}
        </button>
      </div>
    </Panel>
  );
}
