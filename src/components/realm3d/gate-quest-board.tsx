"use client";

/**
 * THE QUEST BOARD ON THE GATE (spec §4.5). A child at 0 minutes can earn time without walking
 * into the world: this lists the village's side quests under the villager who asks for each, and
 * a villager picked here opens their own `DeedBoard` — the same board, the same runs, the same
 * pay as talking to them in the world. Only the list is new.
 *
 * Props in, callbacks out: the gate (`quiet-gate.tsx`) owns the kingdom and what a run's result
 * does to it.
 */

import { useEffect, useState } from "react";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import type { BuildingOverview } from "@/lib/services/deeds";
import { villagerForBuilding } from "@/lib/realm/villagers";
import { interactVerb } from "@/lib/realm3d/frame";
import { SIDE_QUESTS } from "@/lib/utils/side-quest-copy";
import { DeedBoard, type DeedResult } from "./deed-board";
import { Panel } from "./frame-hud";

/** The gate's board with nothing to play on it (the village did not load, or has no side quests yet): an invitation, not a blank. */
export const GATE_BOARD_EMPTY = "The villagers are resting just now. Walk in the quiet Realm to say hello, and come back for side quests soon.";
/** A finished run's way out on the gate: back to this list, not into the world. */
const BACK_TO_LIST = "Back to the side quests";

export function GateQuestBoard({
  childId,
  buildings,
  heroName,
  numerals,
  profile,
  calm,
  timezone,
  onResult,
  onClose,
}: {
  childId: string;
  buildings: readonly BuildingOverview[];
  heroName: string;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** The family's zone, for the season a standing building says it was raised in. */
  timezone?: string | null;
  onResult: (buildingId: string, result: DeedResult) => void;
  onClose: () => void;
}) {
  const [talkingTo, setTalkingTo] = useState<string | null>(null);
  // Every building that has a villager and something to play, in the kingdom's own order.
  const rows = buildings.flatMap((site) => {
    const villager = villagerForBuilding(site.id);
    return villager && site.deeds.length > 0 ? [{ site, villager }] : [];
  });

  const open = rows.find((r) => r.site.id === talkingTo);
  // Esc steps back one board: from a villager to the list, from the list to the gate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (talkingTo) setTalkingTo(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [talkingTo, onClose]);

  if (open) {
    return (
      <DeedBoard
        childId={childId}
        villager={open.villager}
        site={open.site}
        viewer="child"
        heroName={heroName}
        waiting={false}
        numerals={numerals}
        profile={profile}
        calm={calm}
        timezone={timezone}
        onResult={onResult}
        onClose={() => setTalkingTo(null)}
        doneLabel={BACK_TO_LIST}
        runContext="gate"
      />
    );
  }

  return (
    <Panel title={SIDE_QUESTS} label={SIDE_QUESTS} wide className="r3-board--gate" icon={<GameIcon name="scroll" className="r3-board-icon" />} onClose={onClose}>
      {rows.length === 0 && <p className="r3-deed-story">{GATE_BOARD_EMPTY}</p>}
      <ul className="r3-deeds">
        {rows.map(({ site, villager }) => (
          <li key={site.id} className="r3-deed">
            <GameIcon name={site.icon as GameIconName} className="r3-board-icon" />
            <div className="r3-deed-text">
              <p className="r3-deed-title">
                {villager.name} <span className="r3-deed-story">· {site.label}</span>
              </p>
              <ul className="r3-gate-deeds">
                {site.deeds.map((d) => (
                  <li key={d.id} className="r3-deed-story">
                    {d.title}
                  </li>
                ))}
              </ul>
            </div>
            <div className="r3-deed-actions">
              <button type="button" className="r3-menu-item r3-menu-item--go r3-deed-go" onClick={() => setTalkingTo(site.id)}>
                {interactVerb({ kind: "villager", id: villager.id, label: villager.name })}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          Back to the gate
        </button>
      </div>
    </Panel>
  );
}
