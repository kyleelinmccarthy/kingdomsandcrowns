import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { resultStarsLine } from "@/lib/realm3d/talk";
import { StarRow } from "@/components/star-row";
import { SubjectChip } from "@/components/subject-chip";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import type { SkillArea } from "@/lib/utils/skills";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

export function DeedResults({ summary, deedTitle, area, onDone, doneLabel = `Back to ${SIDE_QUESTS_LOWER}` }: { summary: RunSummary; deedTitle: string; area: SkillArea; onDone: () => void; doneLabel?: string }) {
  const starsLine = resultStarsLine(summary);
  return (
    <div className="space-y-4 text-center">
      <GameIcon name={summary.flawless ? "star" : "check"} className="mx-auto size-10 text-[var(--gold-bright)]" />
      {/* Sentence case here (not the SIDE_QUEST title-case noun): matches "Flawless!" as a short exclamation, not a heading. */}
      <h3 className="text-lg font-bold">{summary.flawless ? "Flawless!" : "Side quest done!"}</h3>
      {summary.kind === "deed" && (
        <StarRow stars={summary.stars} className="flex justify-center gap-1" starClass="size-7" onClass="text-[var(--gold-bright)]" offClass="text-muted-foreground/30" />
      )}
      {starsLine && <p className="text-sm font-semibold">{starsLine}</p>}
      <SubjectChip area={area} size="md" />
      <p className="text-sm">{summary.correctCount} of {summary.total} right in {deedTitle}.</p>
      {summary.masteryChanges.length > 0 && (
        <ul className="space-y-1 text-sm">
          {summary.masteryChanges.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        {summary.building.complete
          ? `${summary.building.label} is built!`
          : `${summary.building.label}: ${summary.building.done} of ${summary.building.total} ${SIDE_QUESTS_LOWER}`}
      </p>
      <Button onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
