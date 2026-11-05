import { GameIcon } from "@/components/game-icon";
import { starsLabel } from "@/lib/realm3d/talk";
import { MAX_STARS } from "@/lib/utils/deed-scoring";

const SLOTS = Array.from({ length: MAX_STARS }, (_, i) => i + 1);

/**
 * A side quest's stars, lit up to `stars`, named for a screen reader. The Realm board and the
 * page's result card draw the same row in their own clothes, so the look comes in as classes.
 */
export function StarRow({ stars, className, starClass, onClass, offClass = "" }: { stars: number; className: string; starClass: string; onClass: string; offClass?: string }) {
  return (
    <span className={className} role="img" aria-label={starsLabel(stars)}>
      {SLOTS.map((n) => (
        <GameIcon key={n} name="star" className={`${starClass} ${n <= stars ? onClass : offClass}`.trim()} />
      ))}
    </span>
  );
}
