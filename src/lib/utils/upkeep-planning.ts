import { getScheduledDates } from "@/lib/utils/schedule";

/** A task schedule as it is stored — daysOfWeek is still a JSON string here. */
export type UpkeepScheduleShape = {
  frequency: "once" | "daily" | "weekly" | "monthly";
  daysOfWeek: string | null;
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

export type PlannableTask = {
  taskId: string;
  schedule: UpkeepScheduleShape;
};

/** Stable key for "this task on this day", used to dedupe against existing rows. */
export function assignmentKey(taskId: string, date: string): string {
  return `${taskId}:${date}`;
}

function parseDaysOfWeek(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    // A corrupt column must not take assignment generation down for the whole
    // family; the schedule simply plans nothing until it is fixed.
    return null;
  }
}

/**
 * Expands every task's schedule across [rangeStart, rangeEnd] and returns the
 * rows that do not exist yet.
 *
 * `getScheduledDates` is reused exactly as quests use it, with one difference
 * that is the whole point: `schoolDays` is null, so chores are planned on every
 * day the pattern names — weekends and school breaks included.
 */
export function planUpkeepAssignments(
  tasks: PlannableTask[],
  existingKeys: Set<string>,
  rangeStart: string,
  rangeEnd: string
): { taskId: string; date: string }[] {
  const planned: { taskId: string; date: string }[] = [];
  const seen = new Set(existingKeys);

  for (const task of tasks) {
    const dates = getScheduledDates(
      task.schedule.frequency,
      parseDaysOfWeek(task.schedule.daysOfWeek),
      task.schedule.intervalWeeks,
      task.schedule.startDate,
      task.schedule.endDate,
      rangeStart,
      rangeEnd,
      null // chores are never limited to school days
    );

    for (const date of dates) {
      const key = assignmentKey(task.taskId, date);
      if (seen.has(key)) continue;
      seen.add(key);
      planned.push({ taskId: task.taskId, date });
    }
  }

  return planned;
}
