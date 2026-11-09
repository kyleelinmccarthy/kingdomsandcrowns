/**
 * The one owner of ledger arithmetic: how a day's rows add up by kind, what is spendable, and
 * what a day leaves in the bank. Pure, shared by the server (which decides) and the client
 * (which only predicts). The types live in `realm-access.ts` (`import type`, so no runtime
 * cycle); `realm-access.ts` re-exports `minutesSpent` and `ledgerBalance` for its callers.
 */
import type { LedgerKind, LedgerRow } from "./realm-access";

export function sumKind(rows: readonly LedgerRow[], kind: LedgerKind): number {
  let n = 0;
  for (const r of rows) if (r.kind === kind) n += r.minutes;
  return n;
}

/** Credit is every kind except `spent` (the debit) and `refund` (which only reduces `spent`). */
function isCredit(kind: LedgerKind): boolean {
  return kind !== "spent" && kind !== "refund";
}

function creditMinutes(rows: readonly LedgerRow[], except?: LedgerKind): number {
  let n = 0;
  for (const r of rows) if (isCredit(r.kind) && r.kind !== except) n += r.minutes;
  return n;
}

/** Spent minutes net of refunds. Never negative: a refund can only return what was charged. */
export function minutesSpent(rows: readonly LedgerRow[]): number {
  return Math.max(0, sumKind(rows, "spent") - sumKind(rows, "refund"));
}

/** Every credit − minutes spent. Never negative: an over-spend is a cap problem, not debt. */
export function ledgerBalance(rows: readonly LedgerRow[]): number {
  return Math.max(0, creditMinutes(rows) - minutesSpent(rows));
}

/** Side-quest pay already banked today (the day's cap on it is checked against this). */
export function practicePaidToday(rows: readonly LedgerRow[]): number {
  return sumKind(rows, "practice");
}

/**
 * What the day leaves to carry into tomorrow's bank. The allowance is use-it-or-lose-it, so spend
 * is charged to it first; only the overflow eats into the other credits (earned, practice, bonus,
 * granted and yesterday's carry). Clamped to `[0, bankCap]`.
 */
export function carryable(rows: readonly LedgerRow[], bankCap: number): number {
  const overflow = Math.max(0, minutesSpent(rows) - sumKind(rows, "allowance"));
  return Math.min(Math.max(0, creditMinutes(rows, "allowance") - overflow), Math.max(0, bankCap));
}
