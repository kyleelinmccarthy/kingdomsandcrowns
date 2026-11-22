"use client";

/**
 * THE SHELL OF A WORLD OBJECT'S BOARD: E at a chest, a vault door or a rune object. What differs
 * between them is passed in (the start, the copy and the icon); the state machine is one (RI-a / S14,
 * taken out of `WorldLockBoard` rather than copied):
 *
 * - A shut or broken object starts its run of one puzzle at once (`start`): walking up and pressing E
 *   was the choice. The run is the villager board's own `DeedRun`, so the surface, second chances and
 *   read-aloud are the same everywhere.
 * - The page's view of what holds can be a day old (a chest relocks weekly and a rune breaks again on
 *   the server's day), so the hero's board asks the server even at an object the frame draws held
 *   (final f1, S20): the server's held answer (`{ held: true }`, a value, never a thrown error, so
 *   nothing is logged: smoke I12) says the held line, and a run that starts is the object renewed,
 *   played at once.
 * - A visiting grown-up asks nothing: a held object says so in their own words, and one not held
 *   says it is the hero's (the server refuses them anyway). A child view with no hero named is told
 *   plainly it can't be done now.
 * - What the server wrote is handed up (`onSummary`) the moment it answers, so the frame mirrors it.
 *   Whether the object was held is read once, when the board opens, so the result card stays put
 *   while the object behind it changes.
 * - A held answer at an object the frame drew not held (another run did it) is reported up
 *   (`onHeldRefused`), so the frame mirrors that too, and says `copy.refusedLine`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import type { Viewer } from "@/lib/realm3d/talk";
import { isHeld, type ObjectRunStart, type RunStart, type RunSummary } from "@/lib/utils/deed-run-types";
import { deedErrorLine } from "@/lib/utils/deed-refusals";
import { DeedRun } from "./deed-board";
import { Panel } from "./frame-hud";

const BACK = "Back to the Realm";

type State = { kind: "held" } | { kind: "reading" } | { kind: "run"; run: RunStart } | { kind: "error"; line: string };

export type ObjectRunBoardProps = {
  childId: string | null;
  viewer: Viewer;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** The object stands open or fixed now, as the frame's view says. Read once, when the board opens. */
  held: boolean;
  /** A run, or `{ held: true }` when the object already holds: an answer, never an error (smoke I12). */
  start(childId: string): Promise<ObjectRunStart>;
  copy: {
    title: string;
    story: string;
    icon: GameIconName;
    reading: string;
    notNow: string;
    heroOnly: string;
    heldLine(visitor: boolean): string;
    /** What a held answer says at an object the frame drew not held. */
    refusedLine: string;
  };
  /** A held answer at an object the frame drew not held: the frame mirrors it. */
  onHeldRefused(): void;
  onSummary(s: RunSummary): void;
  onClose(): void;
};

export function ObjectRunBoard({ childId, viewer, numerals, profile, calm, held, start, copy, onHeldRefused, onSummary, onClose }: ObjectRunBoardProps) {
  const visitor = viewer === "parent";
  const canPlay = viewer === "child" && childId !== null;
  // Whether the frame drew the object held when the board opened: read once, as the result card must stay put.
  const [openedHeld] = useState(held);
  const [state, setState] = useState<State>(() =>
    canPlay ? { kind: "reading" } : held ? { kind: "held" } : { kind: "error", line: visitor ? copy.heroOnly : copy.notNow },
  );

  const ask = useCallback(() => {
    start(childId!)
      .then((answer) => {
        if (!isHeld(answer)) return setState({ kind: "run", run: answer });
        // Held as the frame drew it: say so, as ever. Drawn not held but held: the frame mirrors it.
        if (openedHeld) return setState({ kind: "held" });
        onHeldRefused();
        setState({ kind: "error", line: copy.refusedLine });
      })
      .catch((err: unknown) => setState({ kind: "error", line: deedErrorLine(err) }));
  }, [childId, start, openedHeld, onHeldRefused, copy.refusedLine]);
  // Once per opening, and only for an object the hero is at: a development double-mount must not start two runs.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || state.kind !== "reading") return;
    asked.current = true;
    ask();
  }, [ask, state.kind]);

  const icon = <GameIcon name={copy.icon} className="r3-board-icon" />;

  if (state.kind === "run") {
    return (
      <Panel title={copy.title} label={copy.title} wide className="r3-board--deed" icon={icon} onClose={onClose}>
        <DeedRun run={state.run} profile={profile} calm={calm} numerals={numerals} onResult={onSummary} onClose={onClose} />
      </Panel>
    );
  }

  return (
    <Panel title={copy.title} label={copy.title} icon={icon} onClose={onClose}>
      {state.kind === "held" ? (
        <p className="r3-speech">{copy.heldLine(visitor)}</p>
      ) : (
        // An object drawn held is not described as waiting while the server is asked about it.
        !(state.kind === "reading" && openedHeld) && <p className="r3-talk-role">{copy.story}</p>
      )}
      {state.kind === "reading" && <p role="status">{copy.reading}</p>}
      {state.kind === "error" && (
        <p className="r3-board-error" role="alert">
          {state.line}
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
