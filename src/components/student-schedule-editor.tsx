"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import {
  copyScheduleBlocks,
  createScheduleBlock,
  deleteScheduleBlock,
  setSchoolDays,
  setStreakOptionalDay,
  updateScheduleBlock,
  updateScheduleSlotTime,
} from "@/lib/actions/student-schedule";
import {
  DAYS_OF_WEEK,
  addMinutesToTime,
  formatTimeOfDay,
  findSlotConflict,
  timeToMinutes,
  todayDayOfWeek,
  type DayOfWeek,
} from "@/lib/utils/schedule-days";

const LAST_SLOT_KEY = "kingdomsandcrowns-last-schedule-slot";
const DEFAULT_SLOT_DURATION_MINUTES = 45;

function readLastTimeSlot(): { startTime: string; endTime: string } | null {
  try {
    const raw = localStorage.getItem(LAST_SLOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.startTime === "string" && typeof parsed?.endTime === "string") {
      return parsed;
    }
  } catch {
    // ignore malformed/inaccessible storage
  }
  return null;
}

function writeLastTimeSlot(startTime: string, endTime: string) {
  try {
    localStorage.setItem(LAST_SLOT_KEY, JSON.stringify({ startTime, endTime }));
  } catch {
    // ignore inaccessible storage
  }
}

/**
 * Defaults a new block to start right where the day's last class ends (falling back to the
 * last slot used anywhere), keeping the same duration. Because times are plain minutes-since-
 * midnight arithmetic, a slot that crosses noon rolls from AM to PM on its own.
 */
