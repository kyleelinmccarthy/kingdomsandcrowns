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
import { todayInZone } from "@/lib/utils/dates";

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
  return todayInZone("UTC", new Date(ms));
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

/* ----------------------------------------------------------- the earning copy */

/** What the earning copy reads from the hero's Realm settings. */
export type EarningSettings = Pick<BountySettings, "enabled" | "earnedMinutesPerQuest" | "dailyCapMinutes" | "troubleBonusCapMinutes">;

function minutesWord(n: number): string {
  return n === 1 ? "minute" : "minutes";
}

/** Slice 6's line, unchanged, for scheduled mode (spec §3.11). */
export const RECESS_EARNING_LINE = "Your Realm time comes from recess, not from quests.";
/** The second sentence once today's minutes from clearing are all paid (spec §3.11). */
export const CLEARING_SPENT_LINE = "You've had all today's minutes from clearing troubles.";

/**
 * THE ONE PLACE the Realm says how its minutes are earned (spec §3.11, "The Tavern panel's earning
 * line, rewritten"). The help card and the gate's closed screens all read it, and `bounty.test.ts`
 * asserts every string verbatim, so the next time the economy gains a door there is one string to
 * change and a test that fails if it is not changed.
 *
 * Returned as sentences, in order; joined with a space they are the spec's strings exactly.
 *
 *   - `earned` / `both`, bounty on: what a quest earns, and what clearing earns up to today's
 *     sub-cap — or, once the sub-cap is paid, that today's minutes from clearing are had;
 *   - `earned` / `both`, bounty off (a cap of 0): slice 6's line, which is still exactly true;
 *   - `scheduled`: recess, never quests, and never clearing — the bounty cannot pay there;
 *   - `open`: open, up to the daily cap — no promise of minutes, since nothing earns them;
 *   - the Realm switched off: nothing.
 *
 * `status` is the server's `BountyStatus` for today, or null before it has answered: then the
 * clearing sentence names no number rather than guessing one.
 */
export function earningLines(settings: EarningSettings, status: BountyStatus | null, accessMode: RealmAccessMode): string[] {
  if (!settings.enabled) return [];
  if (accessMode === "scheduled") return [RECESS_EARNING_LINE];
  if (accessMode === "open") return [`Your Realm is open, up to ${settings.dailyCapMinutes} ${minutesWord(settings.dailyCapMinutes)} a day.`];

  const q = settings.earnedMinutesPerQuest;
  const bounty = bountyEnabled({ ...settings, accessMode }) && (status === null || status.enabled);
  if (!bounty) {
    if (q <= 0) return [`A grown-up gives you your minutes here, up to ${settings.dailyCapMinutes} a day.`];
    return [`Finish a quest and you earn ${q} more ${minutesWord(q)} here, up to ${settings.dailyCapMinutes} a day.`];
  }
  const quest = q <= 0 ? "A grown-up gives you your minutes here." : `Finish a quest and you earn ${q} more ${minutesWord(q)} here.`;
  if (status === null) return [quest, "Clearing troubles earns a minute each."];
  if (status.subCapMinutes > 0 && status.paidMinutes >= status.subCapMinutes) return [quest, CLEARING_SPENT_LINE];
  return [quest, `Clearing troubles earns a minute each, up to ${status.subCapMinutes} a day.`];
}
