"use client";

/**
 * THE CARTS (R-D9): on entering the Realm after quests were finished, a short card names what came
 * in and from which quests ("2 Stone from *Fractions p.12* and *Times tables*"). The words are
 * `deliveryLines`'s; the frame decides when it shows (the hero's own view, with something in the
 * carts) and writes it down as seen however it is closed (`realm-game.tsx`'s `go`), so this card
 * only says it and offers the way on.
 *
 * Quest titles are a grown-up's words, so they are rendered as text and never as markup.
 */

import "./delivery-card.css";
import { GameIcon } from "@/components/game-icon";
import { deliveryLines, type Delivery } from "@/lib/realm/works-state";
import { Panel } from "./frame-hud";

export const TO_THE_KINGDOM = "To the kingdom!";

/** "A", "A and B", "A, B and C": the separator before each of `n` words. */
const joiner = (i: number, n: number) => (i === 0 ? "" : i === n - 1 ? " and " : ", ");

export function DeliveryCard({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { title, lines } = deliveryLines(delivery);
  return (
    <Panel title={title} label={title} icon={<GameIcon name="gift" className="r3-board-icon" />} onClose={onClose}>
      <ul className="r3-delivery-lines">
        {lines.map((line) => {
          const words = [...line.titles.map((t) => <em key={t}>{t}</em>), ...(line.more > 0 ? [`${line.more} more`] : [])];
          return (
            <li key={line.phrase} className="r3-delivery-line">
              <b className="r3-delivery-phrase">{line.phrase}</b> from{" "}
              {words.map((w, i) => (
                <span key={i}>
                  {joiner(i, words.length)}
                  {w}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item r3-menu-item--go" data-autofocus onClick={onClose}>
          <GameIcon name="castle" className="r3-menu-icon" /> {TO_THE_KINGDOM}
        </button>
      </div>
    </Panel>
  );
}
