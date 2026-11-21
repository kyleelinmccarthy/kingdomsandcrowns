"use client";

/**
 * THE PUZZLE TOWER'S BOARD: E at the Tower (`lib/realm/puzzle-tower.ts`). It lists the floors the
 * frame's view shows, top down, each named by its place in the Tower ("The third floor") and never
 * by a grade. An open floor says how many bonus puzzles are solved there, or that a new one waits,
 * and gives the hero a "Climb". A floor still waiting says exactly how to open it. A visiting
 * grown-up sees the same floors and has no Climb: the bonus locks are the hero's, and the server
 * refuses them anyway.
 *
 * Climbing starts the floor's run (`startTowerRun`) and plays it in the villager board's own
 * `DeedRun`, so the puzzle surface, read-aloud and calm mode are the same everywhere; its finish says
 * "Finish puzzles" and its leave link "Leave the puzzles", as Puzzle practice's do (RG-m). What the
 * server wrote is handed up (`onOutcome`) the moment it answers, so the frame keeps the count; the
 * result card's button goes back to the floors, where the new count shows.
 */

import { useState } from "react";
import { GameIcon } from "@/components/game-icon";
import { startTowerRun } from "@/lib/actions/world-locks";
import type { TowerFloorView } from "@/lib/realm/world-state";
import { CONTENT_BANDS, type ContentBand } from "@/lib/utils/content-bands";
import type { Viewer } from "@/lib/realm3d/talk";
import type { RunStart, TowerOutcome } from "@/lib/utils/deed-run-types";
import { deedErrorLine } from "@/lib/utils/deed-refusals";
import { TOWER_TITLE, TOWER_VERB, towerFloorLine, towerFloorName } from "@/lib/utils/world-lock-copy";
import { DeedRun } from "./deed-board";
import { Panel } from "./frame-hud";

const BACK = "Back to the Realm";
const BACK_TO_FLOORS = "Back to the floors";

export function TowerBoard({
  childId,
  floors,
  viewer,
  numerals,
  profile,
  calm,
  onOutcome,
  onClose,
}: {
  childId: string | null;
  /** The Tower's visible floors, bottom first (`towerFloors`): nothing above the hero's own is ever in it. */
  floors: readonly TowerFloorView[];
  viewer: Viewer;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** What the server wrote when a floor's run finished: the frame keeps the count (`applyTowerOutcome`). */
  onOutcome: (o: TowerOutcome) => void;
  onClose: () => void;
}) {
  const canPlay = viewer === "child" && childId !== null;
  const [run, setRun] = useState<RunStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const icon = <GameIcon name="key" className="r3-board-icon" />;

  function climb(band: ContentBand) {
    if (busy || !childId) return;
    setBusy(true);
    setError(null);
    startTowerRun(childId, band)
      .then(setRun)
      .catch((err: unknown) => setError(deedErrorLine(err)))
      .finally(() => setBusy(false));
  }

  if (run) {
    return (
      <Panel title={TOWER_TITLE} label={TOWER_TITLE} wide className="r3-board--deed" icon={icon} onClose={() => setRun(null)}>
        <DeedRun
          run={run}
          profile={profile}
          calm={calm}
          numerals={numerals}
          onResult={(s) => s.tower && onOutcome(s.tower)}
          onClose={() => setRun(null)}
          doneLabel={BACK_TO_FLOORS}
        />
      </Panel>
    );
  }

  return (
    <Panel title={TOWER_TITLE} label={TOWER_TITLE} icon={icon} onClose={onClose}>
      <ul className="r3-tower-floors">
        {[...floors].reverse().map((f) => {
          const name = towerFloorName(CONTENT_BANDS.indexOf(f.band));
          return (
            <li key={f.band} className="r3-tower-floor">
              <h3 className="r3-tower-floor-name">{name}</h3>
              <p className="r3-tower-floor-line">{towerFloorLine(f, numerals)}</p>
              {canPlay && f.open && (
                <button type="button" className="r3-menu-item r3-menu-item--go" aria-label={`${TOWER_VERB} ${name.toLowerCase()}`} disabled={busy} onClick={() => climb(f.band)}>
                  {TOWER_VERB}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="r3-board-error" role="alert">
          {error}
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
