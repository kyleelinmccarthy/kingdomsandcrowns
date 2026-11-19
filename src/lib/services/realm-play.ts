import { and, eq, gte, inArray, lt, max, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { settingsFromRow, type RealmSettings } from "@/lib/utils/realm-settings";
import { minutesSpent, modeEarns, type LedgerRow } from "@/lib/utils/realm-access";
import { dayOpeningRows, isDayOpen, opensDays, previewToday } from "@/lib/utils/realm-day";
import { playChargeProblem } from "@/lib/utils/realm-play-charge";
import { realmNow } from "@/lib/services/realm-clock";
import { practicePaidToday } from "@/lib/utils/realm-ledger";
import { sideQuestPay, type SideQuestPay } from "@/lib/utils/side-quest-pay";
import { IDLE_MS } from "@/lib/realm3d/pause";

/** A transaction on the database. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The database, or a transaction on it: the reads and writes below run on either. */
export type Exec = typeof db | Tx;

/**
 * Realm play-time plumbing shared by the actions and the quest-completion
 * hook. Plain module: callers have already authorized the child.
 */

/**
 * The hero's settings; the row is created if missing. One select in steady state: only a hero
 * with no row yet takes the insert-if-missing (so two first reads can't make two rows) and the reselect.
 */
export async function loadRealmSettings(childId: string, exec: Exec = db): Promise<RealmSettings> {
  return settingsFromRow(await loadRealmSettingsRow(childId, exec));
}

/**
 * The hero's whole settings row, as `loadRealmSettings` reads it (created if missing). For a caller
 * that also needs the columns `RealmSettings` leaves out (the pin, the delivery mark, `regraded_at`),
 * so one read serves them all (`getRealmBundle`, M-5).
 */
export async function loadRealmSettingsRow(childId: string, exec: Exec = db): Promise<typeof schema.realmSettings.$inferSelect | null> {
  const select = () => exec.select().from(schema.realmSettings).where(eq(schema.realmSettings.childId, childId)).limit(1);
  let rows = await select();
  if (!rows[0]) {
    const now = new Date();
    await exec
      .insert(schema.realmSettings)
      .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    rows = await select();
  }
  return rows[0] ?? null;
}

/**
 * The two slice-8 timestamps on realm_settings; the row is created if missing.
 * One select in steady state: the insert-if-missing path only runs (and only
 * re-selects) the first time a hero's row doesn't exist yet.
 */
export async function loadRealmFlags(childId: string): Promise<{ helpSeenAt: Date | null; starterSpellAt: Date | null }> {
  const cols = { helpSeenAt: schema.realmSettings.helpSeenAt, starterSpellAt: schema.realmSettings.starterSpellAt };
  let rows = await db.select(cols).from(schema.realmSettings).where(eq(schema.realmSettings.childId, childId)).limit(1);
  if (!rows[0]) {
    const now = new Date();
    await db
      .insert(schema.realmSettings)
      .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    rows = await db.select(cols).from(schema.realmSettings).where(eq(schema.realmSettings.childId, childId)).limit(1);
  }
  return { helpSeenAt: rows[0]?.helpSeenAt ?? null, starterSpellAt: rows[0]?.starterSpellAt ?? null };
}

export async function loadLedger(childId: string, date: string, exec: Exec = db): Promise<LedgerRow[]> {
  return exec
    .select({ kind: schema.realmPlayLedger.kind, minutes: schema.realmPlayLedger.minutes })
    .from(schema.realmPlayLedger)
    .where(and(eq(schema.realmPlayLedger.childId, childId), eq(schema.realmPlayLedger.date, date)));
}

/** What a ledger row was paid for, when it was paid for one thing. */
type LedgerSource = { sourceAssignmentId?: string | null; sourceRunId?: string | null };

/**
 * Inside the child's lock only (`tx` from `withChildLock`): every write to a day goes through an
 * opened day (`appendToOpenedDay`, or a caller that ran `openDay` in the same locked transaction). Returns whether the row landed:
 * a run's `practice` row already there (the practice per-run index) is left alone; any other
 * conflict is a real error and throws.
 */
export async function appendLedger(
  childId: string,
  date: string,
  kind: LedgerRow["kind"],
  minutes: number,
  { sourceAssignmentId = null, sourceRunId = null }: LedgerSource,
  tx: Tx
): Promise<boolean> {
  const L = schema.realmPlayLedger;
  const insert = tx.insert(L).values({ id: nanoid(), childId, date, kind, minutes, sourceAssignmentId, sourceRunId, createdAt: new Date() });
  // A row with a run is a `practice` row, so the per-run index is the only one it can hit. No
  // target: drizzle's SQLite builder places a partial index's WHERE after DO NOTHING, which SQLite rejects.
  const landed = await (sourceRunId ? insert.onConflictDoNothing() : insert).returning({ id: L.id });
  return landed.length > 0;
}

/**
 * The child's most recent day before `before` that has any ledger rows, as its rows (`[]` if
 * none): what today's carry is computed from. One query on the (child_id, date) index. Because
 * every opened day writes its `carried` row (0 too), a bank rolls forward across a gap of days
 * and is never carried twice.
 */
export async function loadPreviousActiveDay(childId: string, before: string, exec: Exec = db): Promise<LedgerRow[]> {
  const L = schema.realmPlayLedger;
  const latest = exec.select({ date: max(L.date) }).from(L).where(and(eq(L.childId, childId), lt(L.date, before)));
  return exec
    .select({ kind: L.kind, minutes: L.minutes })
    .from(L)
    .where(and(eq(L.childId, childId), sql`${L.date} = (${latest})`));
}

/**
 * Runs `run` in one write transaction, so every read-then-write on this child's ledger is
 * serialized, across server instances too. A libsql write transaction takes the database's write
 * lock at BEGIN, so a second call waits for the first to commit and then reads what it wrote.
 * See `awardTroubleClears` (`services/realm-troubles.ts`) for why calls also queue in-process and
 * retry on a busy lock.
 */
export async function withChildLock<T>(childId: string, run: (tx: Tx) => Promise<T>): Promise<T> {
  return queued(childId, () => withWriteRetry(() => db.transaction(run)));
}

/**
 * Opens the child's day — writes its `allowance` and `carried` rows, both always (0 too), once —
 * and returns the day's rows as they then stand. The only writer of those kinds. Called by the
 * child's own access check and before every other write to a day (`appendToOpenedDay`, the
 * bounty), so a day with rows always has its carry and an older bank is never dropped; a
 * grown-up's view reads `loadLedgerAsOpened` instead. Writes nothing when the Realm does not open
 * days (`opensDays`).
 *
 * An already-open day is one unlocked read (the usual case, over a remote database). Opening it
 * takes the child's lock and reads again, so two first checks (two tabs) cannot both read "not
 * open"; the partial unique indexes and `onConflictDoNothing` stand behind it. A day counts as
 * open by its allowance row only, so a minute already on it still comes off it. Pass `tx` to open
 * the day inside a caller's own `withChildLock` transaction, which already holds the lock.
 */
export async function openDay(childId: string, date: string, settings: RealmSettings, tx?: Tx): Promise<LedgerRow[]> {
  if (!opensDays(settings)) return loadLedger(childId, date, tx ?? db);
  const open = async (t: Tx): Promise<LedgerRow[]> => {
    const today = await loadLedger(childId, date, t);
    if (isDayOpen(today)) return today;
    const { allowance, carried } = dayOpeningRows(await loadPreviousActiveDay(childId, date, t), settings);
    const createdAt = new Date();
    await t
      .insert(schema.realmPlayLedger)
      .values([
        { id: nanoid(), childId, date, kind: "allowance", minutes: allowance, createdAt },
        { id: nanoid(), childId, date, kind: "carried", minutes: carried, createdAt },
      ])
      .onConflictDoNothing();
    return [...today, { kind: "allowance", minutes: allowance }, { kind: "carried", minutes: carried }];
  };
  if (tx) return open(tx);
  const today = await loadLedger(childId, date);
  return isDayOpen(today) ? today : withChildLock(childId, open);
}

/**
 * Today's rows as the child will see them once the day opens, for a reader that must not open it
 * (a grown-up's access check, the settings panel, the bounty's status). Reads the previous day
 * only when today could still open.
 */
export async function loadLedgerAsOpened(childId: string, date: string, settings: RealmSettings, exec: Exec = db): Promise<LedgerRow[]> {
  const today = await loadLedger(childId, date, exec);
  if (isDayOpen(today) || !opensDays(settings)) return today;
  return previewToday(today, await loadPreviousActiveDay(childId, date, exec), settings);
}

/**
 * Writes one row to the child's day, opening the day first (`openDay`) in the same locked
 * transaction: the one way a play charge, a grown-up's grant or a quest's minutes reach the
 * ledger. Pass `settings` when the caller already has them.
 */
export async function appendToOpenedDay(
  childId: string,
  date: string,
  kind: LedgerRow["kind"],
  minutes: number,
  { settings, sourceAssignmentId = null }: { settings?: RealmSettings; sourceAssignmentId?: string | null } = {},
): Promise<void> {
  const s = settings ?? (await loadRealmSettings(childId));
  await withChildLock(childId, async (tx) => {
    await openDay(childId, date, s, tx);
    await appendLedger(childId, date, kind, minutes, { sourceAssignmentId }, tx);
  });
}

/**
 * Charges Realm play time to the ledger: the one write behind both the play clock's server
 * action and its page-hide beacon. Callers have authorized the child and pass the server's day
 * (`realmNow`); the minutes are checked here, so neither way in can write one the other would refuse.
 */
export async function chargeRealmPlay(childId: string, date: string, minutes: number): Promise<void> {
  const problem = playChargeProblem(minutes);
  if (problem) throw new Error(problem);
  await appendToOpenedDay(childId, date, "spent", minutes);
}

/**
 * Pays a finished side quest its stars in play minutes (`sideQuestPay`) as one `practice` row on
 * the server's day, up to the day's side-quest limit. Under the child's lock, with the day opened
 * first, so two runs finished at once read each other's pay and never pass the limit together. A
 * run pays once (the `practice` per-run unique index): asked again, it answers with what that run
 * was paid. Callers have authorized the child and decided the run may pay at all (§2a, §4.3).
 */
export async function paySideQuest(childId: string, runId: string, stars: number): Promise<SideQuestPay> {
  return withChildLock(childId, async (tx) => {
    const { date } = await realmNow(childId);
    const settings = await loadRealmSettings(childId, tx);
    const today = await openDay(childId, date, settings, tx);
    const paidToday = practicePaidToday(today);
    const pay = sideQuestPay(stars, settings, paidToday);
    if (pay.minutes <= 0) return pay;
    if (await appendLedger(childId, date, "practice", pay.minutes, { sourceRunId: runId }, tx)) return pay;
    const L = schema.realmPlayLedger;
    const earlier = await tx
      .select({ minutes: L.minutes })
      .from(L)
      .where(and(eq(L.kind, "practice"), eq(L.sourceRunId, runId)))
      .limit(1);
    return { minutes: earlier[0]?.minutes ?? 0, full: sideQuestPay(0, settings, paidToday).full };
  });
}

/**
 * Slack on the idle refund's two clocks, for a slow round trip: the next refund is allowed
 * `IDLE_MS − REFUND_SLACK_MS` after the last (a genuine second idle pause is never refused because
 * the first answer was late), and a refund may reverse play written up to `IDLE_MS + REFUND_SLACK_MS`
 * ago (the idle span, plus a record that took its time to land).
 */
export const REFUND_SLACK_MS = 15_000;

/**
 * Gives back play minutes the clock charged while the child was idle (spec §4.6), as one `refund`
 * row on the server's day; returns how many. Under the child's lock with the day opened first,
 * like every write, and bounded three ways, all read inside the lock so two at once write one row:
 *
 *   - never more than today's spent (net of refunds), so a forged refund cannot mint credit;
 *   - only `spent` written in the last `IDLE_MS + REFUND_SLACK_MS` of server time (net of refunds
 *     written in that window): an idle pause can only reverse the play it just sat through;
 *   - at most one per `IDLE_MS − REFUND_SLACK_MS` of wall time per child (the latest `refund` row).
 *
 * Callers have authorized the child and checked `minutes` (`refundIdleMinutes`).
 */
export async function refundIdle(childId: string, date: string, minutes: number, settings: RealmSettings): Promise<number> {
  return withChildLock(childId, async (tx) => {
    const today = await openDay(childId, date, settings, tx);
    const now = Date.now();
    const L = schema.realmPlayLedger;
    // Every refund the once-per-window rule could refuse on is inside this span too.
    const recent = await tx
      .select({ kind: L.kind, minutes: L.minutes, createdAt: L.createdAt })
      .from(L)
      .where(and(eq(L.childId, childId), inArray(L.kind, ["spent", "refund"]), gte(L.createdAt, new Date(now - IDLE_MS - REFUND_SLACK_MS))));
    if (recent.some((r) => r.kind === "refund" && now - r.createdAt.getTime() < IDLE_MS - REFUND_SLACK_MS)) return 0;
    const refunded = Math.min(minutes, minutesSpent(today), minutesSpent(recent));
    if (refunded < 1) return 0;
    await appendLedger(childId, date, "refund", refunded, {}, tx);
    return refunded;
  });
}

const awardQueues = new Map<string, Promise<unknown>>();

/**
 * The longest a call waits in the in-process queue for the one ahead of it. A predecessor stuck in
 * flight (a hung socket) must not hang every later write for this child; past this the call goes
 * on, and the write transaction still serializes the two in the database.
 */
export const QUEUE_WAIT_MS = 5_000;

/** Settles when `p` does, or after `ms`, whichever is first. */
function settledOrTimeout(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([p.then(() => {}, () => {}), timeout]).finally(() => clearTimeout(timer));
}

/** Runs `run` after every earlier call for the same key has settled (or `QUEUE_WAIT_MS` passed), in this process. */
async function queued<T>(key: string, run: () => Promise<T>): Promise<T> {
  const before = awardQueues.get(key) ?? Promise.resolve();
  const mine = settledOrTimeout(before, QUEUE_WAIT_MS).then(run);
  const tail = mine.catch(() => {});
  awardQueues.set(key, tail);
  try {
    return await mine;
  } finally {
    if (awardQueues.get(key) === tail) awardQueues.delete(key);
  }
}

/** A second writer that finds the lock taken waits its turn, briefly, rather than failing the child's clears. */
async function withWriteRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (err) {
      if (i >= attempts || !isBusy(err)) throw err;
      await new Promise((r) => setTimeout(r, 25 * i));
    }
  }
}

