"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { upsertSchedule, deleteSchedule } from "@/lib/actions/quest-schedules";

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

type ScheduleData = {
  id: string;
  frequency: string;
  daysOfWeek: string | null;
  startDate: string;
  endDate: string | null;
};

export function QuestScheduleForm({
  questId,
  schedule,
}: {
  questId: string;
  schedule: ScheduleData | null;
}) {
  const router = useRouter();
  const parsedDays: string[] = schedule?.daysOfWeek
    ? JSON.parse(schedule.daysOfWeek)
    : ["mon", "tue", "wed", "thu", "fri"];

  const [frequency, setFrequency] = useState<"daily" | "specific_days">(
    (schedule?.frequency as "daily" | "specific_days") ?? "specific_days"
  );
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(parsedDays);
  const [startDate, setStartDate] = useState(
    schedule?.startDate ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(schedule?.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(day: string) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await upsertSchedule(questId, {
        frequency,
        daysOfWeek: frequency === "specific_days" ? daysOfWeek : undefined,
        startDate,
        endDate: endDate || undefined,
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

        <div className="space-y-2">
          <Label>Frequency</Label>
          <div className="flex gap-2">
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
              variant={frequency === "specific_days" ? "default" : "outline"}
              onClick={() => setFrequency("specific_days")}
            >
              Specific Days
            </Button>
          </div>
        </div>

        {frequency === "specific_days" && (
          <div className="space-y-2">
            <Label>Days of the Week</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <Button
                  key={day.value}
                  type="button"
                  size="sm"
                  variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                  onClick={() => toggleDay(day.value)}
                  className="min-w-[3rem]"
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="schedule-start">Start Date</Label>
            <Input
              id="schedule-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-end">End Date (optional)</Label>
            <Input
              id="schedule-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : schedule ? "Update Schedule" : "Set Schedule"}
          </Button>
          {schedule && (
            <Button variant="outline" onClick={handleRemove}>
              Remove Schedule
            </Button>
          )}
        </div>
      </div>
    </GameFrame>
  );
}
