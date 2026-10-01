/**
 * Wages are stored as signed integer cents everywhere — never floats. This
 * module is the only place that converts between cents and something a human
 * reads or types.
 *
 * Children see gold pieces because D&D's own ratios (1 gp = 10 sp = 100 cp)
 * land exactly on dollars, dimes and cents, so no exchange rate is invented.
 * Parents see the real currency, because they are the ones actually paying.
 */

/** Renders cents as coin for heroes: 1250 -> "12 gp 5 sp". */
export function formatWagesAsCoin(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));

  const gp = Math.floor(abs / 100);
  const sp = Math.floor((abs % 100) / 10);
  const cp = abs % 10;

  const parts: string[] = [];
  if (gp) parts.push(`${gp} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (cp) parts.push(`${cp} cp`);
  // An all-zero amount still needs to say something.
  if (parts.length === 0) return "0 gp";

  return sign + parts.join(" ");
}

/** Renders cents as currency for grown-ups: 1250 -> "$12.50". */
export function formatWagesAsDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Parses a parent-typed dollar amount into whole cents.
 *
 * Deliberately rejects negatives: a payout is entered as a positive amount and
 * negated by the caller that writes it, so the sign convention lives in exactly
 * one place instead of depending on how someone typed it.
 */
export function parseDollarsToCents(input: string): number {
  const trimmed = input.trim().replace(/^\$/, "");
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) throw new Error("Enter an amount like 2.50");

  const [, whole, frac] = match;
  if (!whole && frac === undefined) throw new Error("Enter an amount like 2.50");

  const dollars = whole ? parseInt(whole, 10) : 0;
  const cents = frac ? parseInt(frac.padEnd(2, "0"), 10) : 0;
  return dollars * 100 + cents;
}

/**
 * Nets a set of ledger rows. Used for two things that are the same sum over
 * different rows: a child's balance (all their entries) and one assignment's
 * net (its entries only — zero means nothing is currently owed for it).
 */
export function sumCents(entries: { amountCents: number }[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}
