import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { UpkeepTaskCard, type UpkeepCardData } from "@/components/upkeep-task-card";
import { summarizeUpkeepDay } from "@/lib/utils/upkeep-status";

export function UpkeepTodayList({
  today,
  outstanding,
  isChildView,
  todayDate,
}: {
  today: UpkeepCardData[];
  /** Required tasks from earlier days still not done. */
  outstanding: UpkeepCardData[];
  isChildView: boolean;
  todayDate: string;
}) {
  const summary = summarizeUpkeepDay(today, todayDate);

  if (today.length === 0 && outstanding.length === 0) {
    return (
      <GameFrame>
        <div className="py-4 text-center">
          <GameIcon name="tavern" className="mx-auto size-10 text-[var(--gold-bright)]" />
          <p className="mt-3 text-muted-foreground">
            Nothing to tend today — the hold is in order.
          </p>
        </div>
      </GameFrame>
    );
  }

  return (
    <div className="space-y-6">
      {outstanding.length > 0 && (
        <section className="space-y-3">
          <h2 className="page-title text-2xl">Still owing</h2>
          <p className="text-sm text-muted-foreground">
            {isChildView
              ? "These days have passed, but they can still be done."
              : "Required tasks whose day has passed. They can be done late or excused."}
          </p>
          {outstanding.map((row) => (
            <UpkeepTaskCard
              key={row.assignment.id}
              data={row}
              isChildView={isChildView}
              today={todayDate}
            />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="page-title text-2xl">Today</h2>
          <span className="text-sm text-muted-foreground">
            {summary.done} of {summary.total} done
            {summary.awaitingApproval > 0 && ` · ${summary.awaitingApproval} awaiting approval`}
          </span>
        </div>
        {today.map((row) => (
          <UpkeepTaskCard
            key={row.assignment.id}
            data={row}
            isChildView={isChildView}
            today={todayDate}
          />
        ))}
      </section>
    </div>
  );
}
