"use client";

/**
 * A PLAQUE, read (D13): E at the stone in front of a built plan shows who built each level, when,
 * and the quests whose work paid for it, with the stars the build run earned. The works hold the
 * plaques (`use-works.ts`); this lists the ones for the plan that was read, oldest level first.
 *
 * Everything on it is text a person or a quest title wrote, so it is rendered as text and never as
 * markup. A visiting grown-up reads plaques exactly as the hero does: there is nothing to change here.
 */

import "./plaque-panel.css";
import { GameIcon } from "@/components/game-icon";
import { plaqueLine, type Plaque } from "@/lib/realm/improvements";
import { BoardStars } from "./deed-board";
import { Panel } from "./frame-hud";

const BACK = "Back to the Realm";
export const NOTHING_WRITTEN = "Nothing is written here yet.";

export function PlaquePanel({ improvementId, plaques, onClose }: { improvementId: string; plaques: readonly Plaque[]; onClose: () => void }) {
  const mine = plaques.filter((p) => p.improvementId === improvementId).sort((a, b) => a.level - b.level);
  const title = `${mine[0]?.label ?? "Plaque"} plaque`;
  return (
    <Panel title={title} label={title} className="r3-board--plaque" icon={<GameIcon name="scroll" className="r3-board-icon" />} onClose={onClose}>
      {mine.length === 0 ? (
        <p className="r3-plaque-empty">{NOTHING_WRITTEN}</p>
      ) : (
        <ol className="r3-plaques">
          {mine.map((p) => (
            <li key={p.level} className="r3-plaque">
              <span className="r3-plaque-level">Level {p.level}</span>
              <p className="r3-plaque-line">{plaqueLine(p)}</p>
              <BoardStars stars={p.stars} small />
            </li>
          ))}
        </ol>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          {BACK}
        </button>
      </div>
    </Panel>
  );
}
