/**
 * THE BOUNTY: clearing troubles earns Realm minutes.
 *
 * The owner's decision 3 (`docs/superpowers/specs/2026-09-10-realm-overhaul-roadmap.md`), built to
 * the slice-8 spec (`2026-09-10-realm-troubles-that-read-and-pay-design.md` §3.11): one minute per
 * cleared trouble, banked in `realm_play_ledger` as a `bonus` row, under a per-day sub-cap that
 * can never outrun the day's real schoolwork, and inside the parent's `dailyCapMinutes`.
 *
 * One rule is added to the spec's, because the 3D Realm's troubles respawn in the same places:
 * **a home pays once a day.** The fog on the outskirts comes back twenty seconds after it is
 * cleared; clearing it again still counts (the tally goes up, the fog still thins) but earns
 * nothing. So a child cannot stand by one respawning trouble and farm the day's allowance; to
 * earn all five default minutes they have to go and find five different troubles, which is the
 * exploring the places were put on the map for.
 *
 * Pure, and shared by the server (which decides) and the client (which only predicts, and is
 * always overwritten by the server's answer). No `three`, no database.
 */

import { minutesSpent, type LedgerRow, type RealmAccessMode } from "@/lib/utils/realm-access";
import { PLACES } from "@/lib/realm/layout";

export const MINUTES_PER_CLEAR = 1;
/** "One grant", never zero: the sub-cap's floor when `earnedMinutesPerQuest` is 0. */
export const BOUNTY_FLOOR_MINUTES = 1;
/** The client flushes after this many unsent clears... */
export const CLEARS_PER_FLUSH = 3;
/** ...or this long after the last one. */
export const FLUSH_IDLE_MS = 4000;
/**
 * The client gives a batch up after this many refusals in a row. A refusal that lasts (an expired
 * session, a date the server no longer takes) would otherwise sit at the head of the queue for
 * the rest of the visit, and every clear after it would wait behind it.
 */
export const MAX_FLUSH_FAILURES = 3;
/** A stuck or lying client cannot bank a day in one call. */
export const MAX_CLEARS_PER_CALL = 12;
/**
 * More clears than this inside one minute are not a child: six troubles are awake at most, a
 * cleared one takes twenty seconds to come back, and only once the child has walked away. The
 * server drops the excess rather than recording it.
 */
export const MAX_CLEARS_PER_MINUTE = 20;

export type BountySettings = {
  enabled: boolean;
  accessMode: RealmAccessMode;
  earnedMinutesPerQuest: number;
  dailyCapMinutes: number;
  troubleBonusCapMinutes: number;
};

/** One recorded clear, as the server stores it. */
export type ClearRow = { homeId: string; minutes: number };

export type BountyStatus = {
  enabled: boolean;
  /** The parent's number. */
  capMinutes: number;
  /** Today's ceiling, after the schoolwork rule. */
  subCapMinutes: number;
  /** Bonus minutes banked today. */
  paidMinutes: number;
  /** What clearing may still earn today: the sub-cap and the daily cap, whichever is nearer. */
  remainingMinutes: number;
  /** Troubles cleared today, paid or not. */
  clearsToday: number;
  /** Homes that have already paid today. */
  paidHomes: string[];
};

/**
 * Off when the Realm is off, the parent's cap is 0, or the mode never reads the ledger's balance:
 * `scheduled` (recess opens it) and `open` (always open) — there the minutes would be unspendable
 * and "+1 minute" would be a promise the game cannot keep.
 */
export function bountyEnabled(s: BountySettings): boolean {
  return s.enabled && s.troubleBonusCapMinutes > 0 && (s.accessMode === "earned" || s.accessMode === "both");
}

function sumKind(rows: readonly LedgerRow[], kind: LedgerRow["kind"]): number {
  let n = 0;
  for (const r of rows) if (r.kind === kind) n += r.minutes;
  return n;
}

export function questMinutesToday(ledgerToday: readonly LedgerRow[]): number {
  return sumKind(ledgerToday, "earned");
}

export function bonusMinutesToday(ledgerToday: readonly LedgerRow[]): number {
  return sumKind(ledgerToday, "bonus");
}

/**
 * `min(parentCap, max(questMinutesToday, max(1, earnedMinutesPerQuest)))`: the parent's number is
 * the ceiling, and the schoolwork term guarantees a raised ceiling can never outrun the day's
 * real work by more than one grant.
 */
export function bountySubCap(ledgerToday: readonly LedgerRow[], s: BountySettings): number {
  if (!bountyEnabled(s)) return 0;
  const floor = Math.max(BOUNTY_FLOOR_MINUTES, s.earnedMinutesPerQuest);
  return Math.min(s.troubleBonusCapMinutes, Math.max(questMinutesToday(ledgerToday), floor));
}

/** What clearing may still earn today. The parent's daily cap binds this path like every other. */
export function bountyAllowance(ledgerToday: readonly LedgerRow[], s: BountySettings): number {
  if (!bountyEnabled(s)) return 0;
  const left = bountySubCap(ledgerToday, s) - bonusMinutesToday(ledgerToday);
  const headroom = s.dailyCapMinutes - minutesSpent(ledgerToday as LedgerRow[]);
  return Math.max(0, Math.min(left, headroom));
}

