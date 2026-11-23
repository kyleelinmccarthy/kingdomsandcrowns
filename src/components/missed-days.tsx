"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { Button } from "@/components/ui/button";
import {
  excuseAssignment,
  excuseDay,
  moveAssignmentsToDate,
  moveDayToDate,
} from "@/lib/actions/excused-days";
import { formatMissedDate } from "@/lib/utils/makeup";
import { formatMovedFrom, type MissedDay, type MissedQuest } from "@/lib/utils/missed-days";
import {
  EXCUSE_REASONS,
  EXCUSE_REASON_LABELS,
  type ExcuseReason,
} from "@/lib/utils/excused-days";

/**
 * The grown-ups' account of days that did not go to plan: a school day with
 * nothing logged, or one that still owes work.
 *
 * Deliberately never shown to a hero. A child's screens show what to do next,
 * not a ledger of what they failed to do — the hero-facing equivalent is the
 * catch-up panel, which is framed as work waiting rather than days missed.
 *
 * Excusing a day here is the one thing that repairs a broken streak, so the
 * day that broke it is called out by name rather than left for a parent to
 * work out from a list of dates.
 *
 * Each day lists its quests by name, so a grown-up can excuse or move just the
 * one that was missed — science on a field-trip day — rather than the whole
 * day. Excusing every quest on a day excuses the day too (see
 * `excuseAssignment`).
 *
 * The panel folds shut to a one-line count, so a dashboard showing several
 * heroes' ledgers stays readable; the count still says when a streak broke.
 */
export function MissedDays({
  childId,
  childName,
  today,
  missed,
  canEdit,
  writableChildCount,
  defaultOpen = true,
}: {
  childId: string;
  childName: string;
  /** The date the panel is being shown for — what "Yesterday" is relative to. */
  today: string;
  missed: MissedDay[];
  /** False for a hero and for a read-only guardian: facts, but no controls. */
  canEdit: boolean;
  /** Heroes this actor may write to. Drives the "apply to all" checkbox. */
  writableChildCount: number;
  /** Whether the panel starts unfolded. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  if (missed.length === 0) return null;

  const title = `Missed Days${childName ? ` — ${childName}` : ""}`;
  const brokeStreak = missed.some((day) => day.brokeStreak);

  return (
    <GameFrame
      title={title}
      icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}
      action={
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "Hide" : "Show"} ${title}`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Show"}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        {missed.length === 1 ? "1 day" : `${missed.length} days`} didn&apos;t go to plan
        {brokeStreak && <span style={{ color: "var(--streak)" }}> · one broke the streak</span>}
      </p>
      <div id={bodyId} hidden={!open} className="mt-3">
        <p className="mb-3 text-xs text-muted-foreground">
          {canEdit
            ? "Excuse a whole day — a sick day, an appointment — and it stops counting against their streak, or excuse just the quests that were missed. Or move the work to a day that suits."
            : "A grown-up with edit access can excuse a day or a quest, or move its work."}
        </p>
        <div className="min-w-0 space-y-2">
          {missed.map((day) => (
            <MissedDayRow
              key={day.date}
              childId={childId}
              day={day}
              today={today}
              canEdit={canEdit}
              writableChildCount={writableChildCount}
            />
          ))}
        </div>
      </div>
    </GameFrame>
  );
}

type MoveResult = { moved: number; blocked: number };

/**
 * Runs one excuse or move, refreshes the page, and reports what went wrong —
 * or, for a move, what stayed behind.
 */
function useAction() {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<MoveResult | void>, onDone: () => void) {
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      // A quest already on (or planned for) the target day cannot be moved onto
      // it twice, so it stays put. Say so — silently moving three of four is worse than saying
      // which one stayed and why.
      if (result && result.blocked > 0) {
        setNotice(
          `${result.moved} moved. ${result.blocked} stayed put — that day already has ${result.blocked === 1 ? "that quest" : "those quests"} planned.`
        );
      }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setActing(false);
    }
  }

  return { acting, error, notice, run };
}