function defaultTimeSlot(existingBlocksForDay: { endTime: string }[]) {
  const lastEndForDay = existingBlocksForDay.reduce<string | null>(
    (latest, b) => (latest === null || b.endTime > latest ? b.endTime : latest),
    null
  );
  const lastSlot = readLastTimeSlot();
  const startTime = lastEndForDay ?? lastSlot?.endTime ?? "09:00";
  const lastDuration = lastSlot ? timeToMinutes(lastSlot.endTime) - timeToMinutes(lastSlot.startTime) : 0;
  const duration = lastDuration > 0 ? lastDuration : DEFAULT_SLOT_DURATION_MINUTES;
  return { startTime, endTime: addMinutesToTime(startTime, duration) };
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

type Subject = { id: string; name: string; color: string | null };

type Block = {
  id: string;
  subjectId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

/** One period on the timetable, and every subject taught in it. */
type Slot = {
  /** Stable identity for a slot across re-renders: its time range. */
  key: string;
  startTime: string;
  endTime: string;
  blocks: Block[];
};

/**
 * Collapses a day's blocks into the periods they actually occupy, earliest
 * first, with the subjects inside each period in name order. Two subjects
 * sharing a slot are one row on the timetable, not two rows that happen to
 * print the same clock time.
 */
function groupIntoSlots(blocks: Block[], subjects: Subject[]): Slot[] {
  const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? "";
  const bySlot = new Map<string, Slot>();
  for (const block of blocks) {
    const key = `${block.startTime}-${block.endTime}`;
    const slot = bySlot.get(key) ?? { key, startTime: block.startTime, endTime: block.endTime, blocks: [] };
    slot.blocks.push(block);
    bySlot.set(key, slot);
  }
  for (const slot of bySlot.values()) {
    slot.blocks.sort((a, b) => nameOf(a.subjectId).localeCompare(nameOf(b.subjectId)));
  }
  return [...bySlot.values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
  );
}

export function StudentScheduleEditor({
  childId,
  subjects,
  schoolDays,
  optionalDays,
  blocks,
  canEdit,
}: {
  childId: string;
  subjects: Subject[];
  schoolDays: DayOfWeek[];
  optionalDays: DayOfWeek[];
  blocks: Block[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<DayOfWeek>>(() => new Set([todayDayOfWeek()]));
  const allExpanded = expandedDays.size === DAYS_OF_WEEK.length;

  function toggleDayExpanded(day: DayOfWeek) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  function toggleAllExpanded() {
    setExpandedDays(allExpanded ? new Set() : new Set(DAYS_OF_WEEK));
  }

  async function toggleSchoolDay(day: DayOfWeek) {
    setError("");
    const next = schoolDays.includes(day)
      ? schoolDays.filter((d) => d !== day)
      : DAYS_OF_WEEK.filter((d) => schoolDays.includes(d) || d === day);
    try {
      await setSchoolDays(childId, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update school days");
    }
  }

  async function toggleOptionalDay(day: DayOfWeek) {
    setError("");
    try {
      await setStreakOptionalDay(childId, day, !optionalDays.includes(day));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update optional days");
    }
  }

  return (
    <GameFrame
      title="Weekly Schedule"
      icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Only a parent can change this schedule right now.
          </p>
        )}
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={toggleAllExpanded}>
            {allExpanded ? "Collapse All" : "Expand All"}
          </Button>
        </div>
        <div className="space-y-3">
          {DAYS_OF_WEEK.map((day) => (
            <DayRow
              key={day}
              childId={childId}
              day={day}
              isSchoolDay={schoolDays.includes(day)}
              isOptionalDay={optionalDays.includes(day)}
              subjects={subjects}
              blocks={blocks.filter((b) => b.dayOfWeek === day)}
              allBlocks={blocks}
              canEdit={canEdit}
              onToggleSchoolDay={() => toggleSchoolDay(day)}
              onToggleOptionalDay={() => toggleOptionalDay(day)}
              expanded={expandedDays.has(day)}
              onToggleExpanded={() => toggleDayExpanded(day)}
            />
          ))}
        </div>
      </div>
    </GameFrame>
  );
}

function DayRow({
  childId,
  day,
  isSchoolDay,
  isOptionalDay,
  subjects,
  blocks,
  allBlocks,
  canEdit,
  onToggleSchoolDay,
  onToggleOptionalDay,
  expanded,
  onToggleExpanded,
}: {
  childId: string;
  day: DayOfWeek;
  isSchoolDay: boolean;
  isOptionalDay: boolean;
  subjects: Subject[];
  blocks: Block[];
  allBlocks: Block[];
  canEdit: boolean;
  onToggleSchoolDay: () => void;
  onToggleOptionalDay: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "add" | "copy">("none");
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [addingToSlot, setAddingToSlot] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The day is kept as time slots, not as blocks: a slot that covers two
  // subjects is one thing on the timetable, and listing it twice under the same
  // clock time read as two classes running at once.
  const slots = groupIntoSlots(blocks, subjects);
  const otherDays = DAYS_OF_WEEK.filter((d) => d !== day).map((d) => ({
    day: d,
    count: allBlocks.filter((b) => b.dayOfWeek === d).length,
  }));

  async function handleRemove(blockId: string) {
    try {
      await deleteScheduleBlock(blockId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove class");
    }
  }

  /** Only one form is open at a time, so an in-progress edit is never silently discarded. */
  function startEditing(slotKey: string) {
    setMode("none");
    setAddingToSlot(null);
    setEditingSlot(slotKey);
    setError("");
  }

  function startAdding(slotKey: string) {
    setMode("none");
    setEditingSlot(null);
    setAddingToSlot(slotKey);
    setError("");
  }

  function startMode(next: "add" | "copy") {
    setEditingSlot(null);
    setAddingToSlot(null);
    setMode(next);
    setError("");
  }

  function closeForm() {
    setMode("none");
    setEditingSlot(null);
    setAddingToSlot(null);
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        isSchoolDay ? "border-gold-dim bg-secondary/30" : "border-border/40 bg-muted/10"
      }`}
    >
      {/* Wraps rather than squeezes: the toggle beside it is a fixed width, and
          a flex row that can't wrap pays for that by crushing the day name down
          to one letter per line on a phone. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 grow basis-40 flex-wrap items-center gap-x-2 gap-y-1 text-left"
          aria-expanded={expanded}
        >
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          <h4 className="shrink-0 text-base font-medium">{DAY_LABELS[day]}</h4>
          {isSchoolDay && (
            <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
              ({blocks.length} class{blocks.length === 1 ? "" : "es"})
            </span>
          )}
          {isSchoolDay && isOptionalDay && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Optional
            </span>
          )}
        </button>
        {canEdit ? (
          <label className="flex shrink-0 cursor-pointer items-center gap-2.5 select-none">
            <span
              className={`text-sm font-medium whitespace-nowrap ${isSchoolDay ? "text-foreground" : "text-muted-foreground"}`}
            >
              {isSchoolDay ? "School Day" : "Day Off"}
            </span>
            <Switch
              checked={isSchoolDay}
              onCheckedChange={onToggleSchoolDay}
              aria-label={`Toggle ${DAY_LABELS[day]} as a school day`}
            />
          </label>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
              isSchoolDay ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {isSchoolDay ? "School Day" : "Day Off"}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
      )}

      {isSchoolDay && expanded && (
        <div className="mt-3 space-y-2">
          {canEdit && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/30 bg-background/40 px-3 py-2 select-none">
              <span className="min-w-0">
                <span className="text-sm">Optional day</span>
                <span className="block text-xs text-muted-foreground">
                  A quiet {DAY_LABELS[day]} won&apos;t break the streak.
                </span>
              </span>
              <Switch
                checked={isOptionalDay}
                onCheckedChange={onToggleOptionalDay}
                aria-label={`Make ${DAY_LABELS[day]} optional for streaks`}
              />
            </label>
          )}
          {slots.length === 0 && (
            <p className="text-sm text-muted-foreground">No classes scheduled.</p>
          )}
          {slots.map((slot) => {
            if (editingSlot === slot.key) {
              return (
                <SlotTimeForm
                  key={slot.key}
                  childId={childId}
                  day={day}
                  slot={slot}
                  subjects={subjects}
                  otherSlots={slots.filter((other) => other.key !== slot.key)}
                  onDone={closeForm}
                  onError={setError}
                />
              );
            }
            return (
              <div
                key={slot.key}
                className="rounded-md border border-border/30 bg-background/40 px-3 py-2"
              >
                {/* The clock time and the controls drop to their own line on a
                    phone. Side by side they're wide enough, and fixed enough,
                    to leave the subject column a single character wide. */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  {/* Every subject in the slot on one line — this is one class
                      period that happens to cover more than one discipline. */}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    {slot.blocks.map((block) => {
                      const subject = subjects.find((sub) => sub.id === block.subjectId);
                      return (
                        <span key={block.id} className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="size-3 shrink-0 rounded-full"
                            style={{ backgroundColor: subject?.color ?? "#6b7280" }}
                          />
                          <span className="min-w-0 text-sm break-words">
                            {subject?.name ?? "Unknown"}
                          </span>
                          {canEdit && slot.blocks.length > 1 && (
                            <Button
                              size="xs"
                              variant="ghost"
                              className="!px-1 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemove(block.id)}
                              aria-label={`Remove ${subject?.name ?? "class"} from the ${formatTimeOfDay(slot.startTime)} slot on ${DAY_LABELS[day]}`}
                              title={`Remove ${subject?.name ?? "this subject"} from this slot`}
                            >
                              ×
                            </Button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-1 sm:justify-end sm:gap-2">
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                      {formatTimeOfDay(slot.startTime)}&ndash;{formatTimeOfDay(slot.endTime)}
                    </span>
                    {canEdit && (
                      <>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => startAdding(slot.key)}
                          aria-label={`Add a subject to the ${formatTimeOfDay(slot.startTime)} slot on ${DAY_LABELS[day]}`}
                          title="Add another subject to this time slot"
                        >
                          +
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => startEditing(slot.key)}
                          aria-label={`Edit the ${formatTimeOfDay(slot.startTime)} slot on ${DAY_LABELS[day]}`}
                        >
                          <svg
                            className="size-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                            />
                          </svg>
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => slot.blocks.forEach((block) => handleRemove(block.id))}
                          aria-label={`Remove the ${formatTimeOfDay(slot.startTime)} slot from ${DAY_LABELS[day]}`}
                          title={slot.blocks.length > 1 ? "Remove this whole time slot" : "Remove this class"}
                        >
                          ×
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {/* Adding to a slot only ever needs the subject — the time is
                    already decided by the slot it's joining, so there's nothing
                    to re-type and nothing to confirm. */}
                {addingToSlot === slot.key && (
                  <AddToSlotForm
                    childId={childId}
                    day={day}
                    slot={slot}
                    subjects={subjects}
                    onDone={closeForm}
                    onError={setError}
                  />
                )}
              </div>
            );
          })}

          {canEdit && (
            <>
              {mode === "add" && (
                <BlockForm
                  childId={childId}
                  day={day}
                  subjects={subjects}
                  existingBlocks={blocks}
                  onDone={closeForm}
                  onError={setError}
                />
              )}
              {mode === "copy" && (
                <CopyDayForm
                  childId={childId}
                  day={day}
                  otherDays={otherDays}
                  onDone={closeForm}
                  onError={setError}
                />
              )}
              {mode === "none" && editingSlot === null && addingToSlot === null && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startMode("add")}>
                    + Add Class
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startMode("copy")}>
                    Copy Day
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Drops another subject into a slot that already exists.
 *
 * Deliberately just a subject picker: the period's time is settled by the slot
 * it's joining, so there's nothing to re-type, nothing to get wrong, and
 * nothing to confirm. Subjects already in the slot aren't offered, which is
 * what the duplicate check used to catch after the fact.
 */
function AddToSlotForm({
  childId,
  day,
  slot,
  subjects,
  onDone,
  onError,
}: {
  childId: string;
  day: DayOfWeek;
  slot: Slot;
  subjects: Subject[];
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const taken = new Set(slot.blocks.map((b) => b.subjectId));
  const available = subjects
    .filter((s) => !taken.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [subjectId, setSubjectId] = useState(available[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  if (available.length === 0) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/30 pt-2">
        <p className="text-xs text-muted-foreground">
          Every discipline is already in this slot.
        </p>
        <Button size="xs" variant="ghost" type="button" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  async function handleAdd() {
    if (!subjectId) return;
    setSaving(true);
    onError("");
    try {
      await createScheduleBlock(childId, {
        subjectId,
        dayOfWeek: day,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      router.refresh();
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add subject to this slot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/30 pt-2">
      <Label className="text-xs text-muted-foreground">Also in this slot</Label>
      <Select
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        className="h-8 w-auto min-w-[9rem]"
        aria-label={`Subject to add to the ${formatTimeOfDay(slot.startTime)} slot on ${DAY_LABELS[day]}`}
      >
        {available.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Button size="xs" type="button" disabled={saving} onClick={handleAdd}>
        {saving ? "Adding..." : "Add"}
      </Button>
      <Button size="xs" variant="ghost" type="button" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * Retimes a slot, moving every subject in it together.
 *
 * When the slot holds a single class its subject can be swapped here too — the
 * familiar "edit this class" shape. With two or more, changing subjects is what
 * the per-subject × and the + are for, so this stays purely about the time.
 */
function SlotTimeForm({
  childId,
  day,
  slot,
  subjects,
  otherSlots,
  onDone,
  onError,
}: {
  childId: string;
  day: DayOfWeek;
  slot: Slot;
  subjects: Subject[];
  otherSlots: Slot[];
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const onlyBlock = slot.blocks.length === 1 ? slot.blocks[0] : null;
  const sortedSubjects = [...subjects].sort((a, b) => a.name.localeCompare(b.name));
  const [subjectId, setSubjectId] = useState(onlyBlock?.subjectId ?? "");
  const [startTime, setStartTime] = useState(slot.startTime);
  const [endTime, setEndTime] = useState(slot.endTime);
  const [saving, setSaving] = useState(false);
  const fieldId = `slot-${day}-${slot.key}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (startTime >= endTime) {
      onError("End time must be after start time.");
      return;
    }

    // Same rule the server enforces, checked against the slots this one isn't
    // part of, so the form never offers a move that's about to be refused.
    const others = otherSlots.flatMap((other) => other.blocks);
    for (const block of slot.blocks) {
      const candidateSubject = onlyBlock ? subjectId : block.subjectId;
      const conflict = findSlotConflict(others, { subjectId: candidateSubject, startTime, endTime });
      if (conflict) {
        const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? "another class";
        onError(
          conflict.kind === "overlap"
            ? `That overlaps part of ${name(conflict.block.subjectId)} (${formatTimeOfDay(conflict.block.startTime)}–${formatTimeOfDay(conflict.block.endTime)}). Use its exact start and end time to share the slot, or pick a free time.`
            : `${name(candidateSubject)} is already in that time slot.`
        );
        return;
      }
    }

    setSaving(true);
    onError("");
    try {
      if (onlyBlock) {
        await updateScheduleBlock(onlyBlock.id, { subjectId, startTime, endTime });
      } else {
        await updateScheduleSlotTime(childId, day, slot, { startTime, endTime });
      }
      writeLastTimeSlot(startTime, endTime);
      router.refresh();
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update this slot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border/30 bg-background/40 p-3">
      {onlyBlock ? (
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-subject`} className="text-xs">Subject</Label>
          <Select
            id={`${fieldId}-subject`}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {sortedSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Moving this slot moves all {slot.blocks.length} disciplines in it together.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-start`} className="text-xs">Start</Label>
          <Input
            id={`${fieldId}-start`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-end`} className="text-xs">End</Label>
          <Input
            id={`${fieldId}-end`}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Starts a brand-new period on this day. Editing an existing one is
 * SlotTimeForm's job, and adding a subject to an existing one is
 * AddToSlotForm's — both of which already know their time, so this is the only
 * place a parent still types one in.
 */
function BlockForm({
  childId,
  day,
  subjects,
  existingBlocks,
  onDone,
  onError,
}: {
  childId: string;
  day: DayOfWeek;
  subjects: Subject[];
  existingBlocks: Block[];
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const sortedSubjects = [...subjects].sort((a, b) => a.name.localeCompare(b.name));
  const [subjectId, setSubjectId] = useState(sortedSubjects[0]?.id ?? "");
  const [defaults] = useState(() => defaultTimeSlot(existingBlocks));
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId) {
      onError("Add a subject for this hero first.");
      return;
    }
    if (startTime >= endTime) {
      onError("End time must be after start time.");
      return;
    }
    const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? "another class";

    // Same rule the server enforces, so the form never offers a placement that
    // is about to be refused. Landing exactly on an existing slot is allowed and
    // needs no confirming — it just joins that period, which is the same thing
    // the "+" on the row does.
    const conflict = findSlotConflict(existingBlocks, { subjectId, startTime, endTime });
    if (conflict) {
      const other = conflict.block;
      onError(
        conflict.kind === "overlap"
          ? `That overlaps part of ${nameOf(other.subjectId)} (${formatTimeOfDay(other.startTime)}–${formatTimeOfDay(other.endTime)}). Use its exact start and end time to share the slot, or pick a free time.`
          : `${nameOf(subjectId)} is already in this time slot.`
      );
      return;
    }

    setSaving(true);
    onError("");
    try {
      await createScheduleBlock(childId, { subjectId, dayOfWeek: day, startTime, endTime });
      writeLastTimeSlot(startTime, endTime);
      router.refresh();
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add class");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border/30 bg-background/40 p-3">
      <div className="space-y-1">
        <Label htmlFor={`new-${day}-subject`} className="text-xs">Subject</Label>
        <Select
          id={`new-${day}-subject`}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {sortedSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`new-${day}-start`} className="text-xs">Start</Label>
          <Input
            id={`new-${day}-start`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`new-${day}-end`} className="text-xs">End</Label>
          <Input
            id={`new-${day}-end`}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CopyDayForm({
  childId,
  day,
  otherDays,
  onDone,
  onError,
}: {
  childId: string;
  day: DayOfWeek;
  otherDays: { day: DayOfWeek; count: number }[];
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const withBlocks = otherDays.filter((d) => d.count > 0);
  const [fromDay, setFromDay] = useState<DayOfWeek | "">(withBlocks[0]?.day ?? "");
  const [saving, setSaving] = useState(false);

  async function handleCopy() {
    if (!fromDay) return;
    if (
      !confirm(
        `Copy ${DAY_LABELS[fromDay]}'s schedule to ${DAY_LABELS[day]}? This will replace any classes currently on ${DAY_LABELS[day]}.`
      )
    ) {
      return;
    }
    setSaving(true);
    onError("");
    try {
      await copyScheduleBlocks(childId, fromDay, day);
      router.refresh();
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to copy schedule");
    } finally {
      setSaving(false);
    }
  }

  if (withBlocks.length === 0) {
    return (
      <div className="rounded-md border border-border/30 bg-background/40 p-3 text-sm text-muted-foreground">
        No other days have classes to copy yet.
        <div className="mt-2">
          <Button size="sm" variant="ghost" type="button" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border/30 bg-background/40 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Copy from</Label>
        <Select value={fromDay} onChange={(e) => setFromDay(e.target.value as DayOfWeek)}>
          {withBlocks.map(({ day: d, count }) => (
            <option key={d} value={d}>
              {DAY_LABELS[d]} ({count} class{count === 1 ? "" : "es"})
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="button" disabled={saving} onClick={handleCopy}>
          {saving ? "Copying..." : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
