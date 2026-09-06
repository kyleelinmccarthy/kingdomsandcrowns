import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import type { RunSummary } from "@/lib/actions/deeds";

export function DeedResults({ summary, deedTitle, onDone, doneLabel = "Back to deeds" }: { summary: RunSummary; deedTitle: string; onDone: () => void; doneLabel?: string }) {
  return (
    <div className="space-y-4 text-center">
      <GameIcon name={summary.flawless ? "star" : "check"} className="mx-auto size-10 text-[var(--gold-bright)]" />
      <h3 className="text-lg font-bold">{summary.flawless ? "Flawless!" : "Deed done!"}</h3>
      <p className="text-sm">{summary.correctCount} of {summary.total} right in {deedTitle}.</p>
      {summary.masteryChanges.length > 0 && (
        <ul className="space-y-1 text-sm">
          {summary.masteryChanges.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        {summary.building.complete
          ? `${summary.building.label} is built!`
          : `${summary.building.label}: ${summary.building.done} of ${summary.building.total} deeds`}
      </p>
      <Button onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
