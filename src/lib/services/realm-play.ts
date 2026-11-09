import { and, asc, count, eq, gt, lt, max, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { settingsFromRow, type RealmSettings } from "@/lib/utils/realm-settings";
import { computeRealmAccess, isQuiet, modeEarns, type LedgerRow } from "@/lib/utils/realm-access";
import { dayOpeningRows, isDayOpen, opensDays, previewToday } from "@/lib/utils/realm-day";
import type { AccessScene } from "@/lib/services/realm-access-scene";
import { playChargeProblem } from "@/lib/utils/realm-play-charge";
import { realmNow } from "@/lib/services/realm-clock";
import { awardClears, bountyStatusFor, MAX_CLEARS_PER_MINUTE, type BountyStatus, type ClearRow } from "@/lib/realm/spells/bounty";
import { latestClears, RELOAD_MEMORY_MS, STAMP_SLACK_MS, type RecentClear } from "@/lib/realm3d/trouble-reload";

/** A transaction on the database. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The database, or a transaction on it: the reads and writes below run on either. */
type Exec = typeof db | Tx;

/**
 * Realm play-time plumbing shared by the actions and the quest-completion
 * hook. Plain module: callers have already authorized the child.
 */

/** Insert-if-missing then select, so two first reads can't make two rows. */
export async function loadRealmSettings(childId: string, exec: Exec = db): Promise<RealmSettings> {
  const now = new Date();
  await exec
    .insert(schema.realmSettings)
    .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  const rows = await exec
    .select()
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  return settingsFromRow(rows[0] ?? null);
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

/** Module-private on purpose: every write to a day goes through `appendToOpenedDay`, which opens it first. */
async function appendLedger(
  childId: string,
  date: string,
  kind: LedgerRow["kind"],
  minutes: number,
  sourceAssignmentId: string | null = null,
  exec: Exec = db
): Promise<void> {
  await exec.insert(schema.realmPlayLedger).values({
    id: nanoid(),
    childId,
    date,
    kind,
    minutes,
    sourceAssignmentId,
    createdAt: new Date(),
  });
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
 * Runs `run` in one transaction holding the child's advisory lock (`pg_advisory_xact_lock`), so
 * every read-then-write on this child's ledger is serialized, across isolates too. The lock is
 * per child (unrelated heroes never block each other) and released at COMMIT/ROLLBACK. See
 * `awardTroubleClears` for why calls also queue in-process and retry on deadlock.
 */
async function withChildLock<T>(childId: string, run: (tx: Tx) => Promise<T>): Promise<T> {
  return queued(childId, () =>
    withWriteRetry(() =>
      db.transaction(async (tx) => {
        await lockChild(childId, tx);
        return run(tx);
      }),
    ),
  );
}

/** Takes the child's lock inside `tx` (a second take in the same transaction is a no-op). */
async function lockChild(childId: string, tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${childId}))`);
}

/**
 * Opens the child's day — writes its `allowance` and `carried` rows, both always (0 too), once —
 * and returns the day's rows as they then stand. The only writer of those kinds. Called by the
 * child's own access check and before every other write to a day (`appendToOpenedDay`, the
 * bounty), so a day with rows always has its carry and an older bank is never dropped; a
 * grown-up's view reads `loadLedgerAsOpened` instead. Writes nothing when the Realm does not open
 * days (`opensDays`).
 *
 * Under the child's lock, so two first checks (two tabs) cannot both read "not open"; the partial
 * unique indexes and `onConflictDoNothing` stand behind it. A day counts as open by its allowance
 * row only, so a minute already on it still comes off it. Pass `tx` to open the day inside a
 * caller's own transaction.
 */
export async function openDay(childId: string, date: string, settings: RealmSettings, tx?: Tx): Promise<LedgerRow[]> {
  if (!opensDays(settings)) return loadLedger(childId, date, tx ?? db);
  const open = async (t: Tx): Promise<LedgerRow[]> => {
    await lockChild(childId, t);
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
  return tx ? open(tx) : withChildLock(childId, open);
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
    await appendLedger(childId, date, kind, minutes, sourceAssignmentId, tx);
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

/** The troubles a hero cleared on `date`, oldest first: what each home paid, for the bounty. */
export async function loadTroubleClears(childId: string, date: string, exec: Exec = db): Promise<ClearRow[]> {
  return exec
    .select({ homeId: schema.realmTroubleClear.homeId, minutes: schema.realmTroubleClear.minutes })
    .from(schema.realmTroubleClear)
    .where(and(eq(schema.realmTroubleClear.childId, childId), eq(schema.realmTroubleClear.date, date)))
    .orderBy(asc(schema.realmTroubleClear.createdAt));
}

/**
 * Each trouble home's latest clear in the last `RELOAD_MEMORY_MS`, as how long ago it was on
 * this server's clock: what a reload needs so a trouble cleared a moment ago stays cleared
 * (`lib/realm3d/trouble-reload.ts`). By `created_at`, not the hero's local `date`, so it is the
 * same answer either side of midnight in any timezone.
 */
export async function loadRecentTroubleClears(childId: string, now: Date = new Date(), exec: Exec = db): Promise<RecentClear[]> {
  const rows = await exec
    .select({ homeId: schema.realmTroubleClear.homeId, createdAt: schema.realmTroubleClear.createdAt })
    .from(schema.realmTroubleClear)
    .where(and(eq(schema.realmTroubleClear.childId, childId), gt(schema.realmTroubleClear.createdAt, new Date(now.getTime() - RELOAD_MEMORY_MS - STAMP_SLACK_MS))));
  return latestClears(
    rows.map((r) => ({ homeId: r.homeId, at: r.createdAt.getTime() })),
    now.getTime(),
  );
}

/** How many clears this hero has recorded since `since`, on any day. */
export async function countTroubleClearsSince(childId: string, since: Date, exec: Exec = db): Promise<number> {
  const rows = await exec
    .select({ n: count() })
    .from(schema.realmTroubleClear)
    .where(and(eq(schema.realmTroubleClear.childId, childId), gt(schema.realmTroubleClear.createdAt, since)));
  return rows[0]?.n ?? 0;
}

/**
 * Records a batch of clears and banks what they paid as ONE `bonus` ledger row. A paid row that
 * collides with the partial unique index (one paid clear per home per day — a second tab, a
 * retried request) is inserted unpaid instead, and only the minutes that actually landed are
 * banked, so the ledger can never pay a home twice.
 */
export async function recordTroubleClearRows(childId: string, date: string, rows: readonly ClearRow[], exec: Exec = db): Promise<number> {
  const now = new Date();
  let banked = 0;
  for (const r of rows) {
    if (r.minutes > 0) {
      const landed = await exec
        .insert(schema.realmTroubleClear)
        .values({ id: nanoid(), childId, date, homeId: r.homeId, minutes: r.minutes, createdAt: now })
        .onConflictDoNothing()
        .returning({ minutes: schema.realmTroubleClear.minutes });
      if (landed.length > 0) {
        banked += r.minutes;
        continue;
      }
    }
    await exec.insert(schema.realmTroubleClear).values({ id: nanoid(), childId, date, homeId: r.homeId, minutes: 0, createdAt: now });
  }
  if (banked > 0) await appendLedger(childId, date, "bonus", banked, null, exec);
  return banked;
}

/**
 * The whole award as one write transaction (`withChildLock`): the per-minute limit, the day's
 * allowance, the award and its writes. Read-then-write outside a transaction let two calls at once (two tabs, a
 * replayed request) both read an untouched allowance and both bank it in full; the unique index
 * only stops the same home paying twice, not two calls paying different homes. Postgres's default
 * isolation does NOT take a write lock at BEGIN the way a libsql write transaction did, so the
 * transaction opens by taking a `pg_advisory_xact_lock` keyed on childId — the second call for the
 * same hero blocks until the first commits and releases it, then reads what the first wrote. Lock
 * scope is per-childId, so unrelated heroes never block each other, and it's released automatically
 * at COMMIT/ROLLBACK.
 *
 * Calls for one hero in one server process also queue behind each other before they reach the
 * database, which is not only politeness but keeps one process from blocking its own event loop
 * on its own advisory lock. Across isolates (production on Cloudflare Workers) the advisory lock
 * is what serializes; withWriteRetry is a defensive retry for the rare Postgres deadlock or
 * serialization-failure error, not for routine contention (which blocks rather than erroring).
 */
export async function awardTroubleClears(
  childId: string,
  date: string,
  homeIds: readonly string[],
  scene: AccessScene,
): Promise<{ awarded: number; status: BountyStatus }> {
  const { settings } = scene;
  return withChildLock(childId, async (tx) => {
    // Clears are a write to the day, so the day opens first; its rows say whether the child is in
    // the quiet world, asked exactly as the gate asks it (`scene` is the gate's other inputs).
    const ledgerToday = await openDay(childId, date, settings, tx);
    const quiet = isQuiet(computeRealmAccess({ ...scene, ledgerToday }));
    const recent = await countTroubleClearsSince(childId, new Date(Date.now() - 60_000), tx);
    const batch = homeIds.slice(0, Math.max(0, MAX_CLEARS_PER_MINUTE - recent));
    let awarded = 0;
    if (batch.length > 0) {
      const { rows } = awardClears(batch, ledgerToday, settings, await loadTroubleClears(childId, date, tx), quiet);
      awarded = await recordTroubleClearRows(childId, date, rows, tx);
    }
    // Read back inside the lock, so the answer is exactly what this call left behind. Paying
    // nothing in quiet leaves it quiet; paying anything means it was not.
    const status = bountyStatusFor(await loadLedger(childId, date, tx), settings, await loadTroubleClears(childId, date, tx), quiet);
    return { awarded, status };
  });
}

const awardQueues = new Map<string, Promise<unknown>>();

/** Runs `run` after every earlier call for the same key has settled, in this process. */
async function queued<T>(key: string, run: () => Promise<T>): Promise<T> {
  const before = awardQueues.get(key) ?? Promise.resolve();
  const mine = before.catch(() => {}).then(run);
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

// Postgres error codes for transient contention: 40001 serialization_failure,
// 40P01 deadlock_detected. Both are safe to retry — neither means the write was wrong.
function isBusy(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (code === "40001" || code === "40P01") return true;
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
  const settings = await loadRealmSettings(childId);
  if (!settings.enabled || !modeEarns(settings.accessMode) || settings.earnedMinutesPerQuest <= 0) return;

  // Minutes are earned once per quest: a quest revised back to pending and
  // finished again must not bank a second grant.
  const [existing, { date }] = await Promise.all([
    db
      .select({ id: schema.realmPlayLedger.id })
      .from(schema.realmPlayLedger)
      .where(
        and(
          eq(schema.realmPlayLedger.childId, childId),
          eq(schema.realmPlayLedger.kind, "earned"),
          eq(schema.realmPlayLedger.sourceAssignmentId, assignmentId)
        )
      )
      .limit(1),
    realmNow(childId),
  ]);
  if (existing.length > 0) return;

  await appendToOpenedDay(childId, date, "earned", settings.earnedMinutesPerQuest, { settings, sourceAssignmentId: assignmentId });
}