function MissedDayRow({
  childId,
  day,
  today,
  canEdit,
  writableChildCount,
}: {
  childId: string;
  day: MissedDay;
  today: string;
  canEdit: boolean;
  writableChildCount: number;
}) {
  const [mode, setMode] = useState<"idle" | "excuse" | "move">("idle");
  const { acting, error, notice, run } = useAction();
  const idle = () => setMode("idle");

  return (
    <div
      className={`rounded-lg border p-3 ${
        day.brokeStreak ? "border-[var(--gold-bright)]" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* "Yesterday" / "Monday" while that still reads unambiguously, then a
            named date — over a 30-day window a bare weekday would repeat four
            times and a raw ISO string reads like a serial number. */}
        <span className="font-semibold">{dayLabel(day.date, today)}</span>
        <span className="text-xs text-muted-foreground">{describe(day)}</span>
        {canEdit && mode === "idle" && (
          <div className="flex flex-wrap gap-1 sm:ml-auto">
            <Button size="sm" variant="outline" onClick={() => setMode("excuse")} disabled={acting}>
              Excuse Day
            </Button>
            {day.unfinishedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setMode("move")} disabled={acting}>
                Move Work
              </Button>
            )}
          </div>
        )}
      </div>

      {day.brokeStreak && (
        <p className="mt-1 text-xs" style={{ color: "var(--streak)" }}>
          Streak broke here. Excusing this day — or every quest on it — puts it back.
        </p>
      )}

      {mode === "excuse" && (
        <ExcuseForm
          id={`reason-${day.date}`}
          question="Why was this day missed?"
          submitLabel="Excuse Day"
          showApplyToAll={writableChildCount > 1}
          acting={acting}
          onCancel={idle}
          onSubmit={(reason, note, applyToAll) =>
            run(() => excuseDay(childId, day.date, reason, note, { applyToAll }), idle)
          }
        />
      )}

      {mode === "move" && (
        <MoveForm
          id={`target-${day.date}`}
          question="Move this day's work to"
          submitLabel="Move Work"
          today={today}
          acting={acting}
          onCancel={idle}
          onSubmit={(target) => run(() => moveDayToDate(childId, day.date, target), idle)}
        />
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}

      {day.quests.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {day.quests.map((quest) => (
            <MissedQuestRow key={quest.id} quest={quest} today={today} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Statuses whose work is still owed, and so can be excused or moved. */
const OWED = new Set(["pending", "stuck"]);

const STATUS_LABELS: Record<string, string> = {
  pending: "Not done",
  stuck: "Stuck",
  completed: "Done",
  skipped: "Skipped",
  excused: "Excused",
};

function MissedQuestRow({
  quest,
  today,
  canEdit,
}: {
  quest: MissedQuest;
  today: string;
  canEdit: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "excuse" | "move">("idle");
  const { acting, error, notice, run } = useAction();
  const idle = () => setMode("idle");
  const owed = OWED.has(quest.status);

  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words">{quest.title}</span>
        <span
          className={`text-xs ${owed ? "font-medium text-foreground" : "text-muted-foreground"}`}
        >
          {STATUS_LABELS[quest.status] ?? quest.status}
        </span>
        {canEdit && owed && mode === "idle" && (
          <div className="flex gap-1 sm:ml-auto">
            <Button
              size="sm"
              variant="outline"
              aria-label={`Excuse ${quest.title}`}
              onClick={() => setMode("excuse")}
              disabled={acting}
            >
              Excuse
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Move ${quest.title}`}
              onClick={() => setMode("move")}
              disabled={acting}
            >
              Move
            </Button>
          </div>
        )}
      </div>

      {mode === "excuse" && (
        <ExcuseForm
          id={`reason-${quest.id}`}
          question={`Why was ${quest.title} missed?`}
          submitLabel="Excuse Quest"
          showApplyToAll={false}
          acting={acting}
          onCancel={idle}
          onSubmit={(reason, note) => run(() => excuseAssignment(quest.id, reason, note), idle)}
        />
      )}

      {mode === "move" && (
        <MoveForm
          id={`target-${quest.id}`}
          question={`Move ${quest.title} to`}
          submitLabel="Move Quest"
          today={today}
          acting={acting}
          onCancel={idle}
          onSubmit={(target) => run(() => moveAssignmentsToDate([quest.id], target), idle)}
        />
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {notice && <p className="mt-1 text-xs text-muted-foreground">{notice}</p>}
    </li>
  );
}

function ExcuseForm({
  id,
  question,
  submitLabel,
  showApplyToAll,
  acting,
  onCancel,
  onSubmit,
}: {
  id: string;
  question: string;
  submitLabel: string;
  showApplyToAll: boolean;
  acting: boolean;
  onCancel: () => void;
  onSubmit: (reason: ExcuseReason, note: string, applyToAll: boolean) => void;
}) {
  const [reason, setReason] = useState<ExcuseReason>("sick");
  const [note, setNote] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium" htmlFor={id}>
        {question}
      </label>
      <select
        id={id}
        className="w-full rounded border border-border bg-background p-2 text-sm"
        value={reason}
        onChange={(e) => setReason(e.target.value as ExcuseReason)}
      >
        {EXCUSE_REASONS.map((r) => (
          <option key={r} value={r}>
            {EXCUSE_REASON_LABELS[r]}
          </option>
        ))}
      </select>
      <input
        className="w-full rounded border border-border bg-background p-2 text-sm"
        placeholder="Add a note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {showApplyToAll && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          Apply to all heroes
        </label>
      )}
      <div className="flex gap-1">
        <Button size="sm" disabled={acting} onClick={() => onSubmit(reason, note, applyToAll)}>
          {acting ? "Excusing..." : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={acting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MoveForm({
  id,
  question,
  submitLabel,
  today,
  acting,
  onCancel,
  onSubmit,
}: {
  id: string;
  question: string;
  submitLabel: string;
  today: string;
  acting: boolean;
  onCancel: () => void;
  onSubmit: (target: string) => void;
}) {
  const [target, setTarget] = useState(today);

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium" htmlFor={id}>
        {question}
      </label>
      <input
        id={id}
        type="date"
        min={today}
        className="w-full rounded border border-border bg-background p-2 text-sm"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      <div className="flex gap-1">
        <Button size="sm" disabled={acting} onClick={() => onSubmit(target)}>
          {acting ? "Moving..." : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={acting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * `formatMissedDate` only names days inside the last six — beyond that it hands
 * back the raw ISO date, which is most of a 30-day window. Fall through to the
 * named form there.
 */
function dayLabel(date: string, today: string): string {
  const relative = formatMissedDate(date, today);
  return relative === date ? formatMovedFrom(date) : relative;
}

function describe(day: MissedDay): string {
  if (day.unfinishedCount > 0) {
    const quests = day.unfinishedCount === 1 ? "quest" : "quests";
    const owed = `${day.unfinishedCount} ${quests} still owed`;
    return day.empty ? `Nothing logged — ${owed}` : owed;
  }
  return "Nothing logged";
}
