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
  const [frequency, setFrequency] = useState<"once" | "daily" | "weekly" | "monthly">("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>([]);

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

    startTransition(async () => {
      try {
        const payload = {
          title,
          description: description.trim() || undefined,
          valueCents,
          isRequired,
          rewardXp: rewardXp.trim() ? parseInt(rewardXp, 10) : null,
        };

        if (task) {
          await updateUpkeepTask(task.id, payload);
          await upsertUpkeepSchedule(task.id, {
            frequency,
            daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
            startDate: formatDate(new Date()),
          });
        } else {
          await createUpkeepTask({
            childId,
            ...payload,
            schedule: {
              frequency,
              daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
              startDate: formatDate(new Date()),
            },
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
      )}

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
