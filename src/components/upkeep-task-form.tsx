"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createUpkeepTask, updateUpkeepTask } from "@/lib/actions/upkeep-tasks";
import { upsertUpkeepSchedule } from "@/lib/actions/upkeep-schedules";
import { parseDollarsToCents } from "@/lib/utils/wages";
import { formatDate } from "@/lib/utils/dates";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type ExistingTask = {
  id: string;
  title: string;
  description: string | null;
  valueCents: number | null;
  isRequired: boolean;
  rewardXp: number | null;
  schedule: {
    frequency: "once" | "daily" | "weekly" | "monthly";
    daysOfWeek: string | null;
    intervalWeeks: number | null;
    startDate: string;
    endDate: string | null;
  } | null;
};

export function UpkeepTaskForm({
  childId,
  task,
  onDone,
}: {
  childId: string;
  task: ExistingTask | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  // Held as the string the parent typed; converted once, on submit.
  const [amount, setAmount] = useState(
    task?.valueCents != null ? (task.valueCents / 100).toFixed(2) : ""
  );
  const [isRequired, setIsRequired] = useState(task?.isRequired ?? true);
  const [rewardXp, setRewardXp] = useState(task?.rewardXp?.toString() ?? "");
  const [frequency, setFrequency] = useState<"once" | "daily" | "weekly" | "monthly">(
    task?.schedule?.frequency ?? "daily"
  );
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    task?.schedule?.daysOfWeek ? JSON.parse(task.schedule.daysOfWeek) : []
  );
  const [intervalWeeks, setIntervalWeeks] = useState(task?.schedule?.intervalWeeks ?? 1);
  const [startDate, setStartDate] = useState(
    task?.schedule?.startDate ?? formatDate(new Date())
  );
  const [endDate, setEndDate] = useState(task?.schedule?.endDate ?? "");

  function toggleDay(day: string) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function submit() {
    setError(null);

    if (!title.trim()) {
      setError("Give the task a name");
      return;
    }

    // An empty box means an unpaid task, which is different from zero.
    let valueCents: number | null = null;
    if (amount.trim()) {
      try {
        valueCents = parseDollarsToCents(amount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enter an amount like 2.50");
        return;
      }
    }

    // An empty box means no XP reward. A non-numeric value would otherwise
    // become NaN and flow silently into the child's XP column.
    let rewardXpValue: number | null = null;
    if (rewardXp.trim()) {
      const parsed = Number(rewardXp.trim());
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        setError("Enter a whole number for Reward XP");
        return;
      }
      rewardXpValue = parsed;
    }

    if (frequency === "weekly" && daysOfWeek.length === 0) {
      setError("Pick at least one day for the task to repeat on");
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          title,
          description: description.trim() || null,
          valueCents,
          isRequired,
          rewardXp: rewardXpValue,
        };

        const schedulePayload = {
          frequency,
          daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
          intervalWeeks: frequency === "weekly" ? intervalWeeks : undefined,
          startDate,
          endDate: frequency === "once" ? undefined : endDate || undefined,
        };

        if (task) {
          await updateUpkeepTask(task.id, payload);
          await upsertUpkeepSchedule(task.id, schedulePayload);
        } else {
          await createUpkeepTask({
            childId,
            ...payload,
            schedule: schedulePayload,
          });
        }
        onDone();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the task");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="upkeep-title">Title</Label>
        <Input
          id="upkeep-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Feed the chickens"
        />
      </div>

      <div>
        <Label htmlFor="upkeep-description">Description</Label>
        <Input
          id="upkeep-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="upkeep-amount">Worth (leave blank for an unpaid task)</Label>
        <Input
          id="upkeep-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="2.50"
          inputMode="decimal"
        />
      </div>

      <div>
        <Label htmlFor="upkeep-xp">Reward XP (optional)</Label>
        <Input
          id="upkeep-xp"
          value={rewardXp}
          onChange={(e) => setRewardXp(e.target.value)}
          inputMode="numeric"
        />
      </div>

      <div>
        <Label htmlFor="upkeep-frequency">How often</Label>
        <Select
          id="upkeep-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as typeof frequency)}
        >
          <option value="once">Just once</option>
          <option value="daily">Every day</option>
          <option value="weekly">Certain days each week</option>
          <option value="monthly">Once a month</option>
        </Select>
      </div>

      {frequency === "weekly" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="upkeep-interval">Repeat every</Label>
            <Input
              id="upkeep-interval"
              type="number"
              value={intervalWeeks}
              onChange={(e) => setIntervalWeeks(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={12}
              className="w-16"
            />
            <span className="text-sm text-muted-foreground">
              week{intervalWeeks === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={daysOfWeek.includes(day) ? "default" : "outline"}
                onClick={() => toggleDay(day)}
              >
                {day}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="upkeep-start">{frequency === "once" ? "Date" : "Start Date"}</Label>
          <Input
            id="upkeep-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        {frequency !== "once" && (
          <div>
            <Label htmlFor="upkeep-end">End Date (optional)</Label>
            <Input
              id="upkeep-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="upkeep-required">Required</Label>
        <Switch
          checked={isRequired}
          onCheckedChange={() => setIsRequired((v) => !v)}
          aria-label="Required"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        An optional task still pays when it is done, but is never counted as missed.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button disabled={pending} onClick={submit}>
        Save
      </Button>
    </div>
  );
}
