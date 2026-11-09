/**
 * Opening a Realm day: the free allowance and yesterday's bank, as rows. Pure. The server's
 * `openDay` (`services/realm-play.ts`) writes these once a day, on the child's own first access
 * check; a grown-up's view previews them with `previewToday` and writes nothing (spec 2026-11-09
 * §4.2, §4.4).
 */
import { modeEarns, type LedgerRow } from "./realm-access";
import { carryable } from "./realm-ledger";
import type { RealmSettings } from "./realm-settings";

type DaySettings = Pick<RealmSettings, "enabled" | "accessMode" | "dailyAllowanceMinutes" | "bankCapMinutes">;

/**
 * Only an enabled Realm in an earning mode opens days: elsewhere minutes are never spent, so the
 * allowance and the bank would be empty promises (spec §4.7).
 */
export function opensDays(s: Pick<RealmSettings, "enabled" | "accessMode">): boolean {
  return s.enabled && modeEarns(s.accessMode);
}

/**
 * A day is open once its `allowance` row is written — not on any row: a minute charged across
 * midnight can land on the new day before the child's next access check opens it.
 */
export function isDayOpen(todayRows: readonly LedgerRow[]): boolean {
  return todayRows.some((r) => r.kind === "allowance");
}

/** What a new day starts with, from the child's most recent earlier day with rows (`opensDays`). */
export function dayOpeningRows(previousDayRows: readonly LedgerRow[], s: DaySettings): { allowance: number; carried: number } {
  if (!opensDays(s)) return { allowance: 0, carried: 0 };
  return { allowance: s.dailyAllowanceMinutes, carried: carryable(previousDayRows, s.bankCapMinutes) };
}

/**
 * Today's rows as the child will see them once the day opens, for a grown-up's view before it
 * has: an opened day is returned as written (a setting changed since never rewrites it), and a
 * day that will never open (`opensDays`) as it is.
 */
export function previewToday(todayRows: readonly LedgerRow[], previousDayRows: readonly LedgerRow[], s: DaySettings): LedgerRow[] {
  if (isDayOpen(todayRows) || !opensDays(s)) return [...todayRows];
  const { allowance, carried } = dayOpeningRows(previousDayRows, s);
  return [...todayRows, { kind: "allowance", minutes: allowance }, { kind: "carried", minutes: carried }];
}
