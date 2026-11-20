"use client";

/**
 * A CHEST'S OR VAULT DOOR'S BOARD: E at one of the world's locks (`lib/realm/world-objects.ts`).
 * A shut lock starts its run of one puzzle at once (`startWorldLockRun`): walking up and pressing E
 * was the choice. The run is the villager board's own `DeedRun`, so the puzzle surface, second
 * chances and read-aloud are the same everywhere; its finish says "Done" and its leave link "Leave
 * the lock" (RG-m), and the result card says whether it opened and what was inside.
 *
 * An open lock says so, to anyone, and starts nothing. A visiting grown-up at a shut one is told
 * that locks are the hero's (the server refuses them anyway). What the server wrote is handed up
 * (`onOutcome`) the moment it answers, so the frame mirrors the opening; whether the board shows
 * the open line is decided once, when it opens, so the result card stays put while the chest
 * behind it swings open.
 *
 * A start the server refuses as already open (another run opened it) means the frame drew the lock
 * shut when it stands open: that is reported up as an "already-open" outcome, so the frame mirrors it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import { startWorldLockRun } from "@/lib/actions/world-locks";
import type { WorldObject } from "@/lib/realm/world-objects";
import type { Viewer } from "@/lib/realm3d/talk";
import type { RunStart, WorldOutcome } from "@/lib/utils/deed-run-types";
import { deedErrorLine, WORLD_HERO_ONLY, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_OPEN_LINE, CHEST_STORY, CHEST_TITLE, DOOR_OPEN_LINE, DOOR_STORY, DOOR_TITLE } from "@/lib/utils/world-lock-copy";
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
  const canPlay = viewer === "child" && childId !== null;
  const [state, setState] = useState<State>(() => (open ? { kind: "open" } : canPlay ? { kind: "reading" } : { kind: "error", line: WORLD_HERO_ONLY }));

  const start = useCallback(() => {
    startWorldLockRun(childId!, object.id)
      .then((run) => setState({ kind: "run", run }))
      .catch((err: unknown) => {
        const line = deedErrorLine(err);
        if (line === WORLD_OPEN) onOutcome({ objectId: object.id, opened: false, reason: "already-open", rewards: [] });
        setState({ kind: "error", line });
      });
  }, [childId, object.id, onOutcome]);
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
        <p className="r3-speech">{door ? DOOR_OPEN_LINE : CHEST_OPEN_LINE}</p>
      ) : (
        <p className="r3-talk-role">{door ? DOOR_STORY : CHEST_STORY}</p>
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
