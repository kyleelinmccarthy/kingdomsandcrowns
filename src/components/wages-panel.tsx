import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { formatWagesAsCoin, formatWagesAsDollars } from "@/lib/utils/wages";

export function WagesPanel({
  balanceCents,
  isChildView,
}: {
  balanceCents: number;
  isChildView: boolean;
}) {
  const display = isChildView
    ? formatWagesAsCoin(balanceCents)
    : formatWagesAsDollars(balanceCents);

  return (
    <GameFrame>
      <div className="flex items-center gap-3 py-2">
        <GameIcon name="gem" className="size-8 text-[var(--gold-bright)]" />
        <div>
          <p className="text-sm text-muted-foreground">Wages earned</p>
          <p className="text-2xl font-medium">{display}</p>
          {balanceCents < 0 && (
            <p className="text-xs text-muted-foreground">Paid ahead</p>
          )}
        </div>
      </div>
    </GameFrame>
  );
}
