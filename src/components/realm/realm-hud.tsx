"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import { formatLap } from "@/lib/realm/recess/recess";

export function RealmHud({
  heroName,
  minutesRemaining,
  preview,
  hudScale,
  selector,
  paused,
  mana,
  cleared,
  recess,
  ride,
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
  mana: number | null;
  cleared: number | null;
  recess: { gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null } | null;
  ride: { riding: boolean; disabled: boolean; onToggle: () => void } | null;
  crown?: { label: string; color: string } | null; // the hero's crown for the session, as a badge
  ceremony?: { onSkip: () => void } | null; // non-null while the ceremony plays
  help?: { onOpen: () => void; disabled: boolean } | null;
}) {
  return (
    <div className="realm-hud" style={{ fontSize: `${hudScale}em` }}>
      <div className="realm-hud-row">
        <span className="realm-hud-name">{heroName}</span>
        {minutesRemaining !== null && <span className="realm-hud-minutes">{minutesRemaining} min left{paused ? " · paused" : ""}</span>}
        {mana !== null && (
          <span className="realm-hud-mana" role="progressbar" aria-label="Mana" aria-valuemin={0} aria-valuemax={MANA_MAX} aria-valuenow={Math.round(mana)}>
            <span className="realm-hud-mana-fill" style={{ width: `${(mana / MANA_MAX) * 100}%` }} />
            <span className="realm-hud-mana-text">Mana {Math.round(mana)}</span>
          </span>
        )}
        {cleared !== null && <span className="realm-hud-cleared">Cleared: {cleared}</span>}
        {recess && <span className="realm-hud-cleared">Gleams: {recess.gleams}</span>}
        {recess && (
          <span className="realm-hud-cleared">
            Laps: {recess.laps}
            {recess.bestLapMs !== null && ` · Best ${formatLap(recess.bestLapMs)} s`}
            {recess.lapMs !== null && ` · ${formatLap(recess.lapMs)} s`}
          </span>
        )}
        {ride && (
          <Button size="sm" variant="outline" className="realm-hud-ride" disabled={ride.disabled} onClick={ride.onToggle}>
            {ride.riding ? "Dismount" : "Ride"}
          </Button>
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
