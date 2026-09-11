"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import type { Surfaces } from "@/lib/realm/depth";
import { formatLap } from "@/lib/realm/recess/recess";

export function RealmHud({
  heroName,
  minutesRemaining,
  preview,
  hudScale,
  selector,
  paused,
  recess,
  crown = null,
  ceremony = null,
  help = null,
}: {
  heroName: string;
  minutesRemaining: number | null; // null hides the counter (parent preview)
  preview: boolean; // the badge and the hero selector; the parent's intro line is a problem-lane message now
  hudScale: number;
  selector?: React.ReactNode;
  paused: boolean;
  recess: { gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null } | null;
  crown?: { label: string; color: string } | null; // the hero's crown for the session, as a badge
  ceremony?: { onSkip: () => void } | null; // non-null while the ceremony plays
  help?: { onOpen: () => void; disabled: boolean } | null;
}) {
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em` }}>
      <div className="realm-hud-row">
        <span className="realm-hud-name">{heroName}</span>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
        {recess && <span className="realm-hud-cleared">Gleams: {recess.gleams}</span>}
        {recess && (
          <span className="realm-hud-cleared">
            Laps: {recess.laps}
            {recess.bestLapMs !== null && ` · Best ${formatLap(recess.bestLapMs)} s`}
            {recess.lapMs !== null && ` · ${formatLap(recess.lapMs)} s`}
          </span>
        )}
        {crown && (
          <span className="realm-hud-badge realm-hud-crown" style={{ color: crown.color }}>
            <GameIcon name="crown" className="size-4" /> {crown.label}
          </span>
        )}
        {ceremony && (
          <Button size="sm" variant="outline" className="realm-hud-skip" onClick={ceremony.onSkip}>Skip</Button>
        )}
        {help && (
          <Button size="sm" variant="outline" className="realm-hud-help" aria-label="How to play" disabled={help.disabled} onClick={help.onOpen}>?</Button>
        )}
        {preview && <span className="realm-hud-badge">Previewing {heroName}&apos;s Realm</span>}
        {preview && <span className="realm-hud-selector">{selector}</span>}
        <Link href="/tavern" className="realm-hud-leave">Leave the Realm</Link>
      </div>
    </div>
  );
}

/** Ten pips of ten mana each. A fixed list so the keys are stable and no array is built per frame. */
const MANA_PIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Mana, pinned directly above the ability bar so cost and resource read
 * together (§3.7). Pips for a pre-literate reader, the number itself at full
 * depth — and a numeric accessible name in *both* cases, because pips
 * substitute for numerals on screen, never in the accessible name.
 * An interim tenant: slice 3 gives mana its permanent home on the bar's top edge.
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
