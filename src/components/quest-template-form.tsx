"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createQuest, updateQuest } from "@/lib/actions/quests";
import { upsertSchedule, deleteSchedule } from "@/lib/actions/quest-schedules";
import { getQuestUnlockableItems, getCategoryLabel } from "@/lib/utils/avatar-catalog";
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  defaultRepeatDaysForStartDate,
  syncRepeatDaysWithStartDate,
} from "@/lib/utils/schedule-days";
import { ANYTIME_DESCRIPTION } from "@/lib/utils/schedule-summary";
import { findMissingScheduleDays, formatDayList } from "@/lib/utils/schedule-gaps";

type Subject = { id: string; name: string; color: string | null };

type RepeatFrequency = "once" | "daily" | "weekly" | "monthly";

/**
 * Whether the quest is pinned to dates or startable any day. `null` is "not
 * answered yet" — a new quest starts here so that becoming an anytime quest is
 * something a parent picks, never something they get by not noticing a toggle.
 * Editing an existing quest starts on whatever it actually is today.
 */
type Availability = "anytime" | "scheduled" | null;

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"][n % 10 > 3 || Math.floor(n % 100 / 10) === 1 ? 0 : n % 10];
  return `${n}${suffix}`;
}

type QuestData = {
  id: string;
  title: string;
  subjectId: string;
  description: string | null;
  estimatedMinutes: number | null;
  rewardXp: number | null;
  rewardDescription: string | null;
  rewardAvatarItem: string | null;
  includeInLearningLog?: boolean;
  requireNotes?: boolean;
};

