"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { createAssignment, completeAssignment } from "@/lib/actions/quest-assignments";
import { useQuestTimer } from "@/hooks/use-quest-timer";
import { formatDate } from "@/lib/utils/dates";

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
};

type TodayAssignment = {
  assignment: { id: string; status: string };
  quest: { id: string };
};

export function QuestForm({
  childId,
  subjects,
  quests,
  todayAssignments,
}: {
  childId: string;
  subjects: Subject[];
  quests: Quest[];
  todayAssignments: TodayAssignment[];
}) {
  const router = useRouter();
  const { startTimer } = useQuestTimer();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [showDuration, setShowDuration] = useState(false);

  // Build a map from questId -> existing assignment id for today
  const assignmentByQuestId = new Map(
    todayAssignments.map((a) => [a.quest.id, a.assignment.id])
  );

  const [selectedQuestId, setSelectedQuestId] = useState(quests[0]?.id ?? "");
  const selectedQuest = quests.find((q) => q.id === selectedQuestId);
  const selectedSubject = subjects.find((s) => s.id === selectedQuest?.subjectId);

  /** Return the existing assignment ID or create a new one */
  async function getOrCreateAssignment(questId: string): Promise<string> {
    const existing = assignmentByQuestId.get(questId);
    if (existing) return existing;
    const today = formatDate(new Date());
    const { id } = await createAssignment({ questId, childId, date: today });
    return id;
  }

  async function handleStartTimer() {
    if (!selectedQuestId) return;
    setSaving(true);
    setError("");
    try {
      const assignmentId = await getOrCreateAssignment(selectedQuestId);
      startTimer(assignmentId);
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start quest");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickComplete() {
    if (!selectedQuestId || !selectedQuest) return;
    setSaving(true);
    setError("");
    try {
      const assignmentId = await getOrCreateAssignment(selectedQuestId);
      const duration = manualDuration
        ? parseInt(manualDuration)
        : selectedQuest.estimatedMinutes ?? undefined;
      await completeAssignment(assignmentId, {
        title: selectedQuest.title,
        description: description || (selectedQuest.description ?? undefined),
        durationMinutes: duration,
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

  if (quests.length === 0) {
    return (
      <GameFrame title="Start a Quest" icon={<GameIcon name="swords" className="size-5 text-[var(--gold-bright)]" />}>
        <div className="py-3 text-center text-sm text-muted-foreground">
          No quests have been forged yet. Ask your parent to create some!
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
            {quests.map((q) => {
              const sub = subjects.find((s) => s.id === q.subjectId);
              return (
                <option key={q.id} value={q.id}>
                  {q.title}{sub ? ` (${sub.name})` : ""}
                </option>
              );
            })}
          </Select>
        </div>

        {selectedQuest && (
          <div className="space-y-2 rounded-md border border-border/30 bg-card/30 px-4 py-3">
            <div className="flex items-center gap-2">
              {selectedSubject && (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedSubject.color ?? "#6b7280" }}
                />
              )}
              <span className="text-base font-bold" style={{ color: "var(--gold-bright)" }}>{selectedQuest.title}</span>
              {selectedQuest.estimatedMinutes && (
                <span className="text-sm text-muted-foreground">
                  ~{selectedQuest.estimatedMinutes}min
                </span>
              )}
            </div>
            {selectedQuest.description && (
              <p className="text-sm text-muted-foreground">
                {selectedQuest.description}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="quest-notes">Scribe&apos;s Notes (optional)</Label>
          <Input
            id="quest-notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Conquered chapter 3 of the ancient tome"
          />
        </div>

        {showDuration && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={manualDuration}
              onChange={(e) => setManualDuration(e.target.value)}
              placeholder={selectedQuest?.estimatedMinutes ? `${selectedQuest.estimatedMinutes}` : "min"}
              min={1}
              max={480}
              className="w-24"
              aria-label="Duration in minutes"
            />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleStartTimer} disabled={saving || !selectedQuestId} className="gap-2">
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
                setShowDuration(true);
              }
            }}
            disabled={saving || !selectedQuestId}
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
        </div>
      </div>
    </GameFrame>
  );
}
