import { QuestAssignmentCard } from "@/components/quest-assignment-card";
import type { QuestReward } from "@/lib/utils/quest-rewards";
import { formatTimeOfDay } from "@/lib/utils/schedule-days";

type ScheduleBlock = {
  id: string;
  subjectId: string;
  startTime: string;
  endTime: string;
};

type Subject = {
  id: string;
  name: string;
  color: string | null;
};

type AssignmentWithDetails = {
  assignment: { id: string; status: string; notes: string | null; statusReason: string | null };
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
  rewards?: QuestReward;
};

/**
 * Lays today's assignments over today's class-time blocks, so a hero sees
 * what to do *when* rather than an unordered pile of quests to sort out
 * themselves.
 */
export function TodaySchedule({
  blocks,
  subjects,
  assignments,
  isChildView,
  structuredNext = null,
  allowChildSkip = false,
  realmEnabled = false,
}: {
  blocks: ScheduleBlock[];
  subjects: Subject[];
  assignments: AssignmentWithDetails[];
  isChildView: boolean;
  /** Structured mode's single unlocked quest, forwarded to each card. */
  structuredNext?: { id: string; title: string } | null;
  /** Whether this hero's parent has allowed them to skip their own quests. */
  allowChildSkip?: boolean;
  /** Whether this hero's Realm is on, forwarded to each card (a finished quest links there). */
  realmEnabled?: boolean;
}) {
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  const assignmentsBySubject = new Map<string, AssignmentWithDetails[]>();
  for (const a of assignments) {
    const list = assignmentsBySubject.get(a.subject.id) ?? [];
    list.push(a);
    assignmentsBySubject.set(a.subject.id, list);
  }

  const scheduledSubjectIds = new Set(blocks.map((b) => b.subjectId));
  const unscheduled = assignments.filter((a) => !scheduledSubjectIds.has(a.subject.id));

  // A time slot may now cover more than one subject (a single morning block
  // holding both Math and Handwriting), so the day is walked slot by slot with
  // the subjects nested inside. Repeating the same "9:00–9:45" header once per
  // subject read like two separate classes at the same time.
  const slots = groupBlocksBySlot(blocks);

  const shownSubjectIds = new Set<string>();

  return (
    <div className="min-w-0 space-y-3">
      {slots.map((slot) => (
        <div key={`${slot.startTime}-${slot.endTime}`} className="space-y-2">
          {slot.blocks.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {formatTimeOfDay(slot.startTime)}–{formatTimeOfDay(slot.endTime)}
              </span>
              <span className="text-xs text-muted-foreground">
                {slot.blocks.length} disciplines in this block
              </span>
            </div>
          )}
          {slot.blocks.map((block) => {
            const subject = subjectsById.get(block.subjectId);
            const alreadyShown = shownSubjectIds.has(block.subjectId);
            const blockAssignments = alreadyShown ? [] : assignmentsBySubject.get(block.subjectId) ?? [];
            if (!alreadyShown) shownSubjectIds.add(block.subjectId);

            return (
              <div key={block.id} className={slot.blocks.length > 1 ? "space-y-2 pl-3" : "space-y-2"}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: subject?.color ?? "#6b7280" }}
                  />
                  {slot.blocks.length === 1 && (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatTimeOfDay(block.startTime)}–{formatTimeOfDay(block.endTime)}
                    </span>
                  )}
                  <span className="min-w-0 break-words text-xs text-muted-foreground">
                    {subject?.name ?? "Unknown subject"}
                  </span>
                </div>
                {blockAssignments.length > 0 ? (
                  <div className="min-w-0 space-y-2 pl-4">
                    {blockAssignments.map((a) => (
                      <QuestAssignmentCard
                        key={a.assignment.id}
                        data={a}
                        isChildView={isChildView}
                        structuredNext={structuredNext}
                        allowChildSkip={allowChildSkip}
                        realmEnabled={realmEnabled}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="pl-4 text-xs italic text-muted-foreground">
                    {alreadyShown ? "Same subject as above" : "No quest assigned for this time yet"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Quests whose subject has no class time today. They're assigned all the
          same — the weekly schedule and a quest's repeat only meet through the
          subject — so they'd otherwise sit here unexplained, last in line on a
          structured day. Say what they are rather than labelling them
          "Unscheduled" and leaving everyone to guess. */}
      {unscheduled.length > 0 && (
        <div className="space-y-2 border-t border-border/30 pt-3">
          <p className="text-xs font-semibold text-muted-foreground">No class time today</p>
          <p className="text-[10px] text-muted-foreground">
            {isChildView
              ? "These aren't on today's schedule, so they come after everything that is."
              : "These disciplines have no class time today, so they sort last — add one to the weekly schedule to give them a slot."}
          </p>
          <div className="space-y-2">
            {unscheduled.map((a) => (
              <QuestAssignmentCard
                key={a.assignment.id}
                data={a}
                isChildView={isChildView}
                structuredNext={structuredNext}
                allowChildSkip={allowChildSkip}
                realmEnabled={realmEnabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Today's blocks collapsed into distinct time slots, earliest first, each holding the subjects taught in it. */
function groupBlocksBySlot(blocks: ScheduleBlock[]) {
  const bySlot = new Map<string, { startTime: string; endTime: string; blocks: ScheduleBlock[] }>();
  for (const block of blocks) {
    const key = `${block.startTime}-${block.endTime}`;
    const slot = bySlot.get(key) ?? { startTime: block.startTime, endTime: block.endTime, blocks: [] };
    slot.blocks.push(block);
    bySlot.set(key, slot);
  }
  return [...bySlot.values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
  );
}
