import { addDays } from "@/lib/utils/dates";

/**
 * The furthest ahead assignment generation will ever materialize rows.
 *
 * The pages that trigger generation ask for about a fortnight, so this is
 * far beyond any legitimate request — it exists only to bound the damage from
 * a crafted one. Without it, a caller passing a fifty-year range would have
 * the generator write tens of thousands of rows for a single daily task.
 */
export const MAX_GENERATION_DAYS = 366;

/**
 * Bounds a generation window. Returns the range to actually generate over.
 *
 * An inverted range collapses to its start date rather than being silently
 * reordered: reordering would honor a request nobody meant to make, while
 * generating a single day is the harmless reading.
 */
export function clampGenerationRange(
  startDate: string,
  endDate: string
): { startDate: string; endDate: string } {
  if (endDate < startDate) {
    return { startDate, endDate: startDate };
  }

  const latest = addDays(startDate, MAX_GENERATION_DAYS);
  return { startDate, endDate: endDate > latest ? latest : endDate };
}

/**
 * The quest-and-day pairs that already count as "planned", so generation knows
 * not to create them again. Keys read `questId:date`.
 *
 * A row claims the day it sits on, and — if a parent moved it — the day it was
 * moved from too. Without the second claim, moving Monday's quest to Friday
 * leaves Monday empty, so the next pass over the week quietly plants a fresh
 * Monday copy and the quest shows as missed all over again.
 */
export function occupiedAssignmentKeys(
  rows: { questId: string; date: string; originalDate: string | null }[]
): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(`${r.questId}:${r.date}`);
    if (r.originalDate) keys.add(`${r.questId}:${r.originalDate}`);
  }
  return keys;
}
