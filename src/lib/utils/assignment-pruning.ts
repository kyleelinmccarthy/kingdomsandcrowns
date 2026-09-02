import { getScheduledDates } from "@/lib/utils/schedule";

export type PruneSchedule = {
  frequency: "once" | "daily" | "weekly" | "monthly";
  daysOfWeek: string | null; // JSON array, as stored
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

export type PendingAssignmentRow = {
  id: string;
  sourceId: string;
  date: string; // ISO YYYY-MM-DD
  sourceIsActive: boolean;
  /** The quest's schedule as it stands *now*, or null when the quest has none. */
  schedule: PruneSchedule | null;
};

/**
 * Decides which already-materialized `pending` assignments no longer belong to
 * the plan, so removing the thing that generated them — or its repeat —
 * actually clears it out of the day's list instead of leaving orphan rows.
 *
 * Shared by quests and upkeep tasks: `sourceId` is whichever template owns the
 * assignment. Only `pending` rows should ever be handed in — completed rows are
 * the child's history and must survive a template being retired.
 *
 * Three rules, in order:
 *  - The source was removed (soft-deleted) -> every pending row is stale.
 *  - The source still has a schedule -> a pending row is stale unless the
 *    schedule, as it reads today, still calls for that date. This prunes
 *    leftovers when a repeat is narrowed or given an end date.
 *  - The source has no schedule -> keep. Unscheduled templates produce ad hoc
 *    assignments that are never the scheduler's to delete.
 */
export function findStaleAssignmentIds(
  rows: PendingAssignmentRow[],
  opts: { rangeStart: string; rangeEnd: string; schoolDays: string[] | null }
): string[] {
  const scheduledDatesBySourceId = new Map<string, Set<string>>();
  const stale: string[] = [];

  for (const row of rows) {
    if (!row.sourceIsActive) {
      stale.push(row.id);
      continue;
    }
    if (!row.schedule) continue;

    let dates = scheduledDatesBySourceId.get(row.sourceId);
    if (!dates) {
      dates = new Set(scheduledDatesForRange(row.schedule, opts));
      scheduledDatesBySourceId.set(row.sourceId, dates);
    }
    if (!dates.has(row.date)) stale.push(row.id);
  }

  return stale;
}

function scheduledDatesForRange(
  schedule: PruneSchedule,
  opts: { rangeStart: string; rangeEnd: string; schoolDays: string[] | null }
): string[] {
  const daysOfWeek = schedule.daysOfWeek ? (JSON.parse(schedule.daysOfWeek) as string[]) : null;
  return getScheduledDates(
    schedule.frequency,
    daysOfWeek,
    schedule.intervalWeeks,
    schedule.startDate,
    schedule.endDate,
    opts.rangeStart,
    opts.rangeEnd,
    opts.schoolDays
  );
}
