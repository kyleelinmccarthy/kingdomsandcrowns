"use client";

/**
 * THE SATCHEL (slice 3, "minutes, quieter"): the HUD's headline is the kingdom now. Top left, under
 * the objective card, it shows what the hero's quests brought (each material they hold, an icon and
 * a count, or pips at simple depth) and the plan they pinned, with what it still waits on
 * (`planLine`). The pin is read through `activePin`, so a finished plan is no pin here either.
 *
 * It reads the frame's works (`use-works.ts`), so a build or a pin shows at once. Display only: a
 * visiting grown-up sees the same block. With nothing held and nothing pinned it is not drawn.
 */

import "./satchel.css";
import { GameIcon } from "@/components/game-icon";
import { IMPROVEMENTS, planLine, planState } from "@/lib/realm/improvements";
import { MATERIALS, MATERIAL_IDS, materialPhrase } from "@/lib/realm/materials";
import { activePin, type Works } from "@/lib/realm/works-state";
import { Progress } from "./frame-hud";

/** A big heap still fits the block: past this many, the pips stop and the count is said in full. */
const MAX_PIPS = 10;

export function SatchelHud({ works, raised, numerals }: { works: Works; raised: ReadonlySet<string>; numerals: boolean }) {
  const held = MATERIAL_IDS.filter((m) => (works.balance[m] ?? 0) > 0);
  const pin = activePin(works);
  const plan = pin ? planState({ built: works.built, raised, balance: works.balance }).find((p) => p.id === pin) : undefined;
  if (held.length === 0 && !plan) return null;
  return (
    <section className="r3-satchel r3-plank" aria-label="Your satchel">
      <p className="r3-satchel-tab">Satchel</p>
      {held.length > 0 && (
        <ul className="r3-satchel-items">
          {held.map((m) => {
            const n = works.balance[m];
            const phrase = materialPhrase(n, m);
            return (
              <li key={m} className="r3-satchel-item" title={phrase} style={{ ["--r3-material" as string]: MATERIALS[m].color }}>
                <GameIcon name={MATERIALS[m].icon} className="r3-satchel-icon" />
                {numerals ? (
                  <span className="r3-satchel-count" role="img" aria-label={phrase}>
                    {n}
                  </span>
                ) : (
                  <Progress done={Math.min(n, MAX_PIPS)} total={Math.min(n, MAX_PIPS)} numerals={false} text="" label={phrase} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {plan && (
        <div className="r3-satchel-plan">
          <p className="r3-satchel-plan-tab">Pinned plan</p>
          <p className="r3-satchel-plan-name">
            <GameIcon name="scroll" className="r3-satchel-plan-icon" />
            {IMPROVEMENTS[plan.id].label}
          </p>
          <p className="r3-satchel-plan-line">{planLine(plan)}</p>
        </div>
      )}
    </section>
  );
}
