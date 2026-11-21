"use client";

/**
 * A CHEST'S OR VAULT DOOR'S BOARD: E at one of the world's locks (`lib/realm/world-objects.ts`).
 * A shut lock starts its run of one puzzle at once (`startWorldLockRun`): walking up and pressing E
 * was the choice. The run is the villager board's own `DeedRun`, so the puzzle surface, second
 * chances and read-aloud are the same everywhere; its finish says "Done" and its leave link "Leave
 * the lock" (RG-m), and the result card says whether it opened and what was inside.
 *
 * The page's view of what stands open can be a day old (a chest relocks weekly, on the server's day),
 * so the hero's board asks the server even at a lock the frame draws open (final f1): a refusal as
 * already open says the open line, and a run that starts is the lock relocked, played at once. A
 * visiting grown-up asks nothing: an open lock says so in their own words, and a shut one that locks
 * are the hero's (the server refuses them anyway). A child view with no hero named is told plainly
 * that the lock can't be opened now. What the server wrote is handed up (`onOutcome`) the moment it
 * answers, so the frame mirrors the opening; whether the lock stood open is read once, when the
 * board opens, so the result card stays put while the chest behind it swings open.
 *
 * A start the server refuses as already open, at a lock the frame drew shut (another run opened it),
 * is reported up as an "already-open" outcome, so the frame mirrors it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import { startWorldLockRun } from "@/lib/actions/world-locks";
import type { WorldObject } from "@/lib/realm/world-objects";
import type { Viewer } from "@/lib/realm3d/talk";
import type { RunStart, WorldOutcome } from "@/lib/utils/deed-run-types";
import { deedErrorLine, WORLD_HERO_ONLY, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_STORY, CHEST_TITLE, DOOR_STORY, DOOR_TITLE, LOCK_NOT_NOW, lockOpenLine } from "@/lib/utils/world-lock-copy";
import { DeedRun } from "./deed-board";
import { Panel } from "./frame-hud";

const BACK = "Back to the Realm";

type State = { kind: "open" } | { kind: "reading" } | { kind: "run"; run: RunStart } | { kind: "error"; line: string };

export function WorldLockBoard({
  childId,
  object,
  open,
  viewer,
  numerals,
  profile,
  calm,
  onOutcome,
  onClose,
}: {
  childId: string | null;
  object: Pick<WorldObject, "id" | "type">;
  /** The lock stands open now, as the frame's view says. Read once, when the board opens. */
  open: boolean;
  viewer: Viewer;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** What the server wrote when the run finished: the frame mirrors it (`applyWorldOutcome`). */
  onOutcome: (o: WorldOutcome) => void;
  onClose: () => void;
}) {
  const visitor = viewer === "parent";
  const canPlay = viewer === "child" && childId !== null;
  // Whether the frame drew the lock open when the board opened: read once, as the result card must stay put.
  const [openedOpen] = useState(open);
  const [state, setState] = useState<State>(() =>
    canPlay ? { kind: "reading" } : open ? { kind: "open" } : { kind: "error", line: visitor ? WORLD_HERO_ONLY : LOCK_NOT_NOW },
  );

  const start = useCallback(() => {
    startWorldLockRun(childId!, object.id)
      .then((run) => setState({ kind: "run", run }))
      .catch((err: unknown) => {
        const line = deedErrorLine(err);
        // Open as the frame drew it: say so, as ever. Drawn shut but open: the frame mirrors it.
        if (line === WORLD_OPEN && openedOpen) return setState({ kind: "open" });
        if (line === WORLD_OPEN) onOutcome({ objectId: object.id, opened: false, reason: "already-open", rewards: [] });
        setState({ kind: "error", line });
      });
  }, [childId, object.id, onOutcome, openedOpen]);
  // Once per opening, and only for a shut lock the hero is at: a development double-mount must not start two runs.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || state.kind !== "reading") return;
    asked.current = true;
    start();
  }, [start, state.kind]);

  const door = object.type === "door";
  const title = door ? DOOR_TITLE : CHEST_TITLE;
  const icon = <GameIcon name="key" className="r3-board-icon" />;

  if (state.kind === "run") {
    return (
      <Panel title={title} label={title} wide className="r3-board--deed" icon={icon} onClose={onClose}>
        <DeedRun run={state.run} profile={profile} calm={calm} numerals={numerals} onResult={(s) => s.world && onOutcome(s.world)} onClose={onClose} />
      </Panel>
    );
  }

  return (
    <Panel title={title} label={title} icon={icon} onClose={onClose}>
      {state.kind === "open" ? (
        <p className="r3-speech">{lockOpenLine(door, visitor)}</p>
      ) : (
        // A lock drawn open is not described as shut while the server is asked about it.
        !(state.kind === "reading" && openedOpen) && <p className="r3-talk-role">{door ? DOOR_STORY : CHEST_STORY}</p>
      )}
      {state.kind === "reading" && <p role="status">The lock turns&hellip;</p>}
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
