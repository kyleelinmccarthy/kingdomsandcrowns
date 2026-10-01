import { getScheduledDates } from "./schedule";
import { addDays } from "./dates";
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  weekdayOfDate,
  type DayOfWeek,
} from "./schedule-days";

/**
 * A quest's repeat pattern says *which days* it comes up; the weekly schedule
 * says *what time* a subject is taught. Nothing joins them but the subject, so
 * a parent can schedule a Tuesday quest for a subject that has no Tuesday
 * class — and the assignment is generated all the same, with nowhere on the
 * day to sit. Structured mode is the weekly schedule walked in order, so those
 * quests fall to the very end of the queue behind everything with a real time
 * slot, and the parent who created the gap is never told.
 *
 * These helpers find that gap so it can be shown where it's made and fixed.
 */

/**
 * How far ahead to look when working out which weekdays a repeat actually
 * lands on. Six months covers roughly six monthly occurrences — far more than
 * enough to see every weekday a pattern can produce.
 */
const LOOKAHEAD_DAYS = 180;

export type QuestRepeat = {
  frequency: string;
  /** Accepts either the parsed array or the JSON string as stored on the row. */
  daysOfWeek: string[] | string | null;
  intervalWeeks: number | null;
  startDate: string;
  endDate: string | null;
};

/** Reads `daysOfWeek` in either of the two shapes it travels in, dropping anything unrecognized. */
function parseDayList(raw: string[] | string | null): DayOfWeek[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : safeParseArray(raw);
  return DAYS_OF_WEEK.filter((d) => list.includes(d));
}

/** A complete "YYYY-MM-DD" that names a real calendar day. */
function isIsoDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * The weekdays a repeat will actually put a quest on, in calendar order.
 * Derived by running the real generator over a lookahead window rather than
 * re-deriving the rules here, so this can never drift from what
 * generateAssignmentsFromSchedules produces.
 */
export function scheduledWeekdays(repeat: QuestRepeat, schoolDays: string[]): DayOfWeek[] {
  // Called with live form state as a parent types, so a half-finished date has
  // to fall out quietly rather than reach the date math.
  if (!repeat.frequency || !isIsoDate(repeat.startDate)) return [];
  if (repeat.endDate && !isIsoDate(repeat.endDate)) return [];

  const horizon = addDays(repeat.startDate, LOOKAHEAD_DAYS);
  const rangeEnd = repeat.endDate && repeat.endDate < horizon ? repeat.endDate : horizon;

  const dates = getScheduledDates(
    repeat.frequency as "once" | "daily" | "weekly" | "monthly",
    parseDayList(repeat.daysOfWeek),
    repeat.intervalWeeks,
    repeat.startDate,
    repeat.endDate,
    repeat.startDate,
    rangeEnd,
    schoolDays.length > 0 ? schoolDays : null
  );

  const found = new Set(dates.map(weekdayOfDate));
  return DAYS_OF_WEEK.filter((d) => found.has(d));
}

/**
 * The days this repeat lands on that the subject has no class time for.
 * Empty means every day the quest comes up has a slot to sit in.
 */
export function findMissingScheduleDays(params: {
  repeat: QuestRepeat;
  /** Weekdays this subject has at least one schedule block on. */
  subjectBlockDays: string[];
  schoolDays: string[];
}): DayOfWeek[] {
  const blockDays = new Set(params.subjectBlockDays);
  return scheduledWeekdays(params.repeat, params.schoolDays).filter((d) => !blockDays.has(d));
}

/** "Mon, Wed and Fri" — an Oxford-comma-free list a parent reads rather than decodes. */
export function formatDayList(days: DayOfWeek[]): string {
  const labels = days.map((d) => DAY_LABELS[d]);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export type GapQuest = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  repeat: QuestRepeat;
};

export type SubjectScheduleGap = {
  subjectId: string;
  subjectName: string;
  /** Days the subject's scheduled quests come up but it has no class time. */
  missingDays: DayOfWeek[];
  /** Titles of the scheduled quests affected, for naming what's at stake. */
  questTitles: string[];
  /** True when the subject has no class time on any day at all. */
  neverScheduled: boolean;
};

/**
 * Every subject with scheduled quests landing on days it isn't taught,
 * collapsed to one entry per subject so a parent sees "Art has no class time
 * on Tue and Fri" instead of the same complaint once per quest.
 */
export function findSubjectScheduleGaps(params: {
  quests: GapQuest[];
  blocks: { subjectId: string; dayOfWeek: string }[];
  schoolDays: string[];
}): SubjectScheduleGap[] {
  const blockDaysBySubject = buildBlockDaysBySubject(params.blocks);
  const bySubject = new Map<string, SubjectScheduleGap>();

  for (const quest of params.quests) {
    const subjectBlockDays = blockDaysBySubject[quest.subjectId] ?? [];
    const missing = findMissingScheduleDays({
      repeat: quest.repeat,
      subjectBlockDays,
      schoolDays: params.schoolDays,
    });
    if (missing.length === 0) continue;

    const existing = bySubject.get(quest.subjectId);
    if (existing) {
      const merged = new Set([...existing.missingDays, ...missing]);
      existing.missingDays = DAYS_OF_WEEK.filter((d) => merged.has(d));
      existing.questTitles.push(quest.title);
    } else {
      bySubject.set(quest.subjectId, {
        subjectId: quest.subjectId,
        subjectName: quest.subjectName,
        missingDays: missing,
        questTitles: [quest.title],
        neverScheduled: subjectBlockDays.length === 0,
      });
    }
  }

  return [...bySubject.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

/**
 * A stable fingerprint of a set of gaps — what a parent is actually dismissing
 * when they clear the notice.
 *
 * Built from who, which discipline and which days, deliberately *not* from the
 * wording or the quest list: another quest joining a gap they've already
 * acknowledged is the same warning and should stay dismissed, while a new
 * discipline or a newly-uncovered day is a different one and has to come back.
 */
export function scheduleGapSignature(
  entries: { childId?: string; gaps: SubjectScheduleGap[] }[]
): string {
  return entries
    .flatMap((entry) =>
      entry.gaps.map(
        (gap) => `${entry.childId ?? ""}:${gap.subjectId}:${gap.missingDays.join(",")}`
      )
    )
    .sort()
    .join("|");
}

/** Weekdays each subject has at least one class block on, keyed by subject id. */
export function buildBlockDaysBySubject(
  blocks: { subjectId: string; dayOfWeek: string }[]
): Record<string, DayOfWeek[]> {
  const days = new Map<string, Set<string>>();
  for (const block of blocks) {
    const set = days.get(block.subjectId) ?? new Set<string>();
    set.add(block.dayOfWeek);
    days.set(block.subjectId, set);
  }
  const out: Record<string, DayOfWeek[]> = {};
  for (const [subjectId, set] of days) {
    out[subjectId] = DAYS_OF_WEEK.filter((d) => set.has(d));
  }
  return out;
}
