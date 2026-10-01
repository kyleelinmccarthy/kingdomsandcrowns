import { QuestAssignmentCard } from "@/components/quest-assignment-card";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { formatMissedDate, type MakeupReason } from "@/lib/utils/makeup";

type AssignmentWithDetails = {
  assignment: {
    id: string;
    status: string;
    date: string;
    notes: string | null;
    statusReason: string | null;
  };
  quest: {
    id: string;
    title: string;
    description: string | null;
    estimatedMinutes: number | null;
    rewardXp: number | null;
    rewardDescription: string | null;
    rewardAvatarItem: string | null;
    requireNotes: boolean;
  };
  subject: { id: string; name: string; color: string | null };
};

/**
 * Work carried over from earlier days: quests a hero never got to, and quests
 * they got stuck on and had to move past.
 *
 * Deliberately its own panel rather than being folded into Today's Quests.
 * Today's board is a plan — on a structured day it is walked in order — and
 * yesterday's leftovers are not part of that plan. Kept separate, they can be
 * worked in any order, at any point in the day, without moving the quest that
 * is actually next.
 *
 * Nothing here is a punishment: a grown-up can retire any of it with one tap
 * ("Not Needed"), which is just a skip and reads as one on the record.
 */
export function MakeupQuests({
  assignments,
  today,
  isChildView,
  allowChildSkip = false,
  reason = null,
}: {
  assignments: AssignmentWithDetails[];
  /** The date the board is being shown for — what "Yesterday" is relative to. */
  today: string;
  isChildView: boolean;
  allowChildSkip?: boolean;
  /** Why this panel is showing, so it can say so. */
  reason?: MakeupReason | null;
}) {
  if (assignments.length === 0) return null;

  return (
    <GameFrame
      title={isChildView ? "Catch-Up Quests" : "Missed Quests"}
      icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {blurb(isChildView, reason, assignments.length)}
      </p>
      <div className="min-w-0 space-y-2">
        {assignments.map((a) => (
          <QuestAssignmentCard
            key={a.assignment.id}
            data={a}
            isChildView={isChildView}
            /* Catch-up work sits outside today's schedule, so today's running
               order never locks it — see the structured-mode note on the card. */
            structuredNext={null}
            allowChildSkip={allowChildSkip}
            missedFrom={formatMissedDate(a.assignment.date, today)}
          />
        ))}
      </div>
    </GameFrame>
  );
}

function blurb(isChildView: boolean, reason: MakeupReason | null, count: number): string {
  const quests = count === 1 ? "quest" : "quests";
  if (isChildView) {
    if (reason === "marked_day") {
      return `Today is a make-up day — here ${count === 1 ? "is" : "are"} ${count} ${quests} from earlier in the week. Finish what you can, in any order.`;
    }
    if (reason === "makeup_weekday") {
      return `Today is your catch-up day. ${count} ${quests} from earlier in the week ${count === 1 ? "is" : "are"} waiting — do them in any order.`;
    }
    return `${count} ${quests} you didn't finish earlier. They don't lock anything — do them whenever you like.`;
  }
  return `${count} ${quests} still owed from earlier days. Finish one with this hero, or mark it Not Needed to take it off their list for good.`;
}