type ScheduleData = {
  id: string;
  frequency: string;
  daysOfWeek: string | null;
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

const ALL_AVATAR_REWARD_OPTIONS = getQuestUnlockableItems();

export function QuestTemplateForm({
  childId,
  subjects,
  quest,
  schedule,
  open,
  onClose,
  childUnlockedItems = [],
  assignedAvatarItems = [],
  schoolDays,
  blockDaysBySubject = {},
}: {
  childId: string;
  subjects: Subject[];
  quest?: QuestData;
  /** Existing repeat schedule for this quest, if any (edit mode only) */
  schedule?: ScheduleData | null;
  open: boolean;
  onClose: () => void;
  /** Item IDs the child has already unlocked via quest rewards */
  childUnlockedItems?: string[];
  /** Avatar reward JSON strings already assigned to other active quests */
  assignedAvatarItems?: string[];
  /** Weekday codes this child attends school on; constrains which repeat days can be picked */
  schoolDays: string[];
  /**
   * Weekdays each subject actually has class time on, keyed by subject id.
   * A quest scheduled onto a day its subject isn't taught still gets assigned —
   * it just has no slot to sit in, so it falls to the bottom of the day and, on
   * a structured day, behind everything that does have one. This is what lets
   * the form say so before the quest is saved.
   */
  blockDaysBySubject?: Record<string, string[]>;
}) {
  const router = useRouter();
  const isEditing = !!quest;
  const sortedSubjects = [...subjects].sort((a, b) => a.name.localeCompare(b.name));

  const [title, setTitle] = useState(quest?.title ?? "");
  const [subjectId, setSubjectId] = useState(quest?.subjectId ?? sortedSubjects[0]?.id ?? "");
  const [description, setDescription] = useState(quest?.description ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    quest?.estimatedMinutes?.toString() ?? ""
  );
  const [rewardXp, setRewardXp] = useState(quest?.rewardXp?.toString() ?? "");
  const [rewardDescription, setRewardDescription] = useState(quest?.rewardDescription ?? "");
  const [rewardAvatarItem, setRewardAvatarItem] = useState(quest?.rewardAvatarItem ?? "");
  const [showRewards, setShowRewards] = useState(
    !!(quest?.rewardXp || quest?.rewardDescription || quest?.rewardAvatarItem)
  );
  const [includeInLearningLog, setIncludeInLearningLog] = useState(
    quest?.includeInLearningLog ?? true
  );
  const [requireNotes, setRequireNotes] = useState(quest?.requireNotes ?? false);
  const defaultRepeatStartDate = schedule?.startDate ?? new Date().toISOString().slice(0, 10);
  const [availability, setAvailability] = useState<Availability>(
    isEditing ? (schedule ? "scheduled" : "anytime") : null
  );
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(
    (schedule?.frequency as RepeatFrequency) ?? "once"
  );
  const [repeatDays, setRepeatDays] = useState<string[]>(
    schedule?.daysOfWeek
      ? JSON.parse(schedule.daysOfWeek)
      : defaultRepeatDaysForStartDate(defaultRepeatStartDate, schoolDays)
  );
  const [repeatIntervalWeeks, setRepeatIntervalWeeks] = useState(schedule?.intervalWeeks ?? 1);
  const [repeatStartDate, setRepeatStartDate] = useState(defaultRepeatStartDate);
  const [repeatEndDate, setRepeatEndDate] = useState(schedule?.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The "New Quest" dialog stays mounted between opens (only `open` toggles), so
  // reset its fields each time it opens rather than leaving stale values from
  // the last quest that was created or cancelled.
  useEffect(() => {
    if (!open || isEditing) return;
    const today = new Date().toISOString().slice(0, 10);
    setTitle("");
    setSubjectId(sortedSubjects[0]?.id ?? "");
    setDescription("");
    setEstimatedMinutes("");
    setRewardXp("");
    setRewardDescription("");
    setRewardAvatarItem("");
    setShowRewards(false);
    setIncludeInLearningLog(true);
    setRequireNotes(false);
    setAvailability(null);
    setRepeatFrequency("once");
    setRepeatDays(defaultRepeatDaysForStartDate(today, schoolDays));
    setRepeatIntervalWeeks(1);
    setRepeatStartDate(today);
    setRepeatEndDate("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleRepeatDay(day: string) {
    if (!schoolDays.includes(day)) return;
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleRepeatStartDateChange(value: string) {
    setRepeatStartDate(value);
    if (repeatFrequency === "weekly") {
      setRepeatDays((prev) => syncRepeatDaysWithStartDate(prev, value, schoolDays));
    }
  }

  function handleSelectWeekly() {
    setRepeatFrequency("weekly");
    setRepeatDays((prev) => (prev.length > 0 ? prev : defaultRepeatDaysForStartDate(repeatStartDate, schoolDays)));
  }

  const subjectBlockDays = blockDaysBySubject[subjectId] ?? [];

  /**
   * Days this repeat would put the quest on that its subject has no class time
   * for. Recomputed live from the form's own state so a parent sees the gap
   * while they're still making it, not after the hero hits a quest with no
   * place in their day.
   */
  const missingScheduleDays = useMemo(() => {
    if (availability !== "scheduled" || !subjectId) return [];
    return findMissingScheduleDays({
      repeat: {
        frequency: repeatFrequency,
        daysOfWeek: repeatFrequency === "weekly" ? repeatDays : null,
        intervalWeeks: repeatFrequency === "weekly" ? repeatIntervalWeeks : null,
        startDate: repeatStartDate,
        endDate: repeatEndDate || null,
      },
      subjectBlockDays,
      schoolDays,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    availability,
    subjectId,
    repeatFrequency,
    repeatDays,
    repeatIntervalWeeks,
    repeatStartDate,
    repeatEndDate,
    blockDaysBySubject,
    schoolDays,
  ]);

  const subjectName = sortedSubjects.find((s) => s.id === subjectId)?.name ?? "This discipline";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const rewardFields = {
        rewardXp: rewardXp ? parseInt(rewardXp) : undefined,
        rewardDescription: rewardDescription || undefined,
        rewardAvatarItem: rewardAvatarItem || undefined,
      };

      if (availability === null) {
        throw new Error("Choose when this quest is available");
      }

      if (availability === "scheduled" && repeatFrequency === "weekly") {
        if (repeatDays.length === 0) {
          throw new Error("Pick at least one day for the quest to repeat on");
        }
        if (repeatIntervalWeeks < 1) {
          throw new Error("Repeat interval must be at least 1 week");
        }
      }

      const schedulePayload = availability === "scheduled"
        ? {
            frequency: repeatFrequency,
            daysOfWeek: repeatFrequency === "weekly" ? repeatDays : undefined,
            intervalWeeks: repeatFrequency === "weekly" ? repeatIntervalWeeks : undefined,
            startDate: repeatStartDate,
            endDate: repeatFrequency === "once" ? undefined : repeatEndDate || undefined,
          }
        : undefined;

      if (isEditing) {
        await updateQuest(quest.id, {
          title,
          subjectId,
          description,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
          rewardXp: rewardXp ? parseInt(rewardXp) : null,
          rewardDescription: rewardDescription || null,
          rewardAvatarItem: rewardAvatarItem || null,
          includeInLearningLog,
          requireNotes,
        });

        if (schedulePayload) {
          await upsertSchedule(quest.id, schedulePayload);
        } else if (schedule) {
          await deleteSchedule(quest.id);
        }
      } else {
        await createQuest({
          childId,
          subjectId,
          title,
          description: description || undefined,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
          ...rewardFields,
          includeInLearningLog,
          requireNotes,
          schedule: schedulePayload,
        });
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quest");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Quest" : "New Quest"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="quest-title">Quest Title</Label>
            <Input
              id="quest-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Read Chapter 5 of the Ancient Tome"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-subject">Discipline</Label>
            <Select
              id="quest-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            >
              {sortedSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-duration">Estimated Duration (minutes)</Label>
            <Input
              id="quest-duration"
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="30"
              min={1}
              max={480}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quest-description">Description (optional)</Label>
            <Input
              id="quest-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Complete exercises 1-10, review vocabulary"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="quest-learning-log">Include in learning log</Label>
              <p className="text-[10px] text-muted-foreground">
                Completed assignments for this quest appear in the weekly learning log
              </p>
            </div>
            <Switch
              checked={includeInLearningLog}
              onCheckedChange={() => setIncludeInLearningLog((v) => !v)}
              aria-label="Include in learning log"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="quest-require-notes">Require Scribe&apos;s Notes</Label>
              <p className="text-[10px] text-muted-foreground">
                Hero must describe what they did before this quest can be marked complete
              </p>
            </div>
            <Switch
              checked={requireNotes}
              onCheckedChange={() => setRequireNotes((v) => !v)}
              aria-label="Require Scribe's Notes"
            />
          </div>

          {/* Availability: an explicit question, because "no schedule" is a real
              state with real consequences and must never be arrived at by default. */}
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="space-y-0.5">
              <Label>When can this quest be done?</Label>
              <p className="text-[10px] text-muted-foreground">
                Both answers behave differently — pick the one you want.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={availability === "anytime" ? "default" : "outline"}
                onClick={() => { setAvailability("anytime"); setError(""); }}
                aria-pressed={availability === "anytime"}
              >
                Anytime
              </Button>
              <Button
                type="button"
                size="sm"
                variant={availability === "scheduled" ? "default" : "outline"}
                onClick={() => { setAvailability("scheduled"); setError(""); }}
                aria-pressed={availability === "scheduled"}
              >
                On a schedule
              </Button>
            </div>

            {availability === null && (
              <p className="text-[10px] text-muted-foreground">
                Choose one to continue.
              </p>
            )}

            {availability === "anytime" && (
              <p className="text-[10px] text-muted-foreground">{ANYTIME_DESCRIPTION}</p>
            )}

            {availability === "scheduled" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={repeatFrequency === "once" ? "default" : "outline"}
                      onClick={() => setRepeatFrequency("once")}
                    >
                      Once
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={repeatFrequency === "daily" ? "default" : "outline"}
                      onClick={() => setRepeatFrequency("daily")}
                    >
                      Daily
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={repeatFrequency === "weekly" ? "default" : "outline"}
                      onClick={handleSelectWeekly}
                    >
                      Weekly
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={repeatFrequency === "monthly" ? "default" : "outline"}
                      onClick={() => setRepeatFrequency("monthly")}
                    >
                      Monthly
                    </Button>
                  </div>
                </div>

                {repeatFrequency === "weekly" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="repeat-interval">Repeat every</Label>
                      <Input
                        id="repeat-interval"
                        type="number"
                        value={repeatIntervalWeeks}
                        onChange={(e) => setRepeatIntervalWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                        min={1}
                        max={12}
                        className="w-16"
                      />
                      <span className="text-sm text-muted-foreground">
                        week{repeatIntervalWeeks === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Label>Days of the Week</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.filter((day) => schoolDays.includes(day)).map((day) => (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={repeatDays.includes(day) ? "default" : "outline"}
                          onClick={() => toggleRepeatDay(day)}
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

                {repeatFrequency === "monthly" && (
                  <p className="text-[10px] text-muted-foreground">
                    Repeats on the {ordinal(new Date(repeatStartDate + "T00:00:00Z").getUTCDate())} of every month
                    (skipping non-school days).
                  </p>
                )}

                {repeatFrequency === "once" && (
                  <p className="text-[10px] text-muted-foreground">
                    This quest will be assigned only on the date below.
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="repeat-start">{repeatFrequency === "once" ? "Date" : "Start Date"}</Label>
                    <Input
                      id="repeat-start"
                      type="date"
                      value={repeatStartDate}
                      onChange={(e) => handleRepeatStartDateChange(e.target.value)}
                      required
                    />
                  </div>
                  {repeatFrequency !== "once" && (
                    <div className="space-y-2">
                      <Label htmlFor="repeat-end">End Date (optional)</Label>
                      <Input
                        id="repeat-end"
                        type="date"
                        value={repeatEndDate}
                        onChange={(e) => setRepeatEndDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* The quest's repeat and the weekly schedule are joined only by
                    discipline, so this pairing is easy to make by accident and
                    invisible afterwards — the assignment is still created, it
                    just has no class time to sit in. Say so here, where it can
                    still be fixed, rather than leaving a hero to find it. */}
                {missingScheduleDays.length > 0 && (
                  <div className="space-y-1.5 rounded-md border border-[var(--gold-dim)] bg-[rgba(201,168,76,0.08)] p-3">
                    <p className="text-xs font-semibold text-[var(--gold-bright)]">
                      {subjectBlockDays.length === 0
                        ? `${subjectName} isn't on the weekly schedule at all.`
                        : `${subjectName} has no class time on ${formatDayList(missingScheduleDays)}.`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      This quest will still be assigned, but on{" "}
                      {formatDayList(missingScheduleDays)} it lands at the bottom of Today&apos;s
                      Quests with no time on it — and on a structured day a hero can&apos;t reach it
                      until everything that does have a time slot is done.
                    </p>
                    <a
                      href={`/schedule?child=${childId}`}
                      className="inline-block text-[10px] font-medium text-primary hover:underline"
                    >
                      Add {subjectName} to the weekly schedule →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quest Rewards Section */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowRewards(!showRewards)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showRewards ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Quest Rewards (optional)
            </button>

            {showRewards && (
              <div className="space-y-3 rounded-lg border border-dashed border-[var(--gold-dim)] bg-[rgba(201,168,76,0.04)] p-3">
                <div className="space-y-2">
                  <Label htmlFor="reward-xp">Bonus XP Reward</Label>
                  <Input
                    id="reward-xp"
                    type="number"
                    value={rewardXp}
                    onChange={(e) => setRewardXp(e.target.value)}
                    placeholder="e.g. 25"
                    min={5}
                    max={100}
                  />
                  <p className="text-[10px] text-muted-foreground">Extra XP on top of the standard 10 XP per quest</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reward-description">Custom Reward</Label>
                  <Input
                    id="reward-description"
                    value={rewardDescription}
                    onChange={(e) => setRewardDescription(e.target.value)}
                    placeholder="e.g. 30 min screen time, pick dinner tonight"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reward-avatar">Item Unlock</Label>
                  <Select
                    id="reward-avatar"
                    value={rewardAvatarItem}
                    onChange={(e) => setRewardAvatarItem(e.target.value)}
                  >
                    <option value="">No item reward</option>
                    {ALL_AVATAR_REWARD_OPTIONS.map(({ category, item }) => {
                      const jsonVal = JSON.stringify({ category, itemId: item.id });
                      const alreadyUnlocked = childUnlockedItems.includes(item.id);
                      const alreadyAssigned = assignedAvatarItems.some((a) => {
                        try {
                          const parsed = JSON.parse(a) as { itemId: string };
                          return parsed.itemId === item.id;
                        } catch { return false; }
                      });
                      // Allow re-selecting the item that's already on THIS quest
                      const isCurrentQuest = rewardAvatarItem === jsonVal || quest?.rewardAvatarItem === jsonVal;
                      const disabled = alreadyUnlocked || (alreadyAssigned && !isCurrentQuest);
                      const suffix = alreadyUnlocked
                        ? " (already unlocked)"
                        : alreadyAssigned && !isCurrentQuest
                          ? " (assigned to another quest)"
                          : "";
                      return (
                        <option
                          key={`${category}-${item.id}`}
                          value={jsonVal}
                          disabled={disabled}
                        >
                          {getCategoryLabel(category)}: {item.label}{suffix}
                        </option>
                      );
                    })}
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Unlock a special avatar item or spell part when this quest is completed</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update Quest" : "Create Quest"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
