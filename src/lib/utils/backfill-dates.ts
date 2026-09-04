import { todayInZone } from "@/lib/utils/dates";

export type DateRowCandidate = {
  /** The calendar date as stored. */
  storedDate: string;
  /** When the row was written — a real instant. */
  createdAt: Date;
};

/**
 * The date a row should have had, or null when it must not be touched.
 *
 * The hard part is telling a row the bug corrupted from a date a parent chose
 * on purpose, because the row records only the result. The fingerprint:
 *
 *   An auto-derived date always equals the UTC calendar date of createdAt,
 *   because that is literally how it was computed. A deliberately backdated
 *   one almost never does.
 *
 * So only matching rows are corrected. A parent who backdated to exactly the
 * UTC date the system would have picked is indistinguishable in principle —
 * and for them, the correction produces the date they would have got had the
 * bug never existed.
 *
 * Returns null when nothing should change, so the caller writes only real
 * corrections and the dry run reports only real differences.
 */
export function correctedDate(row: DateRowCandidate, timeZone: string): string | null {
  if (!row.storedDate) return null;

  const utcDate = todayInZone("UTC", row.createdAt);
  if (row.storedDate !== utcDate) return null; // deliberate; leave it

  const localDate = todayInZone(timeZone, row.createdAt);
  return localDate === row.storedDate ? null : localDate;
}