/** The write lock was held by another writer: safe to retry, the write was not wrong. */
function isBusy(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;
    if (code === "SQLITE_BUSY" || (typeof message === "string" && /SQLITE_BUSY|database is locked/i.test(message))) return true;
  }
  return false;
}

/**
 * Called once per completed quest. Minutes earned stay earned: revising the
 * quest later never claws them back, which keeps the ledger append-only and
 * the balance never negative. They land on the server's today, not the
 * assignment's date: yesterday's quest finished today earns into today, so
 * no day is written to once the server's day has moved on.
 */
export async function grantEarnedMinutesForCompletion(childId: string, assignmentId: string): Promise<void> {
  const [settings, { date }] = await Promise.all([loadRealmSettings(childId), realmNow(childId)]);
  if (!settings.enabled || !modeEarns(settings.accessMode) || settings.earnedMinutesPerQuest <= 0) return;

  // Minutes are earned once per quest: a quest revised back to pending and finished again must
  // not bank a second grant. Checked under the child's lock with the write, so two completions at
  // once (two tabs, two server instances) cannot both find none (there is no unique index to lean on).
  const L = schema.realmPlayLedger;
  await withChildLock(childId, async (tx) => {
    const existing = await tx
      .select({ id: L.id })
      .from(L)
      .where(and(eq(L.childId, childId), eq(L.kind, "earned"), eq(L.sourceAssignmentId, assignmentId)))
      .limit(1);
    if (existing.length > 0) return;
    await openDay(childId, date, settings, tx);
    await appendLedger(childId, date, "earned", settings.earnedMinutesPerQuest, { sourceAssignmentId: assignmentId }, tx);
  });
}
