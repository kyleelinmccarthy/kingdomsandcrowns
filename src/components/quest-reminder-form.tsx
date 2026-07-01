"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { upsertReminder, deleteReminder } from "@/lib/actions/quest-reminders";

type Reminder = {
  id: string;
  type: string;
  timeOfDay: string | null;
  channel: string;
  enabled: boolean;
};

export function QuestReminderForm({
  questId,
  reminders,
}: {
  questId: string;
  reminders: Reminder[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state for adding a new reminder
  const [newType, setNewType] = useState<"day_before" | "morning_of" | "custom">("morning_of");
  const [newTime, setNewTime] = useState("08:00");
  const [newChannel, setNewChannel] = useState<"email" | "push">("push");

  async function handleAdd() {
    setSaving(true);
    setError("");
    try {
      await upsertReminder(questId, {
        type: newType,
        timeOfDay: newType === "custom" ? newTime : undefined,
        channel: newChannel,
        enabled: true,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add reminder");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(reminder: Reminder) {
    await upsertReminder(questId, {
      type: reminder.type as "day_before" | "morning_of" | "custom",
      timeOfDay: reminder.timeOfDay ?? undefined,
      channel: reminder.channel as "email" | "push",
      enabled: !reminder.enabled,
    });
    router.refresh();
  }

  async function handleDelete(reminderId: string) {
    await deleteReminder(reminderId);
    router.refresh();
  }

  const typeLabels: Record<string, string> = {
    day_before: "Day Before",
    morning_of: "Morning Of",
    custom: "Custom Time",
  };

  return (
    <GameFrame title="Reminders" icon={<GameIcon name="bell" className="size-5 text-[var(--gold-bright)]" />}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {reminders.length > 0 && (
          <div className="space-y-2">
            {reminders.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border/50 bg-card/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <GameIcon
                    name={r.enabled ? "bell" : "bellOff"}
                    className={`size-4 ${r.enabled ? "text-[var(--gold-bright)]" : "text-muted-foreground"}`}
                  />
                  <span className={r.enabled ? "" : "text-muted-foreground line-through"}>
                    {typeLabels[r.type] ?? r.type}
                    {r.timeOfDay && ` at ${r.timeOfDay}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({r.channel})
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleToggle(r)}>
                    {r.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border border-border/30 p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Reminder</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="reminder-type">When</Label>
              <Select
                id="reminder-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as "day_before" | "morning_of" | "custom")}
              >
                <option value="morning_of">Morning Of</option>
                <option value="day_before">Day Before</option>
                <option value="custom">Custom Time</option>
              </Select>
            </div>
            {newType === "custom" && (
              <div className="space-y-1">
                <Label htmlFor="reminder-time">Time</Label>
                <Input
                  id="reminder-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="reminder-channel">Channel</Label>
              <Select
                id="reminder-channel"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as "email" | "push")}
              >
                <option value="push">Push</option>
                <option value="email">Email</option>
              </Select>
            </div>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saving}>
            {saving ? "Adding..." : "Add Reminder"}
          </Button>
        </div>
      </div>
    </GameFrame>
  );
}
