"use client";

/**
 * The one Set off card (RI-a / S13): on the Realm's villager board, for a run the hero walks (a
 * reading trail's clues, a rune side quest's objects), the line telling the hero where to go and
 * "Set off", which closes the board and hands the run to the walk. The button takes the focus, so
 * Enter sets off; Enter and Space never reach the Realm behind the board, and Esc bubbles to close it.
 */
import { useEffect, useRef } from "react";
import { GameIcon } from "@/components/game-icon";
import { TRAIL_SET_OFF } from "@/lib/tasks/trail-copy";
import { TRAIL_KEEP_KEYS } from "./trail-map";
import "./trail.css";

export function SetOff({ line, onWalk }: { line: string; onWalk(): void }) {
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  return (
    <section
      className="trail trail--board trail-set-off"
      onKeyDown={(e) => {
        if (TRAIL_KEEP_KEYS.test(e.key)) e.stopPropagation();
      }}
    >
      <p className="trail-set-off-line">{line}</p>
      <button ref={go} type="button" className="trail-go" onClick={onWalk}>
        <GameIcon name="journey" className="trail-go-icon" /> {TRAIL_SET_OFF}
      </button>
    </section>
  );
}
