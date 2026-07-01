/**
 * Shown instantly in the content area while a destination's server data loads,
 * so tab-to-tab navigation feels responsive instead of frozen. The banner and
 * bottom nav (in the layout) stay put; only this region swaps.
 */
import { GameIcon } from "@/components/game-icon";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-live="polite" aria-busy="true">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <GameIcon
          name="crown"
          className="loading-crown size-10 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]"
        />
        <span className="text-sm tracking-wide">Summoning your realm…</span>
      </div>
    </div>
  );
}
