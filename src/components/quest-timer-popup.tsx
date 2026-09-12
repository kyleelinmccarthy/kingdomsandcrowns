"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuestTimer, formatElapsed } from "@/hooks/use-quest-timer";
import { completeAssignment, getAssignmentQuestInfo } from "@/lib/actions/quest-assignments";

const BREAK_REMINDER_INTERVAL_SECONDS = 30 * 60;

export function QuestTimerPopup() {
  const router = useRouter();
  const {
    activeTimer,
    elapsedSeconds,
    isPaused,
    stoppedResult,
    stopTimer,
    cancelTimer,
    clearStoppedResult,
    pauseTimer,
    resumeTimer,
  } = useQuestTimer();
  const [acting, setActing] = useState(false);
  const [notes, setNotes] = useState("");
  const [requireNotes, setRequireNotes] = useState(false);
  const [error, setError] = useState("");

  // Number of 30-minute break reminders already shown/dismissed for the
  // current timer session, so each threshold only prompts once.
  const [breakRemindersShown, setBreakRemindersShown] = useState(0);
  const trackedAssignmentId = useRef<string | null>(null);

  useEffect(() => {
    if (activeTimer && activeTimer.assignmentId !== trackedAssignmentId.current) {
      trackedAssignmentId.current = activeTimer.assignmentId;
      setBreakRemindersShown(0);
    } else if (!activeTimer) {
      trackedAssignmentId.current = null;
    }
  }, [activeTimer]);

  // Look up whether the just-stopped quest requires Scribe's Notes before it
  // can be completed — the timer only tracks an assignment id, not quest data.
  useEffect(() => {
    if (!stoppedResult) {
      setRequireNotes(false);
      setNotes("");
      setError("");
      return;
    }
    let cancelled = false;
    getAssignmentQuestInfo(stoppedResult.assignmentId).then((info) => {
      if (!cancelled) setRequireNotes(info?.requireNotes ?? false);
    });
    return () => {
      cancelled = true;
    };
  }, [stoppedResult?.assignmentId]);

  const showBreakReminder =
    !!activeTimer && elapsedSeconds >= BREAK_REMINDER_INTERVAL_SECONDS * (breakRemindersShown + 1);

  function dismissBreakReminder() {
    setBreakRemindersShown((n) => n + 1);
  }

  function handleTakeBreak() {
    dismissBreakReminder();
    pauseTimer();
  }

  // Nothing to show
  if (!activeTimer && !stoppedResult) return null;

  function handleStop() {
    if (!activeTimer) return;
    stopTimer();
  }

  function handleCancel() {
    cancelTimer();
  }

  async function handleComplete() {
    if (!stoppedResult) return;
    if (requireNotes && notes.trim() === "") return;
    setActing(true);
    setError("");
    try {
      await completeAssignment(stoppedResult.assignmentId, {
        description: notes.trim() || undefined,
        durationMinutes: stoppedResult.durationMinutes,
        startedAt: new Date(stoppedResult.startedAt),
        endedAt: new Date(stoppedResult.endedAt),
        source: "timer",
      });
      clearStoppedResult();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete quest");
    } finally {
      setActing(false);
    }
  }

  function handleDiscard() {
    clearStoppedResult();
    router.refresh();
  }

  // Stopped state — show result and ask to complete or discard
  if (stoppedResult) {
    return (
      <div className="quest-timer-popup fixed right-4 top-4 z-50 animate-in fade-in slide-in-from-right-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-[var(--gold-border)] bg-[linear-gradient(180deg,rgba(17,26,46,0.97)_0%,rgba(10,16,30,1)_100%)] px-6 py-4 shadow-[0_0_40px_-10px_rgba(201,168,76,0.2),0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--gold-bright)]">
            Timer Stopped
          </div>
          <div className="font-mono text-3xl font-bold tabular-nums text-foreground">
            {formatElapsed(stoppedResult.durationMinutes * 60)}
          </div>
          <div className="text-sm text-muted-foreground">
            {stoppedResult.durationMinutes} minute{stoppedResult.durationMinutes !== 1 ? "s" : ""}
          </div>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`Scribe's Notes ${requireNotes ? "(required)" : "(optional)"} — what did you do?`}
            required={requireNotes}
            aria-label="Scribe's Notes"
            className="w-64"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleComplete} disabled={acting || (requireNotes && notes.trim() === "")}>
              {acting ? "Saving..." : "Complete Quest"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={acting}>
              Discard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Running / paused state — show live timer
  return (
    <>
      <Dialog open={showBreakReminder} onClose={dismissBreakReminder}>
        <DialogHeader>
          <DialogTitle>Time for a Break?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been working for {formatElapsed(elapsedSeconds)}. Taking a short break can help you stay
          focused and do your best work.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={handleTakeBreak}>
            Stop &amp; Take a Break
          </Button>
          <Button onClick={dismissBreakReminder}>Keep Going</Button>
        </DialogFooter>
      </Dialog>
      <div className="quest-timer-popup fixed right-4 top-4 z-50 animate-in fade-in slide-in-from-right-4">
        <div className={`flex flex-col items-center gap-2 rounded-xl border-2 ${isPaused ? "border-[var(--gold-border)]" : "border-primary/40"} bg-[linear-gradient(180deg,rgba(17,26,46,0.97)_0%,rgba(10,16,30,1)_100%)] px-6 py-4 shadow-[0_0_40px_-10px_rgba(59,130,246,0.2),0_8px_30px_rgba(0,0,0,0.5)]`}>
          <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wider ${isPaused ? "text-[var(--gold-bright)]" : "text-primary"}`}>
            {isPaused ? (
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--gold-bright)]" />
            ) : (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            )}
            {isPaused ? "Paused" : "Quest in Progress"}
          </div>
          <div className={`font-mono text-4xl font-bold tabular-nums ${isPaused ? "text-muted-foreground" : "text-foreground"}`}>
            {formatElapsed(elapsedSeconds)}
          </div>
          <div className="flex gap-2">
            {isPaused ? (
              <Button size="sm" onClick={resumeTimer}>
                Resume
              </Button>
            ) : (
              <Button size="sm" onClick={pauseTimer} className="bg-blue-500 text-white hover:bg-blue-600">
                Pause
              </Button>
            )}
            <Button size="sm" onClick={handleStop} className="bg-red-600 text-white hover:bg-red-700">
              Stop Timer
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