export function bountyStatusFor(ledgerToday: readonly LedgerRow[], s: BountySettings, clearsToday: readonly ClearRow[]): BountyStatus {
  const paidHomes: string[] = [];
  for (const c of clearsToday) if (c.minutes > 0 && !paidHomes.includes(c.homeId)) paidHomes.push(c.homeId);
  return {
    enabled: bountyEnabled(s),
    capMinutes: s.troubleBonusCapMinutes,
    subCapMinutes: bountySubCap(ledgerToday, s),
    paidMinutes: bonusMinutesToday(ledgerToday),
    remainingMinutes: bountyAllowance(ledgerToday, s),
    clearsToday: clearsToday.length,
    paidHomes,
  };
}

/**
 * What a batch of clears earns, in the order they happened: a minute each for a home that has not
 * paid today, while the allowance lasts, and nothing for the rest. Every clear is returned (the
 * tally is real either way); `awarded` is what the ledger gets.
 */
export function awardClears(
  homeIds: readonly string[],
  ledgerToday: readonly LedgerRow[],
  s: BountySettings,
  clearsToday: readonly ClearRow[],
): { rows: ClearRow[]; awarded: number } {
  let allowance = bountyAllowance(ledgerToday, s);
  const paid = new Set<string>();
  for (const c of clearsToday) if (c.minutes > 0) paid.add(c.homeId);
  const rows: ClearRow[] = [];
  let awarded = 0;
  for (const homeId of homeIds) {
    const pays = allowance >= MINUTES_PER_CLEAR && !paid.has(homeId);
    if (pays) {
      paid.add(homeId);
      allowance -= MINUTES_PER_CLEAR;
      awarded += MINUTES_PER_CLEAR;
    }
    rows.push({ homeId, minutes: pays ? MINUTES_PER_CLEAR : 0 });
  }
  return { rows, awarded };
}

/**
 * A trouble home id as `planHomes` writes them (`lib/realm3d/troubles3d.ts`): one of the three
 * outskirts slots, or a landmark's id behind `place-`. Landmarks are the five authored `PLACES`
 * and the generator's own (`lib/realm3d/worldgen.ts`, `${kind}-${n}`, n under a hundred or so).
 * Anything else did not come from the game — and any `place-*` string used to pass, which gave a
 * hand-made request an unlimited supply of homes that had never paid.
 */
const GENERATED_KINDS = ["summit", "deepwood", "tarn", "cove", "mire", "outcrop"] as const;
const HOME_ID = new RegExp(
  `^(rim-[0-2]|place-(${PLACES.map((p) => p.id).join("|")})|place-(${GENERATED_KINDS.join("|")})-[1-9][0-9]{0,2})$`,
);

export function isTroubleHomeId(id: unknown): id is string {
  return typeof id === "string" && HOME_ID.test(id);
}

/** The world's earliest and latest clocks: UTC-12 and UTC+14. */
const WEST_MS = 12 * 3_600_000;
const EAST_MS = 14 * 3_600_000;

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The hero's local day is sent by the client, so the server checks it is today somewhere on
 * Earth right now: the date at UTC-12, the date at UTC+14, or (when they differ by two) the one
 * between. A date nobody has reached yet is refused, so tomorrow's allowance cannot be banked
 * tonight, and a date that has ended everywhere is refused too.
 */
export function isNearToday(date: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t) || utcDay(t) !== date) return false;
  const at = now.getTime();
  return date >= utcDay(at - WEST_MS) && date <= utcDay(at + EAST_MS);
}

/* ----------------------------------------------------------- the client's half */

/**
 * What the world may promise at the moment of a clear, before the server has been asked. Until
 * the server has said what is left today (`known`), no clear claims a minute: a notice never says
 * "+1 minute" that the ledger then refuses.
 */
export type BountyPurse = {
  known: boolean;
  enabled: boolean;
  remaining: number;
  clearsToday: number;
  paidHomes: Set<string>;
};

export function startPurse(): BountyPurse {
  return { known: false, enabled: false, remaining: 0, clearsToday: 0, paidHomes: new Set() };
}

/** What one clear pays, predicted; mutates the purse. `capped` is true when the day's allowance is why it did not. */
export type ClearOutcome = { paid: boolean; capped: boolean; already: boolean; clearsToday: number };

export function takeClear(purse: BountyPurse, homeId: string): ClearOutcome {
  purse.clearsToday += 1;
  if (!purse.known || !purse.enabled) return { paid: false, capped: false, already: false, clearsToday: purse.clearsToday };
  if (purse.paidHomes.has(homeId)) return { paid: false, capped: false, already: true, clearsToday: purse.clearsToday };
  if (purse.remaining < MINUTES_PER_CLEAR) return { paid: false, capped: true, already: false, clearsToday: purse.clearsToday };
  purse.remaining -= MINUTES_PER_CLEAR;
  purse.paidHomes.add(homeId);
  return { paid: true, capped: false, already: false, clearsToday: purse.clearsToday };
}

/**
 * The server's answer overwrites the prediction — the server always wins — with the clears still
 * waiting to be sent laid back on top, so a clear made while a flush was in flight is neither
 * lost from the tally nor paid twice.
 */
export function applyStatus(purse: BountyPurse, status: BountyStatus, unsent: readonly string[]): void {
  purse.known = true;
  purse.enabled = status.enabled;
  purse.remaining = status.remainingMinutes;
  purse.clearsToday = status.clearsToday;
  purse.paidHomes = new Set(status.paidHomes);
  for (const homeId of unsent) {
    purse.clearsToday += 1;
    if (purse.enabled && !purse.paidHomes.has(homeId) && purse.remaining >= MINUTES_PER_CLEAR) {
      purse.remaining -= MINUTES_PER_CLEAR;
      purse.paidHomes.add(homeId);
    }
  }
}
