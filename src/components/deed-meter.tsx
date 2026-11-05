import { GameIcon } from "@/components/game-icon";
import type { SkillMeter } from "@/lib/utils/mastery";

/** Streak length at which the flame appears: one right first try is just a right answer. */
const FLAME_FROM = 2;

/**
 * The skill's pips and the streak flame, shared by the Realm board and the page's player (styled
 * in globals.css). It names the skill and fills pips only — no numbers, no step names — and
 * calm play keeps the flame but never animates it.
 */
export function DeedMeter({ meter, streak, calm }: { meter: SkillMeter | null; streak: number; calm: boolean }) {
  const flame = streak >= FLAME_FROM;
  if (!meter && !flame) return null;
  return (
    <div className="deed-meter">
      {meter && (
        <div className="deed-meter-skill">
          <span className="deed-meter-label">{meter.skillLabel}</span>
          <span className="deed-meter-pips" role="img" aria-label={`${meter.filled} of ${meter.needed} steps toward getting stronger`}>
            {Array.from({ length: meter.needed }, (_, i) => (
              <span key={i} className={`deed-meter-pip${i < meter.filled ? " deed-meter-pip--lit" : ""}`} />
            ))}
          </span>
        </div>
      )}
      {flame && (
        <span className="deed-meter-streak" data-testid="deed-streak" role="img" aria-label={`${streak} right in a row`}>
          <GameIcon name="fire" className={`deed-meter-flame${calm ? "" : " deed-meter-flame--live"}`} />
          <span className="deed-meter-count" aria-hidden="true">{streak}</span>
        </span>
      )}
    </div>
  );
}
