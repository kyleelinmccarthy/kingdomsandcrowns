"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { Button } from "@/components/ui/button";
import { excuseDay, moveDayToDate } from "@/lib/actions/excused-days";
import { formatMissedDate } from "@/lib/utils/makeup";
import { formatMovedFrom, type MissedDay } from "@/lib/utils/missed-days";
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
 */
export function MissedDays({
  childId,
  childName,
  today,
  missed,
  canEdit,
  writableChildCount,
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
}) {
  if (missed.length === 0) return null;

  return (
    <GameFrame
      title={`Missed Days${childName ? ` — ${childName}` : ""}`}
      icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {canEdit
          ? "Days that didn't go to plan. Excuse one — a sick day, an appointment — and it stops counting against their streak. Or move the work to a day that suits."
          : "Days that didn't go to plan. A grown-up with edit access can excuse a day or move its work."}
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
    </GameFrame>
  );
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
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "excuse" | "move">("idle");
  const [reason, setReason] = useState<ExcuseReason>("sick");
  const [note, setNote] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [target, setTarget] = useState(today);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canApplyToAll = writableChildCount > 1;

  async function run(fn: () => Promise<{ moved: number; blocked: number } | void>) {
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      // A quest already on the target day cannot be moved onto it twice, so it
      // stays put. Say so — silently moving three of four is worse than saying
      // which one stayed and why.
      if (result && result.blocked > 0) {
        setNotice(
          `${result.moved} moved. ${result.blocked} stayed put — that day already has ${result.blocked === 1 ? "that quest" : "those quests"}.`
        );
      }
      setMode("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setActing(false);
    }
  }

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
          Streak broke here. Excusing this day puts it back.
        </p>
      )}

      {mode === "excuse" && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium" htmlFor={`reason-${day.date}`}>
            Why was this day missed?
          </label>
          <select
            id={`reason-${day.date}`}
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
          {canApplyToAll && (
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
            <Button
              size="sm"
              disabled={acting}
              onClick={() =>
                run(() => excuseDay(childId, day.date, reason, note, { applyToAll }))
              }
            >
              {acting ? "Excusing..." : "Excuse Day"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")} disabled={acting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "move" && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium" htmlFor={`target-${day.date}`}>
            Move this day&apos;s work to
          </label>
          <input
            id={`target-${day.date}`}
            type="date"
            min={today}
            className="w-full rounded border border-border bg-background p-2 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={acting}
              onClick={() => run(() => moveDayToDate(childId, day.date, target))}
            >
              {acting ? "Moving..." : "Move Work"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")} disabled={acting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
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
