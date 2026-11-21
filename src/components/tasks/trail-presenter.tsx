"use client";

/**
 * A reading clue's work surface (slice 5). The clue itself is the player's question line, read
 * aloud as any task's is; this is what goes under it.
 *
 * - In the Realm, on a villager's board whose run is all clues (`onWalk`, R-H14): the line telling
 *   the hero what to do and "Set off", which closes the board and hands the run to the walk.
 * - Everywhere else (the Side Quests page, a board with no walk): the village map (`TrailMap`, R-H15).
 *
 * The browser is never told the answer (the clue's view is `{}`); the server grades the place sent.
 */
import { useEffect, useRef } from "react";
import { GameIcon } from "@/components/game-icon";
import { TRAIL_SET_OFF, TRAIL_SET_OFF_LINE } from "@/lib/tasks/trail-copy";
import type { PresenterProps } from "./presenters";
import { TrailMap } from "./trail-map";
import "./trail.css";

/** Enter and Space press Set off; they never act in the Realm behind the board. Esc bubbles. */
const SET_OFF_KEYS = /^(?:Enter| |Spacebar)$/;

export function TrailPresenter({ task, flow, variant, disabled, onWalk, onRespond }: PresenterProps<"trail">) {
  if (variant === "board" && onWalk) {
    // A run picked back up with every clue answered is at its finish step: nothing is left to walk to.
    return flow.phase === "resolved" ? null : <TrailSetOff onWalk={onWalk} />;
  }
  // A fresh map for every clue: nothing picked carries over to the next one.
  return <TrailMap key={`${flow.index}:${task.id}`} flow={flow} variant={variant} disabled={disabled} onRespond={onRespond} />;
}

function TrailSetOff({ onWalk }: { onWalk(): void }) {
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  return (
    <section
      className="trail trail--board trail-set-off"
      onKeyDown={(e) => {
        if (SET_OFF_KEYS.test(e.key)) e.stopPropagation();
      }}
    >
      <p className="trail-set-off-line">{TRAIL_SET_OFF_LINE}</p>
      <button ref={go} type="button" className="trail-go" onClick={onWalk}>
        <GameIcon name="journey" className="trail-go-icon" /> {TRAIL_SET_OFF}
      </button>
    </section>
  );
}
