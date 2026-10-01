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
