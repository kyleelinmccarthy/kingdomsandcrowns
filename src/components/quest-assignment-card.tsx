"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  completeAssignment,
  markAssignmentStuck,
  reviseAssignment,
  skipAssignment,
  updateAssignmentNotes,
} from "@/lib/actions/quest-assignments";
import { useQuestTimer, formatElapsed } from "@/hooks/use-quest-timer";
import { GameIcon } from "@/components/game-icon";
import { getRewardItemLabel } from "@/lib/utils/avatar-catalog";
import { hasMeaningfulNotes } from "@/lib/utils/sanitize";

type AssignmentWithDetails = {
  assignment: {
    id: string;
    status: string;
    /** Scribe's Notes — the record of work that was done. */
    notes: string | null;
    /** Why the quest was skipped or set aside. Never Scribe's Notes. */
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
  subject: {
    id: string;
    name: string;
    color: string | null;
  };
};

export function QuestAssignmentCard({
  data,
  isChildView,
  structuredNext = null,
  allowChildSkip = false,
}: {
  data: AssignmentWithDetails;
  isChildView: boolean;
  /**
   * The one quest a hero is allowed to act on right now, when they're in
   * structured mode (null for parents and for unstructured days). Without it
   * this card's own Start / Quick Complete buttons were a way straight around
   * the queue the "Start a Quest" panel enforces — the server rejected the
   * attempt, but only after the hero had filled the form in.
   */
  structuredNext?: { id: string; title: string } | null;
  /**
   * Whether this hero's parent has handed them skipping (child view only —
   * grown-ups always may). Every skip a hero makes raises an alert for the
   * grown-ups, so this is permission, not privacy.
   */
  allowChildSkip?: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [showQuickComplete, setShowQuickComplete] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  const [showNotesEdit, setShowNotesEdit] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [stuckReason, setStuckReason] = useState("");
  const [reviseNote, setReviseNote] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const { activeTimer, elapsedSeconds, isPaused, startTimer, stopTimer, cancelTimer, pauseTimer, resumeTimer } = useQuestTimer();
  const { assignment, quest, subject } = data;

  const isPending = assignment.status === "pending";
  const isCompleted = assignment.status === "completed";
  const isSkipped = assignment.status === "skipped";
  const isStuck = assignment.status === "stuck";
  const isTimerRunning = activeTimer?.assignmentId === assignment.id;
  const hasOtherTimer = activeTimer !== null && !isTimerRunning;
  const hasRewards = !!(quest.rewardXp || quest.rewardDescription || quest.rewardAvatarItem);
  const lockedByOrder = !!structuredNext && structuredNext.id !== quest.id;
  // A hero may only skip what they could otherwise be doing: their parent has
  // to have turned skipping on, and in structured mode it has to be their turn.
  const canSkip = !isChildView || (allowChildSkip && !lockedByOrder);

  function handleStart() {
    startTimer(assignment.id);
  }

  function handleTimerStop() {
    stopTimer();
  }

  const parsedDuration = parseInt(manualDuration, 10);
  const isDurationValid =
    manualDuration.trim() !== "" && Number.isFinite(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 480;
  const hasRequiredNotes = !quest.requireNotes || hasMeaningfulNotes(notes);

  function openQuickComplete() {
    setManualDuration(quest.estimatedMinutes ? String(quest.estimatedMinutes) : "");
    setNotes("");
    setShowQuickComplete(true);
  }

  async function handleQuickComplete() {
    if (!isDurationValid || !hasRequiredNotes) return;
    setActing(true);
    setError("");
    try {
      await completeAssignment(assignment.id, {
        title: quest.title,
        description: notes.trim() || (quest.description ?? undefined),
        durationMinutes: parsedDuration,
        source: "manual",
      });
      router.refresh();
      setShowQuickComplete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete quest");
    } finally {
      setActing(false);
    }
  }

  function openNotesEdit() {
    setNotesDraft(assignment.notes ?? "");
    setError("");
    setShowNotesEdit(true);
  }

  // Scribe's Notes after the fact: a hero often only knows what to write once
  // the quest is behind them, so a finished card stays annotatable.
  async function handleSaveNotes() {
    if (quest.requireNotes && !hasMeaningfulNotes(notesDraft)) return;
    setActing(true);
    setError("");
    try {
      await updateAssignmentNotes(assignment.id, notesDraft);
      setShowNotesEdit(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save notes");
    } finally {
      setActing(false);
    }
  }

  function openStuck() {
    setStuckReason("");
    setError("");
    setShowStuck(true);
  }

  function openSkip() {
    setSkipReason("");
    setError("");
    setShowQuickComplete(false);
    setShowSkip(true);
  }

  /**
   * A hero setting work aside because they can't finish it. Deliberately not
   * gated on `allowChildSkip`: a hero must never be trapped behind a problem
   * they can't solve. Their grown-up is alerted every time — and the reason is
   * the whole point of that alert, so it is required, never optional.
   */
  async function handleStuck(reason: string) {
    if (reason.trim() === "") return;
    setActing(true);
    setError("");
    try {
      await markAssignmentStuck(assignment.id, reason.trim());
      setShowStuck(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set this quest aside");
    } finally {
      setActing(false);
    }
  }

  function openRevise() {
    setReviseNote("");
    setError("");
    setShowRevise(true);
  }

  /**
   * Grown-ups only: put a finished, skipped or stuck quest back where it
   * belongs. Sending it to `skipped` is a skip, so it owes a reason too;
   * putting it back on the to-do list owes nothing.
   */
  async function handleRevise(next: "pending" | "skipped", reason?: string) {
    if (next === "skipped" && !reason?.trim()) return;
    setActing(true);
    setError("");
    try {
      await reviseAssignment(assignment.id, next, reason?.trim() || undefined);
      setShowRevise(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change this quest");
    } finally {
      setActing(false);
    }
  }

  /** Skipping always says why — a grown-up's skip as much as a hero's. */
  async function handleSkip(reason: string) {
    if (reason.trim() === "") return;
    setActing(true);
    setError("");
    try {
      await skipAssignment(assignment.id, reason.trim());
      setShowSkip(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip quest");
    } finally {
      setActing(false);
    }
  }

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-md border px-3 py-2 ${
        isCompleted
          ? "border-green-500/30 bg-green-500/5"
          : isSkipped
            ? "border-border/30 bg-muted/30 opacity-60"
            : isStuck
              ? "border-[var(--gold-border)]/60 bg-[rgba(201,168,76,0.06)]"
              : isTimerRunning
                ? "border-primary/40 bg-primary/5"
                : "border-border/50 bg-card/50"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-block h-3 w-3 shrink-0 rounded-full ${isTimerRunning && !isPaused ? "animate-pulse" : ""}`}
          style={{ backgroundColor: subject.color ?? "#6b7280" }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`break-words font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
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
            <p className="mt-0.5 line-clamp-3 text-xs wrap-anywhere text-muted-foreground">{quest.description}</p>
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
            <>
              <span className="text-xs text-green-500">Completed</span>
              {assignment.notes && !showNotesEdit && (
                <p className="mt-0.5 flex items-start gap-1 text-xs italic wrap-anywhere text-muted-foreground">
                  <GameIcon name="scroll" className="mt-0.5 size-3 shrink-0 text-[var(--gold-bright)]" />
                  <span>{assignment.notes}</span>
                </p>
              )}
            </>
          )}
          {isSkipped && (
            <span className="text-xs text-muted-foreground">
              Skipped{assignment.statusReason ? `: ${assignment.statusReason}` : ""}
            </span>
          )}
          {isStuck && (
            <p className="flex items-start gap-1 text-xs wrap-anywhere text-[var(--gold-bright)]">
              <GameIcon name="idea" className="mt-0.5 size-3 shrink-0 text-[var(--gold-bright)]" />
              <span>
                {isChildView ? "Stuck — help is on the way" : "Stuck — needs a grown-up"}
                {assignment.statusReason ? `: ${assignment.statusReason}` : ""}
              </span>
            </p>
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

        {/* Locked behind an earlier quest in structured mode */}
        {isPending && !isTimerRunning && lockedByOrder && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <GameIcon name="lock" className="size-3.5 shrink-0" />
            <span>Complete &quot;{structuredNext.title}&quot; first</span>
          </div>
        )}

        {/* A finished quest is still the hero's to annotate — and, for a
            grown-up, still theirs to correct when it wasn't really done. */}
        {isCompleted && !showNotesEdit && !showRevise && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={openNotesEdit} disabled={acting} className="text-muted-foreground">
              {assignment.notes ? "Edit Notes" : "Add Notes"}
            </Button>
            {!isChildView && (
              <Button size="sm" variant="ghost" onClick={openRevise} disabled={acting} className="text-muted-foreground">
                Not Done
              </Button>
            )}
          </div>
        )}

        {/* A grown-up can undo a skip they (or the hero) made */}
        {isSkipped && !isChildView && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => handleRevise("pending")} disabled={acting} className="text-muted-foreground">
              Undo Skip
            </Button>
          </div>
        )}

        {/* A stuck quest is waiting on a grown-up: help and finish it, set it
            aside for today, or put it back on the hero's list. */}
        {isStuck && !isChildView && !showQuickComplete && !showSkip && (
          <div className="flex shrink-0 flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={openQuickComplete} disabled={acting} className="!border-[var(--gold-bright)]">
              Mark Done
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleRevise("pending")} disabled={acting}>
              Back to To-Do
            </Button>
            <Button size="sm" variant="ghost" onClick={openSkip} disabled={acting}>
              Skip for Today
            </Button>
          </div>
        )}

        {/* Idle pending actions */}
        {isPending && !isTimerRunning && !showQuickComplete && !lockedByOrder && (
          <div className="flex shrink-0 gap-1">
            {isChildView ? (
              <>
                <Button size="sm" onClick={handleStart} disabled={acting || hasOtherTimer}>
                  Start
                </Button>
                <Button size="sm" variant="outline" onClick={openQuickComplete} disabled={acting} className="!border-[var(--gold-bright)]">
                  Quick Complete
                </Button>
                <Button size="sm" variant="ghost" onClick={openStuck} disabled={acting}>
                  I&apos;m Stuck
                </Button>
                {canSkip && (
                  <Button size="sm" variant="ghost" onClick={openSkip} disabled={acting}>
                    Skip
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={openQuickComplete} disabled={acting} className="!border-[var(--gold-bright)]">
                  Mark Done
                </Button>
                <Button size="sm" variant="ghost" onClick={openSkip} disabled={acting}>
                  Skip
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && !showQuickComplete && !showSkip && !showStuck && !showRevise && !showNotesEdit && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}

      {/* Quick complete inline form. Also serves a stuck quest a grown-up has
          since helped with, so they can finish it without reopening it first. */}
      {(isPending || isStuck) && showQuickComplete && !isTimerRunning && !lockedByOrder && (
        <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`Scribe's Notes ${quest.requireNotes ? "(required)" : "(optional)"} — what did you do?`}
            required={quest.requireNotes}
            aria-label="Scribe's Notes"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={manualDuration}
              onChange={(e) => setManualDuration(e.target.value)}
              placeholder="min"
              min={1}
              max={480}
              required
              className="w-20"
              aria-label="Duration in minutes"
            />
            <span className="text-xs text-muted-foreground">min</span>
            <Button size="sm" onClick={handleQuickComplete} disabled={acting || !isDurationValid || !hasRequiredNotes}>
              {acting ? "Saving..." : "Submit"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowQuickComplete(false)} disabled={acting}>
              Cancel
            </Button>
            {isChildView ? null : (
              <Button size="sm" variant="ghost" onClick={openSkip} disabled={acting} className="ml-auto">
                Skip
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Scribe's Notes on an already-completed quest */}
      {isCompleted && showNotesEdit && (
        <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Input
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder={`Scribe's Notes ${quest.requireNotes ? "(required)" : "(optional)"} — what did you do?`}
            required={quest.requireNotes}
            aria-label="Scribe's Notes"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveNotes}
              disabled={acting || (quest.requireNotes && !hasMeaningfulNotes(notesDraft))}
            >
              {acting ? "Saving..." : "Save Notes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNotesEdit(false)} disabled={acting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* "I'm stuck": the way out of a quest a hero genuinely can't finish.
          Needs no permission — being trapped isn't a lesson — but it always
          fetches a grown-up. */}
      {isPending && showStuck && !isTimerRunning && (
        <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Input
            value={stuckReason}
            onChange={(e) => setStuckReason(e.target.value)}
            placeholder="What's got you stuck? (required)"
            required
            aria-label="What you are stuck on"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleStuck(stuckReason)}
              disabled={acting || stuckReason.trim() === ""}
            >
              {acting ? "Sending..." : "Get Help & Move On"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowStuck(false)} disabled={acting}>
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground">
              Your grown-up will be told so they can help.
            </span>
          </div>
        </div>
      )}

      {/* Grown-ups correcting a completion a hero shouldn't have marked. */}
      {isCompleted && showRevise && (
        <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Wasn&apos;t really done? Put it back. Any XP and rewards it earned are returned.
          </p>
          <Input
            value={reviseNote}
            onChange={(e) => setReviseNote(e.target.value)}
            placeholder="Why is it being skipped? (required to skip)"
            aria-label="Reason for skipping"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleRevise("skipped", reviseNote)}
              disabled={acting || reviseNote.trim() === ""}
            >
              {acting ? "Saving..." : "Skip for Today"}
            </Button>
            {/* Back on the to-do list needs no reason — nothing is being set
                aside, so there is nothing for a grown-up to explain. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRevise("pending")}
              disabled={acting}
              className="!border-[var(--gold-bright)]"
            >
              Back to To-Do
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRevise(false)} disabled={acting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Every skip says why — a hero's own, which the grown-ups hear about
          either way, and a grown-up's, which is the only record of it there
          will be. Also serves a stuck quest being set aside for the day. */}
      {(isPending || isStuck) && showSkip && !isTimerRunning && (
        <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Input
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder={
              isChildView ? "Why are you skipping? (required)" : "Why is it being skipped? (required)"
            }
            required
            aria-label="Reason for skipping"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleSkip(skipReason)}
              disabled={acting || skipReason.trim() === ""}
            >
              {acting ? "Skipping..." : "Skip Quest"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSkip(false)} disabled={acting}>
              Cancel
            </Button>
            {isChildView && (
              <span className="text-xs text-muted-foreground">Your grown-up will be told.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
