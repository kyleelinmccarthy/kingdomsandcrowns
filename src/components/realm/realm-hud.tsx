"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import type { Surfaces } from "@/lib/realm/depth";
import type { Objective, ObjectiveState } from "@/lib/realm/objective";
import { findBuilding } from "@/lib/utils/kingdom";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { useQuestTimer, formatElapsed } from "@/hooks/use-quest-timer";

/**
 * One progress row, in the one vocabulary the whole programme uses. Pips substitute for
 * numerals *on screen* at simple depth; the accessible name carries the count at BOTH
 * depths, because a pip is not a substitution for a screen reader (§6).
 */
function PipRow({ done, total, numerals, text, label }: { done: number; total: number; numerals: boolean; text: string; label: string }) {
  if (numerals) {
    return (
      <span className="realm-hud-count" role="img" aria-label={label}>
        {text}
      </span>
    );
  }
  return (
    <span className="realm-pips" role="img" aria-label={label}>
      {Array.from({ length: Math.max(0, total) }, (_, i) => (
        <span key={i} className={i < done ? "realm-pip realm-pip--on" : "realm-pip"} />
      ))}
    </span>
  );
}

function ObjectiveRows({ objectives, heroName, preview, numerals }: { objectives: Objective[]; heroName: string; preview: boolean; numerals: boolean }) {
  const [first, ...rest] = objectives;
  if (!first) return null;
  return (
    <>
      <p className="realm-objective-title">
        <GameIcon name={findBuilding(first.buildingId)?.icon ?? "box"} className="size-4" /> {first.label}
      </p>
      {first.villagerName && (
        <p className="realm-objective-line">
          {preview ? `${first.villagerName} is waiting for ${heroName}.` : `${first.villagerName} is waiting.`}
        </p>
      )}
      <PipRow
        done={first.done}
        total={first.total}
        numerals={numerals}
        text={`${first.done} of ${first.total}`}
        label={`${first.done} of ${first.total} ${SIDE_QUESTS_LOWER} done.`}
      />
      {rest.map((o) => (
        <p key={o.buildingId} className="realm-objective-extra">{`${o.label} · ${o.done} of ${o.total}`}</p>
      ))}
    </>
  );
}

/** A suggestion, never a gate: nothing here can disable a Talk (§3.19). */
function ObjectiveCard({ objective, heroName, preview, numerals }: { objective: ObjectiveState; heroName: string; preview: boolean; numerals: boolean }) {
  // A kingdom that failed to load is not a finished kingdom. The card is simply absent and
  // the problem lane carries "The villagers are resting. Try again." instead (§5).
  if (objective.kind === "unknown") return null;
  return (
    <section className="realm-hud-objective realm-hud-plate" aria-label="What to do next" style={{ pointerEvents: "none" }}>
      {objective.kind === "complete" ? (
        // INTERIM COPY. True only until slice 8 makes clearing troubles pay minutes; from
        // then on "Nothing is waiting" is false. Slice 13 owns the final text
        // ("Your kingdom stands. Troubles still gather — clear them and earn more time
        // here.") and moves these two strings together with objective.ts's own.
        <>
          <p className="realm-objective-title">Every building is raised.</p>
          <p className="realm-objective-line">Nothing is waiting. Walk where you like.</p>
        </>
      ) : (
        <ObjectiveRows objectives={objective.objectives} heroName={heroName} preview={preview} numerals={numerals} />
      )}
    </section>
  );
}

/**
 * The one piece of app chrome re-admitted to the open Realm. Every other floating
 * popup is suppressed while the portal is up (globals.css); a running quest timer is
 * the one thing whose whole purpose is to tell a child their chore ran out, so it
 * comes back inside the Realm's own layers as a chip rather than by out-ranking the
 * portal's z-index. Its own component so the timer's 1 Hz tick re-renders 20 bytes
 * of chip and not the whole HUD.
 */
export function RealmTimerChip() {
  const { activeTimer, elapsedSeconds, isPaused } = useQuestTimer();
  if (!activeTimer) return null;
  const elapsed = formatElapsed(elapsedSeconds);
  return (
    <span className="realm-hud-chip" role="img" aria-label={`${isPaused ? "Quest timer paused" : "Quest timer"}: ${elapsed}`}>
      <GameIcon name="timer" className="size-4" />
      {elapsed}
    </span>
  );
}

