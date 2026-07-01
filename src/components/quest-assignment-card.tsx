"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeAssignment, skipAssignment } from "@/lib/actions/quest-assignments";
import { useQuestTimer, formatElapsed } from "@/hooks/use-quest-timer";
import { GameIcon } from "@/components/game-icon";
import { getRewardItemLabel } from "@/lib/utils/avatar-catalog";

type AssignmentWithDetails = {
  assignment: {
    id: string;
    status: string;
    notes: string | null;
  };
  quest: {
    id: string;
    title: string;
    description: string | null;
    estimatedMinutes: number | null;
    rewardXp: number | null;
    rewardDescription: string | null;
    rewardAvatarItem: string | null;
  };
  subject: {
    id: string;
    name: string;
    color: string | null;
  };
};

export function QuestAssignmentCard({
  data,
  isChildView,
}: {
  data: AssignmentWithDetails;
  isChildView: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [showQuickComplete, setShowQuickComplete] = useState(false);
  const [manualDuration, setManualDuration] = useState("");
  const { activeTimer, elapsedSeconds, isPaused, startTimer, stopTimer, cancelTimer, pauseTimer, resumeTimer } = useQuestTimer();
  const { assignment, quest, subject } = data;

  const isPending = assignment.status === "pending";
  const isCompleted = assignment.status === "completed";
  const isSkipped = assignment.status === "skipped";
  const isTimerRunning = activeTimer?.assignmentId === assignment.id;
  const hasOtherTimer = activeTimer !== null && !isTimerRunning;
  const hasRewards = !!(quest.rewardXp || quest.rewardDescription || quest.rewardAvatarItem);

  function handleStart() {
    startTimer(assignment.id);
  }

  function handleTimerStop() {
    stopTimer();
  }

  async function handleQuickComplete() {
    setActing(true);
    try {
      const duration = manualDuration ? parseInt(manualDuration) : quest.estimatedMinutes ?? undefined;
      await completeAssignment(assignment.id, {
        title: quest.title,
        description: quest.description ?? undefined,
        durationMinutes: duration,
        source: "manual",
      });
      router.refresh();
    } finally {
      setActing(false);
      setShowQuickComplete(false);
    }
  }

  async function handleSkip() {
    setActing(true);
    try {
      await skipAssignment(assignment.id);
      router.refresh();
    } finally {
      setActing(false);
    }
  }

  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        isCompleted
          ? "border-green-500/30 bg-green-500/5"
          : isSkipped
            ? "border-border/30 bg-muted/30 opacity-60"
            : isTimerRunning
              ? "border-primary/40 bg-primary/5"
              : "border-border/50 bg-card/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-3 w-3 shrink-0 rounded-full ${isTimerRunning && !isPaused ? "animate-pulse" : ""}`}
          style={{ backgroundColor: subject.color ?? "#6b7280" }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
              {quest.title}
            </span>
            {isTimerRunning ? (
              <span className={`font-mono text-sm font-semibold ${isPaused ? "text-[var(--gold-bright)]" : "text-primary"}`}>
                {formatElapsed(elapsedSeconds)}{isPaused ? " (paused)" : ""}
              </span>
            ) : (
              quest.estimatedMinutes && (
                <span className="text-xs text-muted-foreground">~{quest.estimatedMinutes}min</span>
              )
            )}
          </div>
          {quest.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{quest.description}</p>
          )}
          {isPending && hasRewards && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {quest.rewardXp && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[rgba(201,168,76,0.15)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gold-bright)]">
                  +{quest.rewardXp} XP
                </span>
              )}
              {quest.rewardDescription && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <GameIcon name="gift" className="size-4 text-[var(--gold-bright)]" /> {quest.rewardDescription.length > 30 ? quest.rewardDescription.slice(0, 30) + "..." : quest.rewardDescription}
                </span>
              )}
              {quest.rewardAvatarItem && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                  <GameIcon name="unlock" className="size-4 text-[var(--gold-bright)]" /> {getRewardItemLabel(quest.rewardAvatarItem)}
                </span>
              )}
            </div>
          )}
          {isCompleted && (
            <span className="text-xs text-green-500">Completed</span>
          )}
          {isSkipped && (
            <span className="text-xs text-muted-foreground">Skipped{assignment.notes ? `: ${assignment.notes}` : ""}</span>
          )}
        </div>

        {/* Timer running actions */}
        {isPending && isTimerRunning && (
          <div className="flex shrink-0 gap-1">
            {isPaused ? (
              <Button size="sm" variant="outline" onClick={resumeTimer} disabled={acting}>
                Resume
              </Button>
            ) : (
              <Button size="sm" onClick={pauseTimer} disabled={acting} className="bg-blue-500 text-white hover:bg-blue-600">
                Pause
              </Button>
            )}
            <Button size="sm" onClick={handleTimerStop} disabled={acting}>
              Stop
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelTimer} disabled={acting}>
              Cancel
            </Button>
          </div>
        )}

        {/* Idle pending actions */}
        {isPending && !isTimerRunning && !showQuickComplete && (
          <div className="flex shrink-0 gap-1">
            {isChildView ? (
              <>
                <Button size="sm" onClick={handleStart} disabled={acting || hasOtherTimer}>
                  Start
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowQuickComplete(true)} disabled={acting} className="!border-[var(--gold-bright)]">
                  Quick Complete
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowQuickComplete(true)} disabled={acting} className="!border-[var(--gold-bright)]">
                  Mark Done
                </Button>
                <Button size="sm" variant="ghost" onClick={handleSkip} disabled={acting}>
                  Skip
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick complete inline form */}
      {isPending && showQuickComplete && !isTimerRunning && (
        <div className="mt-2 flex items-center gap-2 border-t border-border/30 pt-2">
          <Input
            type="number"
            value={manualDuration}
            onChange={(e) => setManualDuration(e.target.value)}
            placeholder={quest.estimatedMinutes ? `${quest.estimatedMinutes}` : "min"}
            min={1}
            max={480}
            className="w-20"
            aria-label="Duration in minutes"
          />
          <span className="text-xs text-muted-foreground">min</span>
          <Button size="sm" onClick={handleQuickComplete} disabled={acting}>
            {acting ? "Saving..." : "Submit"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowQuickComplete(false)} disabled={acting}>
            Cancel
          </Button>
          {isChildView ? null : (
            <Button size="sm" variant="ghost" onClick={handleSkip} disabled={acting} className="ml-auto">
              Skip
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
