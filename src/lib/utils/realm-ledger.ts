/**
 * Ledger rules beyond the balance: how a day's rows add up by kind and what a day leaves in the
 * bank. Pure, shared by the server (which decides) and the client (which only predicts).
 */
import { minutesSpent, type LedgerRow } from "./realm-access";

export function sumKind(rows: readonly LedgerRow[], kind: LedgerRow["kind"]): number {
  let n = 0;
  for (const r of rows) if (r.kind === kind) n += r.minutes;
  return n;
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
  const allowance = sumKind(rows, "allowance");
  const nonAllowanceCredits = rows
    .filter((r) => r.kind !== "allowance" && r.kind !== "spent" && r.kind !== "refund")
    .reduce((sum, r) => sum + r.minutes, 0);
  const overflow = Math.max(0, minutesSpent(rows) - allowance);
  return Math.min(Math.max(0, nonAllowanceCredits - overflow), Math.max(0, bankCap));
}