export function RealmHud({
  heroName,
  minutesRemaining,
  preview,
  hudScale,
  selector,
  paused,
  objective,
  surfaces,
  kingdomDone,
  kingdomTotal,
  recessPill,
  crown = null,
  ceremony = null,
  help = null,
  minimap = null,
  mana = null,
  manaRefused = false,
}: {
  heroName: string;
  minutesRemaining: number | null; // null hides the counter (parent preview)
  preview: boolean; // the parent's view: the badge, the hero selector, and numbers everywhere
  hudScale: number;
  selector?: ReactNode;
  paused: boolean;
  objective: ObjectiveState;
  surfaces: Surfaces;
  kingdomDone: number;
  kingdomTotal: number;
  recessPill: string | null; // "Recess · 3 gleams · 1 lap", or null when recess has produced nothing
  crown?: { label: string; color: string } | null; // the hero's crown for the session, as a badge
  ceremony?: { onSkip: () => void } | null; // non-null while the ceremony plays
  help?: { onOpen: () => void; disabled: boolean } | null;
  minimap?: ReactNode; // the upper-right corner's whole contents; null in a test, and while the world has no layout
  mana?: number | null; // null spends nothing and shows nothing (a parent's preview)
  manaRefused?: boolean; // a cast the hero could not afford; the strip flashes red
}) {
  // A parent reads numbers, never pips (§3.17); a child reads what their depth says.
  const numerals = surfaces.numerals || preview;
  // Four corners, each pass-through (§3.2): the quest log upper-left, the map upper-right,
  // who the hero is and what they hold lower-left, and the ways out lower-right. DOM order IS
  // corner order, which is also what a screen reader and the Tab key walk. Only the buttons,
  // the link and the selector take pointers, so a pointerdown anywhere between the corners
  // reaches the ground mesh and walks the hero. Bottom-centre is left entirely to the ability
  // bar — which is why the mana strip now travels with the hero's name instead of floating
  // above the bar, where it overlapped it below 640px.
  // The values are inline as well as in CSS so a jsdom test can read them (D10.1).
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em`, pointerEvents: "none" }}>
      <ObjectiveCard objective={objective} heroName={heroName} preview={preview} numerals={numerals} />
      <div className="realm-hud-corner" style={{ pointerEvents: "none" }}>{minimap}</div>
      <div className="realm-hud-identity" style={{ pointerEvents: "none" }}>
        <div className="realm-hud-plate">
          <span className="realm-hud-name">{heroName}</span>
          {kingdomTotal > 0 && (
            <PipRow
              done={kingdomDone}
              total={kingdomTotal}
              numerals={numerals}
              text={`${kingdomDone} of ${kingdomTotal} raised`}
              label={`${kingdomDone} of ${kingdomTotal} buildings raised.`}
            />
          )}
        </div>
        <RealmManaPips mana={mana} surfaces={surfaces} refused={manaRefused} />
      </div>
      <div className="realm-hud-meta" style={{ pointerEvents: "none" }}>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
        <RealmTimerChip />
        {crown && (
          <span className="realm-hud-badge realm-hud-crown" style={{ color: crown.color }}>
            <GameIcon name="crown" className="size-4" /> {crown.label}
          </span>
        )}
        {recessPill && <span className="realm-hud-badge">{recessPill}</span>}
        {ceremony && (
          <Button size="sm" variant="outline" className="realm-hud-skip" style={{ pointerEvents: "auto" }} onClick={ceremony.onSkip}>Skip</Button>
        )}
        {help && (
          <Button size="sm" variant="outline" className="realm-hud-help" aria-label="How to play" disabled={help.disabled} style={{ pointerEvents: "auto" }} onClick={help.onOpen}>?</Button>
        )}
        {preview && <span className="realm-hud-badge">Previewing {heroName}&apos;s Realm</span>}
        {preview && <span className="realm-hud-selector" style={{ pointerEvents: "auto" }}>{selector}</span>}
        <Link href="/tavern" className="realm-hud-leave realm-hud-plate" style={{ pointerEvents: "auto" }}>Leave the Realm</Link>
      </div>
    </div>
  );
}

/** Ten pips of ten mana each. A fixed list so the keys are stable and no array is built per frame. */
const MANA_PIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Mana, in the identity corner beside the hero's own name (§3.2): what the hero
 * IS and what the hero HOLDS read together, and bottom-centre is left to the
 * ability bar alone. Pips for a pre-literate reader, the number itself at full
 * depth — and a numeric accessible name in *both* cases, because pips
 * substitute for numerals on screen, never in the accessible name.
 * Exported still, because its own tests render it alone; the HUD is its only caller.
 */
export function RealmManaPips({ mana, surfaces, refused }: { mana: number | null; surfaces: Surfaces; refused: boolean }) {
  if (mana === null) return null; // a parent's preview spends nothing, so it shows nothing
  const value = Math.round(mana);
  const filled = Math.round(value / 10);
  return (
    <div
      className={refused ? "realm-mana-pips realm-mana-pips--refused" : "realm-mana-pips"}
      role="img"
      aria-label={`Mana ${value} of ${MANA_MAX}.`}
    >
      {surfaces.numerals ? (
        <>
          <span>Mana {value}</span>
          <span className="realm-mana-bar" aria-hidden="true">
            <span className="realm-mana-fill" style={{ width: `${(value / MANA_MAX) * 100}%` }} />
          </span>
        </>
      ) : (
        MANA_PIPS.map((pip) => <span key={pip} className={pip <= filled ? "realm-pip realm-pip--on" : "realm-pip"} />)
      )}
    </div>
  );
}

/**
 * Ride, as a round 56px button at the bottom-right beside the ability bar —
 * the exact place slice 3's mount slot will occupy, so nothing moves twice
 * (D6.3). Deleting it outright would leave a touch hero with no way to mount
 * at all, since `M` is the only other way in. `ride.disabled` is what a
 * parent's preview and a running ceremony both use; the button stays visible
 * either way, because a control that vanishes teaches nothing.
 */
export function RealmMountButton({ ride, showStick }: { ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null; showStick: boolean }) {
  if (!ride) return null;
  return (
    <button
      type="button"
      className="realm-mount-button"
      aria-label={ride.riding ? "Get off your mount" : "Ride your mount"}
      disabled={ride.disabled}
      onClick={ride.onToggle}
    >
      {ride.riding ? "Dismount" : "Ride"}
      {!showStick && <span className="realm-mount-key" aria-hidden="true">M</span>}
    </button>
  );
}

/**
 * Cast, for a hero with no keyboard and no left click (§4.5). A dedicated button rather
 * than a second tap on the page itself: tap-to-select-then-tap-again-to-fire is the
 * hidden second meaning this slice deletes everywhere else, and task 8 already made a
 * tap and its number key mean the same one thing.
 *
 * It sits in the bottom-right corner, opposite the stick: left thumb walks, right thumb
 * casts, which is the layout every game a child has already played uses. `disabled`
 * carries "nothing is chosen" and "you are on a mount" — it stays visible either way,
 * because a control that vanishes teaches nothing. Nothing here decides whether the cast
 * lands: task 9's targeting rule refuses an out-of-range cast in the sim, with red pips
 * and no mana spent, whichever way the hero asked for it.
 */
export function RealmCastButton({ onCast, disabled, showStick }: { onCast: () => void; disabled: boolean; showStick: boolean }) {
  if (!showStick) return null; // a keyboard and a mouse both already have a way to cast
  return (
    <button type="button" className="realm-cast-button" disabled={disabled} onClick={onCast} aria-label="Cast">
      Cast
    </button>
  );
}

/**
 * Put the spell away — the verb a touch hero did not have. Task 8 made a chip tap cast
 * rather than toggle, which is right (a tap and its number key must mean one thing), but
 * it left `Escape` as the only way to disarm, and a tablet has no `Escape`: a child who
 * tapped a page once stayed armed for the whole visit, with every ground tap casting.
 *
 * So the way back is its own control rather than a second meaning on the chip:
 *   - it appears only while something is armed, directly above Cast, so the pair reads
 *     as one thought — do it, or put it back;
 *   - it wears a large ✕ — the one glyph a child already reads as "stop this" without
 *     being taught it — drawn by CSS beside the words, for a child who does read;
 *   - it names the spell in its accessible name, because a screen-reader child hears the
 *     button in isolation and "Put away" alone does not say away what.
 * `spellName` null means nothing is armed, so there is nothing to put away and no button.
 */
export function RealmPutAwayButton({ spellName, onPutAway, showStick }: { spellName: string | null; onPutAway: () => void; showStick: boolean }) {
  if (!showStick) return null; // Escape already does this for a keyboard hero
  if (!spellName) return null; // nothing is armed, so there is nothing to put away
  return (
    <button
      type="button"
      className="realm-cast-button realm-cast-button--away"
      onClick={onPutAway}
      aria-label={`Put ${spellName} away`}
    >
      Put away
    </button>
  );
}
