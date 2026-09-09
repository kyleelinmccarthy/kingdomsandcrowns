"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import {
  createAssignment,
  completeAssignment,
  getQuestFormData,
  markAssignmentStuck,
} from "@/lib/actions/quest-assignments";
import { useQuestTimer } from "@/hooks/use-quest-timer";
import { useBrowserToday } from "@/hooks/use-browser-today";
import { formatTimeOfDay } from "@/lib/utils/schedule-days";
import { hasMeaningfulNotes } from "@/lib/utils/sanitize";
import {
  earliestBlockBySubject,
  blockStatus,
  getOrderedAvailableQuests,
  getStructuredQuestQueue,
} from "@/lib/utils/quest-ordering";
import type { SchoolingMode } from "@/lib/utils/schooling-mode";

type Subject = {
  id: string;
  name: string;
  color: string | null;
};

type Quest = {
  id: string;
  subjectId: string;
  title: string;
  description: string | null;
  estimatedMinutes: number | null;
  hasSchedule: boolean;
  requireNotes: boolean;
  sortOrder: number;
};

type TodayAssignment = {
  assignment: { id: string; status: string };
  quest: { id: string };
};

type ScheduleBlock = {
  subjectId: string;
  startTime: string;
  endTime: string;
};

export function QuestForm({
  childId,
  subjects,
  quests,
  todayAssignments,
  todaysBlocks = [],
  nowTime,
  latestStatusByQuestId = {},
  today,
  initialSchoolingMode = "unstructured",
  isChildView = false,
}: {
  childId: string;
  subjects: Subject[];
  quests: Quest[];
  todayAssignments: TodayAssignment[];
  todaysBlocks?: ScheduleBlock[];
  nowTime?: string;
  latestStatusByQuestId?: Record<string, { status: string; date: string }>;
  today: string;
  initialSchoolingMode?: SchoolingMode;
  /**
   * Whether a hero is looking at their own day. Gates the "I'm Stuck" escape
   * hatch — in structured mode this panel serves one quest at a time, so
   * without it a hero who can't finish the quest on top has nowhere to go.
   */
  isChildView?: boolean;
}) {
  const router = useRouter();
  const { startTimer } = useQuestTimer();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [showDuration, setShowDuration] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [stuckReason, setStuckReason] = useState("");

  // Corrects "today"/"now" against the hero's actual browser clock — the
  // server's guess (used for the first paint) can be a day off right around
  // midnight. When the calendar date itself turns out to be wrong, refetch
  // everything for the corrected date.
  const { date: browserToday, time: browserNowTime, dateChanged } = useBrowserToday(today, nowTime ?? "");
  const [freshData, setFreshData] = useState<{
    todayAssignments: TodayAssignment[];
    todaysBlocks: ScheduleBlock[];
    latestStatusByQuestId: Record<string, { status: string; date: string }>;
    effectiveMode: SchoolingMode;
  } | null>(null);

  useEffect(() => {
    if (!dateChanged) return;
    let cancelled = false;
    getQuestFormData(childId, browserToday).then((data) => {
      if (!cancelled) setFreshData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [dateChanged, browserToday, childId]);

  const effectiveTodayAssignments = freshData?.todayAssignments ?? todayAssignments;
  const effectiveTodaysBlocks = freshData?.todaysBlocks ?? todaysBlocks;
  const effectiveLatestStatusByQuestId = freshData?.latestStatusByQuestId ?? latestStatusByQuestId;
  const effectiveMode = freshData?.effectiveMode ?? initialSchoolingMode;

  // Build a map from questId -> existing assignment id for today
  const assignmentByQuestId = new Map(
    effectiveTodayAssignments.map((a) => [a.quest.id, a.assignment.id])
  );

  const blockBySubjectId = earliestBlockBySubject(effectiveTodaysBlocks);

  // Available quests today, sorted by schedule priority (current > upcoming >
  // past > unscheduled) — the order the unstructured dropdown offers them in,
  // so what's happening right now is preselected.
  const sortedQuests = getOrderedAvailableQuests({
    quests,
    todayAssignments: effectiveTodayAssignments,
    latestStatusByQuestId: effectiveLatestStatusByQuestId,
    todaysBlocks: effectiveTodaysBlocks,
    nowTime: browserNowTime || nowTime,
  });

  // Structured mode instead walks the day in plain schedule order and unlocks
  // only index 0. It has to be this clock-independent queue and not
  // sortedQuests: the server enforces the same lock, and a "what's current
  // now" ordering drifts as the day passes, so the two could disagree and
  // reject the quest this form had just offered. It also means a quest missed
  // this morning stays next, to be finished before moving on.
  const structuredQueue = getStructuredQuestQueue({
    quests,
    todayAssignments: effectiveTodayAssignments,
    latestStatusByQuestId: effectiveLatestStatusByQuestId,
    todaysBlocks: effectiveTodaysBlocks,
  });

  const [selectedQuestId, setSelectedQuestId] = useState(sortedQuests[0]?.id ?? "");

  // A completed quest drops out of sortedQuests on the router.refresh() after
  // a submit, but selectedQuestId is otherwise never touched — resync it so a
  // stale id can't leave the form pointed at a quest that no longer exists
  // (which made the next Quick Complete silently no-op).
  useEffect(() => {
    if (selectedQuestId && !sortedQuests.some((q) => q.id === selectedQuestId)) {
      setSelectedQuestId(sortedQuests[0]?.id ?? "");
    }
  }, [selectedQuestId, sortedQuests]);

  const nextQuest = structuredQueue[0] ?? null;
  const activeQuestId = effectiveMode === "structured" ? nextQuest?.id ?? "" : selectedQuestId;
  const activeQuest = sortedQuests.find((q) => q.id === activeQuestId);
  const activeSubject = subjects.find((s) => s.id === activeQuest?.subjectId);
  const activeBlock = activeQuest ? blockBySubjectId.get(activeQuest.subjectId) : undefined;
  const activeStatus = blockStatus(activeBlock, browserNowTime || nowTime);
  const lockedQuests = effectiveMode === "structured" ? structuredQueue.slice(1) : [];

  /** Return the existing assignment ID or create a new one */
  async function getOrCreateAssignment(questId: string): Promise<string> {
    const existing = assignmentByQuestId.get(questId);
    if (existing) return existing;
    const { id } = await createAssignment({
      questId,
      childId,
      date: browserToday,
    });
    return id;
  }

  async function handleStartTimer() {
    if (!activeQuestId) return;
    setSaving(true);
    setError("");
    try {
      const assignmentId = await getOrCreateAssignment(activeQuestId);
      startTimer(assignmentId);
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start quest");
    } finally {
      setSaving(false);
    }
  }

  const parsedDuration = parseInt(manualDuration, 10);
  const isDurationValid =
    manualDuration.trim() !== "" && Number.isFinite(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 480;
  const notesRequired = !!activeQuest?.requireNotes;
  const hasRequiredNotes = !notesRequired || hasMeaningfulNotes(description);

  async function handleQuickComplete() {
    if (!activeQuestId || !activeQuest || !isDurationValid || !hasRequiredNotes) return;
    setSaving(true);
    setError("");
    try {
      const assignmentId = await getOrCreateAssignment(activeQuestId);
      await completeAssignment(assignmentId, {
        title: activeQuest.title,
        description: description || (activeQuest.description ?? undefined),
        durationMinutes: parsedDuration,
        source: "manual",
      });
      setDescription("");
      setManualDuration("");
      setShowDuration(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete quest");
    } finally {
      setSaving(false);
    }
  }

  /**
   * "I'm stuck" — the way past a quest a hero genuinely can't finish. It needs
   * no parent permission (skipping does): being unable to do the work and
   * being unable to move are different problems, and only the first is the
   * hero's to sit with. A grown-up is alerted every time, and saying what went
   * wrong is required — it is the part of that alert they can act on.
   */
  async function handleStuck() {
    if (!activeQuestId || stuckReason.trim() === "") return;
    setSaving(true);
    setError("");
    try {
      const assignmentId = await getOrCreateAssignment(activeQuestId);
      await markAssignmentStuck(assignmentId, stuckReason.trim());
      setStuckReason("");
      setShowStuck(false);
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set this quest aside");
    } finally {
      setSaving(false);
    }
  }

  if (quests.length === 0) {
    return (
      <GameFrame title="Start a Quest" icon={<GameIcon name="swords" className="size-5 text-[var(--gold-bright)]" />}>
        <div className="py-3 text-center text-sm text-muted-foreground">
          No quests have been forged yet. Ask your parent to create some!
        </div>
      </GameFrame>
    );
  }

  if (sortedQuests.length === 0) {
    return (
      <GameFrame title="Start a Quest" icon={<GameIcon name="swords" className="size-5 text-[var(--gold-bright)]" />}>
        <div className="py-3 text-center text-sm text-muted-foreground">
          All of today&apos;s quests are complete. Well done, hero!
        </div>
      </GameFrame>
    );
  }

  return (
    <GameFrame title="Start a Quest" icon={<GameIcon name="swords" className="size-5 text-[var(--gold-bright)]" />}>
      <div>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {effectiveMode === "unstructured" ? (
          <div className="space-y-2">
            <Label htmlFor="quest-select">Choose a Quest</Label>
            <Select
              id="quest-select"
              value={selectedQuestId}
              onChange={(e) => {
                setSelectedQuestId(e.target.value);
                setShowDuration(false);
                setManualDuration("");
              }}
            >
              {sortedQuests.map((q) => {
                const sub = subjects.find((s) => s.id === q.subjectId);
                const block = blockBySubjectId.get(q.subjectId);
                const status = blockStatus(block, browserNowTime || nowTime);
                const statusSuffix =
                  status === "current" ? " · now" : status === "upcoming" ? " · upcoming" : status === "past" ? " · missed" : "";
                const timeLabel = block ? `, ${formatTimeOfDay(block.startTime)}${statusSuffix}` : "";
                return (
                  <option key={q.id} value={q.id}>
                    {q.title}{sub ? ` (${sub.name}${timeLabel})` : ""}
                  </option>
                );
              })}
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Up next, in today&apos;s schedule order:</p>
        )}

        {activeQuest && (
          <div className="space-y-2 rounded-md border border-border/30 bg-card/30 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {activeSubject && (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: activeSubject.color ?? "#6b7280" }}
                />
              )}
              <span
                className="break-words text-base font-bold"
                style={{
                  color:
                    activeStatus === "upcoming" || activeStatus === "past"
                      ? "var(--foreground)"
                      : "var(--gold-bright)",
                }}
              >
                {activeQuest.title}
              </span>
              {activeQuest.estimatedMinutes && (
                <span className="text-sm text-muted-foreground">
                  ~{activeQuest.estimatedMinutes}min
                </span>
              )}
              {activeBlock && (
                <span
                  className={`text-xs font-medium ${
                    activeStatus === "current"
                      ? "text-[var(--gold-bright)]"
                      : activeStatus === "past"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {activeStatus === "current"
                    ? "Scheduled now"
                    : activeStatus === "upcoming"
                      ? "Not due yet — scheduled for"
                      : "Missed — was scheduled for"}{" "}
                  {formatTimeOfDay(activeBlock.startTime)}–{formatTimeOfDay(activeBlock.endTime)}
                </span>
              )}
            </div>
            {activeQuest.description && (
              <p className="text-sm text-muted-foreground">
                {activeQuest.description}
              </p>
            )}
          </div>
        )}

        {lockedQuests.length > 0 && (
          <div className="space-y-1.5">
            {lockedQuests.map((q) => {
              const sub = subjects.find((s) => s.id === q.subjectId);
              return (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/20 bg-card/10 px-3 py-2 opacity-50"
                >
                  <GameIcon name="lock" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="break-words text-sm">
                    {q.title}{sub ? ` (${sub.name})` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground sm:ml-auto">
                    Complete &quot;{nextQuest?.title}&quot; to unlock
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="quest-notes">
            Scribe&apos;s Notes {notesRequired ? "(required)" : "(optional)"}
          </Label>
          <Input
            id="quest-notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Learned how to multiply fractions"
            required={notesRequired}
          />
        </div>

        {showStuck && (
          <div className="space-y-2 rounded-md border border-[var(--gold-border)]/50 bg-[rgba(201,168,76,0.06)] px-3 py-2">
            <Label htmlFor="stuck-reason">What&apos;s got you stuck?</Label>
            <Input
              id="stuck-reason"
              value={stuckReason}
              onChange={(e) => setStuckReason(e.target.value)}
              placeholder="e.g. I don't understand step 3"
              required
            />
            <p className="text-xs text-muted-foreground">
              This quest moves aside for today and your grown-up is told, so they can come and help.
            </p>
          </div>
        )}

        {showDuration && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={manualDuration}
              onChange={(e) => setManualDuration(e.target.value)}
              placeholder="min"
              min={1}
              max={480}
              required
              className="w-24"
              aria-label="Duration in minutes"
            />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleStartTimer} disabled={saving || !activeQuest} className="gap-2">
            {saving ? (
              "Starting..."
            ) : (
              <>
                <GameIcon name="timer" className="size-4 text-[var(--gold-bright)]" />
                Start Timer
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (showDuration) {
                handleQuickComplete();
              } else {
                setManualDuration(activeQuest?.estimatedMinutes ? String(activeQuest.estimatedMinutes) : "");
                setShowDuration(true);
              }
            }}
            disabled={saving || !activeQuest || (showDuration && (!isDurationValid || !hasRequiredNotes))}
            className="gap-2 !border-[var(--gold-bright)]"
          >
            {saving ? (
              "Saving..."
            ) : showDuration ? (
              <>
                <GameIcon name="check" className="size-4 text-[var(--gold-bright)]" />
                Submit
              </>
            ) : (
              <>
                <GameIcon name="check" className="size-4 text-[var(--gold-bright)]" />
                Quick Complete
              </>
            )}
          </Button>
          {showDuration && (
            <Button variant="ghost" onClick={() => setShowDuration(false)} disabled={saving}>
              Cancel
            </Button>
          )}
          {/* A hero can always move on from work they can't finish — no parent
              permission needed, unlike skipping. The grown-ups are told. */}
          {isChildView && (
            <Button
              variant="ghost"
              onClick={() => {
                if (showStuck) {
                  handleStuck();
                } else {
                  setShowDuration(false);
                  setStuckReason("");
                  setShowStuck(true);
                }
              }}
              disabled={saving || !activeQuest || (showStuck && stuckReason.trim() === "")}
            >
              {saving && showStuck ? "Sending..." : showStuck ? "Get Help & Move On" : "I'm Stuck"}
            </Button>
          )}
          {showStuck && (
            <Button variant="ghost" onClick={() => setShowStuck(false)} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </GameFrame>
  );
}
