"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { upsertSchedule, deleteSchedule } from "@/lib/actions/quest-schedules";
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  defaultRepeatDaysForStartDate,
  syncRepeatDaysWithStartDate,
} from "@/lib/utils/schedule-days";
import { ANYTIME_DESCRIPTION, describeSchedule } from "@/lib/utils/schedule-summary";
import { todayInZone } from "@/lib/utils/dates";

type Frequency = "once" | "daily" | "weekly" | "monthly";

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"][n % 10 > 3 || Math.floor((n % 100) / 10) === 1 ? 0 : n % 10];
  return `${n}${suffix}`;
}

type ScheduleData = {
  id: string;
  frequency: string;
  daysOfWeek: string | null;
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

export function QuestScheduleForm({
  questId,
  schedule,
  schoolDays,
  timeZone,
}: {
  questId: string;
  schedule: ScheduleData | null;
  /** Weekday codes this child attends school on; constrains which repeat days can be picked */
  schoolDays: string[];
  /** The family's IANA timezone — the authority for what day it is when no schedule is set yet. */
  timeZone: string;
}) {
  const router = useRouter();
  const defaultStartDate = schedule?.startDate ?? todayInZone(timeZone);

  const [frequency, setFrequency] = useState<Frequency>((schedule?.frequency as Frequency) ?? "weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    schedule?.daysOfWeek ? JSON.parse(schedule.daysOfWeek) : defaultRepeatDaysForStartDate(defaultStartDate, schoolDays)
  );
  const [intervalWeeks, setIntervalWeeks] = useState(schedule?.intervalWeeks ?? 1);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(schedule?.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(day: string) {
    if (!schoolDays.includes(day)) return;
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleStartDateChange(value: string) {
    setStartDate(value);
    if (frequency === "weekly") {
      setDaysOfWeek((prev) => syncRepeatDaysWithStartDate(prev, value, schoolDays));
    }
  }

  function handleSelectWeekly() {
    setFrequency("weekly");
    setDaysOfWeek((prev) => (prev.length > 0 ? prev : defaultRepeatDaysForStartDate(startDate, schoolDays)));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (frequency === "weekly" && daysOfWeek.length === 0) {
        throw new Error("Pick at least one day for the quest to repeat on");
      }
      await upsertSchedule(questId, {
        frequency,
        daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
        intervalWeeks: frequency === "weekly" ? intervalWeeks : undefined,
        startDate,
        endDate: frequency === "once" ? undefined : endDate || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    await deleteSchedule(questId);
    router.refresh();
  }

  return (
    <GameFrame title="Schedule" icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Having no schedule is a state with consequences, so say so plainly
            rather than showing an empty form that looks like nothing is set. */}
        <div className="rounded-md border border-dashed border-border/60 px-3 py-2">
          <p className="text-xs">
            <span className="text-muted-foreground">Currently: </span>
            <span className={schedule ? "font-medium text-[var(--gold-bright)]" : "font-medium"}>
              {describeSchedule(schedule)}
            </span>
          </p>
          {!schedule && (
            <p className="mt-1 text-[10px] text-muted-foreground">{ANYTIME_DESCRIPTION}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Frequency</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={frequency === "once" ? "default" : "outline"}
              onClick={() => setFrequency("once")}
            >
              Once
            </Button>
            <Button
              type="button"
              size="sm"
              variant={frequency === "daily" ? "default" : "outline"}
              onClick={() => setFrequency("daily")}
            >
              Daily
            </Button>
            <Button
              type="button"
              size="sm"
              variant={frequency === "weekly" ? "default" : "outline"}
              onClick={handleSelectWeekly}
            >
              Weekly
            </Button>
            <Button
              type="button"
              size="sm"
              variant={frequency === "monthly" ? "default" : "outline"}
              onClick={() => setFrequency("monthly")}
            >
              Monthly
            </Button>
          </div>
        </div>

        {frequency === "weekly" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="schedule-interval">Repeat every</Label>
              <Input
                id="schedule-interval"
                type="number"
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={12}
                className="w-16"
              />
              <span className="text-sm text-muted-foreground">week{intervalWeeks === 1 ? "" : "s"}</span>
            </div>
            <Label>Days of the Week</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.filter((day) => schoolDays.includes(day)).map((day) => (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={daysOfWeek.includes(day) ? "default" : "outline"}
                  onClick={() => toggleDay(day)}
                  className="min-w-[3rem]"
                >
                  {DAY_LABELS[day]}
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              The start date&apos;s day is picked automatically; only school days can be selected.
            </p>
          </div>
        )}

        {frequency === "monthly" && (
          <p className="text-[10px] text-muted-foreground">
            Repeats on the {ordinal(new Date(startDate + "T00:00:00Z").getUTCDate())} of every month (skipping non-school days).
          </p>
        )}

        {frequency === "once" && (
          <p className="text-[10px] text-muted-foreground">
            This quest will be assigned only on the date below.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="schedule-start">{frequency === "once" ? "Date" : "Start Date"}</Label>
            <Input
              id="schedule-start"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              required
            />
          </div>
          {frequency !== "once" && (
            <div className="space-y-2">
              <Label htmlFor="schedule-end">End Date (optional)</Label>
              <Input
                id="schedule-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : schedule ? "Update Schedule" : "Set Schedule"}
            </Button>
            {schedule && (
              <Button variant="outline" onClick={handleRemove}>
                Make available anytime
              </Button>
            )}
          </div>
          {schedule && (
            <p className="text-[10px] text-muted-foreground">
              Dropping the schedule clears the days it had already planned and leaves the quest
              startable on any day. Completed work is kept.
            </p>
          )}
        </div>
      </div>
    </GameFrame>
  );
}
