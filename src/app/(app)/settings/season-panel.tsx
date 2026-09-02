import { CrownBadge } from "@/components/crown-badge";
import { GameIcon } from "@/components/game-icon";
import { seasonLabel, type SeasonRecord } from "@/lib/utils/seasons";

function gradeName(grade: string) {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

/**
 * Read-only. Seasons open, complete, and correct themselves from the grade a
 * grown-up sets, so this panel only explains and shows history.
 */
export function SeasonPanel({
  displayName,
  hasGrade,
  open,
  history,
}: {
  displayName: string;
  hasGrade: boolean;
  open: SeasonRecord | null;
  history: SeasonRecord[];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Seasons &amp; Crowns</h4>
      <div className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5 text-sm">
        {!hasGrade ? (
          <p className="text-muted-foreground">
            Set a grade to begin the season. Each grade is one season, and finishing it earns a crown.
          </p>
        ) : open ? (
          <>
            <p>
              <span className="font-medium">{gradeName(open.grade)}</span>
              <span className="text-muted-foreground"> &middot; Season {open.ordinal} &middot; </span>
              <span>{seasonLabel(open.startDate)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Moving {displayName} up a grade completes this season and earns its crown. A season with no
              quests logged is only relabeled, so a fixed typo never counts as a finished year.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No season is open yet.</p>
        )}
      </div>
      {history.length > 0 && (
        <ul className="space-y-1">
          {history.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-md border border-gold-dim px-3 py-2 text-sm">
              <span>
                {gradeName(s.grade)} <span className="text-muted-foreground">&middot; {seasonLabel(s.startDate)}</span>
              </span>
              {s.crownId ? (
                <CrownBadge crownId={s.crownId} size="sm" showLabel />
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <GameIcon name="crown" className="size-4 opacity-40" /> no crown
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
