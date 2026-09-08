import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { CrownBadge } from "@/components/crown-badge";
import { seasonLabel, gradeName, type SeasonWithCeremony } from "@/lib/utils/seasons";

export function CrownsPanel({ history }: { history: SeasonWithCeremony[] }) {
  const earned = history.filter((s) => s.crownId);
  return (
    <GameFrame
      title={`Crowns (${earned.length})`}
      icon={<GameIcon name="crown" className="size-4 text-[var(--gold-bright)]" />}
    >
      {earned.length === 0 ? (
        <div className="py-6 text-center">
          <GameIcon name="crown" className="mx-auto size-10 text-[var(--gold-bright)] opacity-50" />
          <p className="mt-3 text-sm text-muted-foreground">Finish this grade to earn your first crown.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {earned.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2">
              <CrownBadge crownId={s.crownId!} size="lg" />
              <div>
                <p className="text-sm font-medium">{seasonLabel(s.startDate)}</p>
                <p className="text-xs text-muted-foreground">
                  {gradeName(s.grade)} &middot; Season {s.ordinal}
                </p>
                <p className="text-xs text-muted-foreground">{s.ceremonySeenAt ? "Ceremony held" : "Ceremony awaits"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GameFrame>
  );
}
