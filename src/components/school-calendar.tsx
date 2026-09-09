"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import {
  createSchoolBreak,
  deleteSchoolBreak,
  updateSchoolBreak,
} from "@/lib/actions/school-breaks";
import { useBrowserToday } from "@/hooks/use-browser-today";
import {
  daysInRange,
  findCoveringBreak,
  formatBreakRange,
  groupBreaksBySchoolYear,
} from "@/lib/utils/school-calendar";

export type SchoolBreakRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

/**
 * The family's year of days off: holidays, breaks, snow days — anything a hero
 * isn't expected to log on. Streak math already skips every date in here, so
 * this panel is the whole answer to "today's a holiday, don't punish us for
 * it": marking the day re-derives the streaks before the parent leaves the
 * page.
 *
 * `today` arrives from the server so the first paint matches the HTML, then
 * gets corrected to the browser's own calendar date on mount — a family in
 * UTC-7 marking a holiday at 6pm means *their* today, not the server's
 * tomorrow.
 */
export function SchoolCalendar({
  familyId,
  breaks,
  today: serverToday,
  canEdit,
}: {
  familyId: string;
  breaks: SchoolBreakRow[];
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { date: today } = useBrowserToday(serverToday, "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const todaysBreak = findCoveringBreak(today, breaks);
  const years = groupBreaksBySchoolYear(breaks);

  function run(action: () => Promise<unknown>) {
    setError("");
    startTransition(async () => {
      try {
        await action();
        setEditingId(null);
        setAdding(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function markTodayOff() {
    run(() => createSchoolBreak(familyId, "Holiday", today, today));
  }

  return (
    <GameFrame
      title="School Calendar"
      icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Holidays, breaks and days off for the whole year. Nothing is expected on these
          days, so a quiet one never breaks a streak.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Today, front and centre — the reason most parents open this panel. */}
        <div className="rounded-lg border border-gold-dim bg-secondary/30 p-3">
          {todaysBreak ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm">
                <span className="font-medium">Today is off</span>
                <span className="text-muted-foreground"> — {todaysBreak.name}. Streaks are safe.</span>
              </p>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={isPending}
                  onClick={() => run(() => deleteSchoolBreak(todaysBreak.id))}
                >
                  Undo
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm text-muted-foreground">
                Today is a regular school day.
              </p>
              {canEdit && (
                <Button size="sm" variant="outline" disabled={isPending} onClick={markTodayOff}>
                  Today is a holiday
                </Button>
              )}
            </div>
          )}
        </div>

        {breaks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No days off on the calendar yet.
          </p>
        ) : (
          <div className="space-y-4">
            {years.map((year) => (
              <div key={year.startYear} className="space-y-2">
                <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {year.label} school year
                </h4>
                {year.breaks.map((b) =>
                  editingId === b.id ? (
                    <BreakForm
                      key={b.id}
                      initial={b}
                      submitLabel="Save"
                      disabled={isPending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(name, startDate, endDate) =>
                        run(() => updateSchoolBreak(b.id, name, startDate, endDate))
                      }
                    />
                  ) : (
                    <BreakRow
                      key={b.id}
                      row={b}
                      today={today}
                      canEdit={canEdit}
                      disabled={isPending}
                      onEdit={() => {
                        setError("");
                        setAdding(false);
                        setEditingId(b.id);
                      }}
                      onDelete={() => run(() => deleteSchoolBreak(b.id))}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit &&
          (adding ? (
            <BreakForm
              initial={{ name: "", startDate: today, endDate: today }}
              submitLabel="Add to calendar"
              disabled={isPending}
              onCancel={() => setAdding(false)}
              onSubmit={(name, startDate, endDate) =>
                run(() => createSchoolBreak(familyId, name, startDate, endDate))
              }
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                setError("");
                setEditingId(null);
                setAdding(true);
              }}
            >
              + Add a break or holiday
            </Button>
          ))}
      </div>
    </GameFrame>
  );
}

/**
 * One entry. The dates and the controls sit on their own line below the name on
 * narrow screens: a name like "Thanksgiving Break" beside three fixed-width
 * controls is what squeezes a row down to one letter per line.
 */
function BreakRow({
  row,
  today,
  canEdit,
  disabled,
  onEdit,
  onDelete,
}: {
  row: SchoolBreakRow;
  today: string;
  canEdit: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCurrent = today >= row.startDate && today <= row.endDate;
  const isPast = row.endDate < today;
  const days = daysInRange(row.startDate, row.endDate);

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:gap-3 ${
        isCurrent ? "border-gold-dim bg-secondary/30" : "border-border/30 bg-background/40"
      } ${isPast ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <span className="break-words">{row.name}</span>
          {isCurrent && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Today
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatBreakRange(row.startDate, row.endDate)}
          {days > 1 && ` · ${days} days`}
        </p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={onDelete}
            aria-label={`Remove ${row.name}`}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

/** Add/edit share a form: the only difference is what the button says. */
function BreakForm({
  initial,
  submitLabel,
  disabled,
  onCancel,
  onSubmit,
}: {
  initial: { name: string; startDate: string; endDate: string };
  submitLabel: string;
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (name: string, startDate: string, endDate: string) => void;
}) {
  const fieldId = useId();
  const [name, setName] = useState(initial.name);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);

  /** A single-day holiday is the common case, so the end date follows the start
   *  until the parent moves it themselves. */
  function changeStart(next: string) {
    if (endDate === startDate || endDate < next) setEndDate(next);
    setStartDate(next);
  }

  const valid = name.trim() !== "" && startDate !== "" && endDate !== "" && startDate <= endDate;

  return (
    <form
      className="space-y-3 rounded-md border border-border/30 bg-background/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(name.trim(), startDate, endDate);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-name`} className="text-xs">Name</Label>
        <Input
          id={`${fieldId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Labor Day, Winter Break"
          maxLength={100}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-start`} className="text-xs">First day off</Label>
          <Input
            id={`${fieldId}-start`}
            type="date"
            value={startDate}
            onChange={(e) => changeStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-end`} className="text-xs">Last day off</Label>
          <Input
            id={`${fieldId}-end`}
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={disabled || !valid}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
