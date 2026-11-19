"use client";

/**
 * THE PLANS BOARD in the keep yard (R-D1, R-D11): E at the board lists what the kingdom could build
 * (`planState`, ready first), with each plan's next level, what it waits on (`planLine`) and what
 * it costs. The hero pins one plan to work toward (`pinPlan`; the gold ! leads here once it is
 * affordable) and builds a ready one: three tasks at the bench (`startBuildRun`), played right here
 * through the villager board's own `DeedRun`, whose summary says what the build did. The works live
 * in the frame (`use-works.ts`); this reads them and hands every change back up.
 *
 * A grown-up visiting reads the same list, with no pin and no build (the server refuses them anyway).
 * Anything that goes wrong is said on the board, which stays open.
 */

import "./plans-board.css";
import { useId, useState, type CSSProperties } from "react";
import { GameIcon } from "@/components/game-icon";
import { pinPlan, readWorks, startBuildRun } from "@/lib/actions/improvements";
import { hostLabel, IMPROVEMENTS, LEVELS, planLine, planState, type PlanStatus } from "@/lib/realm/improvements";
import { MATERIALS, MATERIAL_IDS, materialPhrase } from "@/lib/realm/materials";
import type { Works } from "@/lib/realm/works-state";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { BUILD_HERO_ONLY, deedErrorLine, PLAN_NOT_READY, PLANS_CHANGED } from "@/lib/utils/deed-refusals";
import { DeedRun } from "./deed-board";
import { Panel } from "./frame-hud";

export const PLANS_TITLE = "Kingdom plans";
const BACK = "Back to the Realm";
const BACK_TO_PLANS = "Back to the plans";

type Improvement = NonNullable<RunSummary["improvement"]>;

export function PlansBoard({
  childId,
  works,
  raised,
  readOnly,
  numerals,
  profile,
  calm,
  onPinned,
  onBuilt,
  onWorks,
  onClose,
}: {
  childId: string | null;
  works: Works;
  /** The buildings that stand: a wing is offered once its building is raised. */
  raised: ReadonlySet<string>;
  /** A grown-up visiting, or anyone but the hero: the list only. */
  readOnly: boolean;
  numerals: boolean;
  profile: { readAloud: boolean; untimed: boolean };
  calm: boolean;
  /** The server took the pin (one plan, or none). */
  onPinned: (id: string | null) => void;
  /** A build run finished: what it did, for the works to take in. */
  onBuilt: (improvement: Improvement) => void;
  /** The works as they stand now, read again after the server said the plans changed. */
  onWorks?: (works: Works) => void;
  onClose: () => void;
}) {
  const canAct = !readOnly && childId !== null;
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = useId();
  const icon = <GameIcon name="scroll" className="r3-board-icon" />;

  const act = (work: Promise<unknown>) => {
    setBusy(true);
    setError("");
    work.catch((err: unknown) => setError(deedErrorLine(err))).finally(() => setBusy(false));
  };
  const pin = (id: string) => {
    const next = works.pinned === id ? null : id;
    act(pinPlan(childId!, next).then(() => onPinned(next)));
  };
  // The board asks for the level it shows. If the plans moved on in another tab, it says so and
  // takes a fresh look (M-4), so the list is the kingdom as it stands.
  const build = (id: string, level: number) =>
    act(
      startBuildRun(childId!, id, level).then(setRun, async (err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        if ((message === PLANS_CHANGED || message === PLAN_NOT_READY) && onWorks) onWorks(await readWorks(childId!));
        throw err;
      }),
    );

  if (run) {
    return (
      <Panel title={run.deed.title} label={run.deed.title} wide className="r3-board--deed" icon={icon} onClose={onClose}>
        <DeedRun
          run={run}
          profile={profile}
          calm={calm}
          numerals={numerals}
          onResult={(done) => done.improvement && onBuilt(done.improvement)}
          onClose={() => setRun(null)}
          doneLabel={BACK_TO_PLANS}
        />
      </Panel>
    );
  }

  const rows = planState({ built: works.built, raised, balance: works.balance });
  return (
    <Panel title={PLANS_TITLE} label={PLANS_TITLE} wide className="r3-board--plans" icon={icon} onClose={onClose}>
      {!canAct && <p className="r3-board-sub">{BUILD_HERO_ONLY}</p>}
      {error && (
        <p className="r3-board-error" role="alert">
          {error}
        </p>
      )}
      <ul className="r3-plans">
        {rows.map((s) => (
          <PlanRow key={s.id} status={s} nameId={`${ids}-${s.id}`} pinned={works.pinned === s.id} canAct={canAct} busy={busy} onPin={pin} onBuild={build} />
        ))}
      </ul>
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          {BACK}
        </button>
      </div>
    </Panel>
  );
}

function PlanRow({
  status,
  nameId,
  pinned,
  canAct,
  busy,
  onPin,
  onBuild,
}: {
  status: PlanStatus;
  nameId: string;
  pinned: boolean;
  canAct: boolean;
  busy: boolean;
  onPin: (id: string) => void;
  onBuild: (id: string, level: number) => void;
}) {
  const plan = IMPROVEMENTS[status.id];
  const host = hostLabel(plan.host);
  const done = status.state === "done";
  const cost = done ? {} : plan.levels[status.level - 1].cost;
  return (
    <li className={`r3-plan r3-plan--${status.state}${pinned ? " r3-plan--pinned" : ""}`} aria-labelledby={nameId}>
      <div className="r3-plan-head">
        <span id={nameId} className="r3-plan-name">
          {plan.label}
        </span>
        {host && <span className="r3-plan-host">{host}</span>}
        <span className="r3-plan-level">{done ? planLine(status) : `Level ${status.level} of ${LEVELS}`}</span>
      </div>
      {!done && <p className="r3-plan-line">{planLine(status)}</p>}
      {!done && (
        <div className="r3-plan-cost">
          {MATERIAL_IDS.filter((m) => (cost[m] ?? 0) > 0).map((m) => (
            <span key={m} className="r3-plan-chip" title={materialPhrase(cost[m]!, m)} style={{ "--r3-chip": MATERIALS[m].color } as CSSProperties}>
              <GameIcon name={MATERIALS[m].icon} className="r3-plan-chip-icon" />
              {cost[m]}
              <span className="sr-only"> {MATERIALS[m].label}</span>
            </span>
          ))}
        </div>
      )}
      {canAct ? (
        <div className="r3-plan-actions">
          {/* A finished plan offers no pin, but one pinned before it finished can still be let go. */}
          {(!done || pinned) && (
            <button type="button" className="r3-plan-pin" aria-pressed={pinned} disabled={busy} onClick={() => onPin(status.id)}>
              {pinned ? "Pinned" : "Pin"}
            </button>
          )}
          {status.state === "ready" && (
            <button type="button" className="r3-menu-item r3-menu-item--go r3-plan-build" disabled={busy} onClick={() => onBuild(status.id, status.level)}>
              Build
            </button>
          )}
        </div>
      ) : (
        pinned && <span className="r3-plan-pinned">Pinned</span>
      )}
    </li>
  );
}
