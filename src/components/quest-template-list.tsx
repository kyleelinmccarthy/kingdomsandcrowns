"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { QuestTemplateForm } from "./quest-template-form";
import { deleteQuest } from "@/lib/actions/quests";
import { ANYTIME_LABEL, describeSchedule } from "@/lib/utils/schedule-summary";
import { findMissingScheduleDays, formatDayList } from "@/lib/utils/schedule-gaps";

const HIDE_COMPLETED_KEY = "kingdomsandcrowns-hide-completed-quests";

type Subject = { id: string; name: string; color: string | null };

type Quest = {
  id: string;
  title: string;
  subjectId: string;
  description: string | null;
  estimatedMinutes: number | null;
  rewardXp: number | null;
  rewardDescription: string | null;
  rewardAvatarItem: string | null;
  includeInLearningLog: boolean;
  requireNotes: boolean;
};

type Schedule = {
  id: string;
  questId: string;
  frequency: string;
  daysOfWeek: string | null;
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

type AssignmentStatus = { status: string; date: string };

export function QuestTemplateList({
  childId,
  quests,
  subjects,
  childUnlockedItems = [],
  schedules = [],
  schoolDays,
  assignmentStatusByQuest = {},
  blockDaysBySubject = {},
}: {
  childId: string;
  quests: Quest[];
  subjects: Subject[];
  childUnlockedItems?: string[];
  schedules?: Schedule[];
  schoolDays: string[];
  assignmentStatusByQuest?: Record<string, AssignmentStatus>;
  /** Weekdays each discipline has class time on, keyed by subject id. */
  blockDaysBySubject?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [hideCompleted, setHideCompleted] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(HIDE_COMPLETED_KEY);
    if (stored !== null) setHideCompleted(stored === "true");
  }, []);

  function toggleHideCompleted(checked: boolean) {
    setHideCompleted(checked);
    localStorage.setItem(HIDE_COMPLETED_KEY, String(checked));
  }

  const scheduleByQuestId = new Map(schedules.map((s) => [s.questId, s]));

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const assignedAvatarItems = quests
    .filter((q) => q.rewardAvatarItem)
    .map((q) => q.rewardAvatarItem!);

  // A quest is "completed" for filtering purposes only when it's a one-time
  // (non-repeating) quest whose sole assignment has been completed. Repeating
  // quests reset each cycle, so they're never hidden by this toggle.
  const visibleQuests = quests.filter((q) => {
    if (!hideCompleted) return true;
    const isRepeating = scheduleByQuestId.has(q.id);
    if (isRepeating) return true;
    return assignmentStatusByQuest[q.id]?.status !== "completed";
  });

  // A quest dropping out of this list without a word reads as "it got deleted" —
  // which is exactly what happens the moment a repeat is switched off on a quest
  // that has been completed before. Say how many are hidden so it's legible.
  const hiddenCount = quests.length - visibleQuests.length;

  // Group quests by subject
  const grouped = new Map<string, Quest[]>();
  for (const q of visibleQuests) {
    const list = grouped.get(q.subjectId) ?? [];
    list.push(q);
    grouped.set(q.subjectId, list);
  }

  async function handleDelete(questId: string) {
    await deleteQuest(questId);
    router.refresh();
  }

  return (
    <>
      <GameFrame
        title="Assigned Quests"
        icon={<GameIcon name="scroll" className="size-5 text-[var(--gold-bright)]" />}
        action={<Button size="sm" onClick={() => setShowAdd(true)}>New Quest</Button>}
      >
        {quests.length > 0 && (
          <label className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => toggleHideCompleted(e.target.checked)}
            />
            Hide completed quests
            {hiddenCount > 0 && (
              <span className="text-[var(--gold-bright)]">
                ({hiddenCount} hidden)
              </span>
            )}
          </label>
        )}
        {quests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No quests created yet. Create your first quest scroll to begin planning adventures!
          </p>
        ) : visibleQuests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All quests are completed. Uncheck &quot;Hide completed quests&quot; to see them.
          </p>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([subjectId, subjectQuests]) => {
              const subject = subjectMap.get(subjectId);
              return (
                <div key={subjectId}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: subject?.color ?? "#6b7280" }}
                    />
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      {subject?.name ?? "Unknown"}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {subjectQuests.map((q) => (
                      <div
                        key={q.id}
                        className="flex flex-wrap items-center justify-between rounded-md border border-border/50 bg-card/50 px-3 py-2"
                      >
                        {/* basis, not flex-1's zero: a zero basis gives the row
                            no reason to wrap, so the title column is what gets
                            crushed on a phone instead. */}
                        <div className="min-w-0 grow basis-56">
                          <Link
                            href={`/scrolls/${q.id}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {q.title}
                          </Link>
                          {q.estimatedMinutes && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ~{q.estimatedMinutes}min
                            </span>
                          )}
                          {(() => {
                            // Without this, a Mon/Wed quest and an always-available
                            // one look identical here — which is what made removing
                            // a repeat feel like it had done nothing at all.
                            const summary = describeSchedule(scheduleByQuestId.get(q.id) ?? null);
                            const isAnytime = summary === ANYTIME_LABEL;
                            return (
                              <span
                                className={`ml-2 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] ${
                                  isAnytime
                                    ? "border-border/60 text-muted-foreground"
                                    : "border-[var(--gold-dim)] text-[var(--gold-bright)]"
                                }`}
                                title={
                                  isAnytime
                                    ? "No schedule — startable any day until it's completed"
                                    : `Scheduled: ${summary}`
                                }
                              >
                                {summary}
                              </span>
                            );
                          })()}
                          {(() => {
                            // A repeat pointed at days its discipline isn't taught
                            // leaves the quest with no class time to sit in. It
                            // still gets assigned — it just drops to the bottom of
                            // the hero's day — so flag it here rather than letting
                            // the list imply everything is placed.
                            const questSchedule = scheduleByQuestId.get(q.id);
                            if (!questSchedule) return null;
                            const missing = findMissingScheduleDays({
                              repeat: questSchedule,
                              subjectBlockDays: blockDaysBySubject[q.subjectId] ?? [],
                              schoolDays,
                            });
                            if (missing.length === 0) return null;
                            const name = subject?.name ?? "This discipline";
                            return (
                              <span
                                className="ml-2 whitespace-nowrap rounded-full border border-destructive/50 px-1.5 py-0.5 text-[10px] text-destructive"
                                title={`${name} has no class time on ${formatDayList(missing)}, so this quest lands at the bottom of the day with no time on it — last in line for a hero on a structured day.`}
                              >
                                No class time {formatDayList(missing)}
                              </span>
                            );
                          })()}
                          {q.requireNotes && (
                            <span
                              className="ml-2 inline-flex items-center gap-0.5 text-xs text-[var(--gold-bright)]"
                              title="Requires Scribe's Notes to complete"
                            >
                              <GameIcon name="pencil" className="size-3" />
                            </span>
                          )}
                          {q.description && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {q.description}
                            </p>
                          )}
                        </div>
                        <div className="mt-2 ml-auto flex shrink-0 gap-1 sm:mt-0 sm:ml-2">
                          <Button size="sm" variant="outline" className="!border-[var(--gold-border)] hover:!border-[var(--gold-bright)]" onClick={() => setEditingQuest(q)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="!border-[var(--gold-border)] hover:!border-[var(--gold-bright)]" onClick={() => handleDelete(q.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GameFrame>

      <QuestTemplateForm
        childId={childId}
        subjects={subjects}
        open={showAdd}
        onClose={() => setShowAdd(false)}
        childUnlockedItems={childUnlockedItems}
        assignedAvatarItems={assignedAvatarItems}
        schoolDays={schoolDays}
        blockDaysBySubject={blockDaysBySubject}
      />

      {editingQuest && (
        <QuestTemplateForm
          childId={childId}
          subjects={subjects}
          quest={editingQuest}
          schedule={scheduleByQuestId.get(editingQuest.id) ?? null}
          open={true}
          onClose={() => setEditingQuest(null)}
          childUnlockedItems={childUnlockedItems}
          assignedAvatarItems={assignedAvatarItems}
          schoolDays={schoolDays}
          blockDaysBySubject={blockDaysBySubject}
        />
      )}
    </>
  );
}
