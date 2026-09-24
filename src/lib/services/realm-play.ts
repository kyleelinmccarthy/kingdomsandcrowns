import { and, asc, count, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { settingsFromRow, type RealmSettings } from "@/lib/utils/realm-settings";
import type { LedgerRow } from "@/lib/utils/realm-access";
import { playChargeProblem } from "@/lib/utils/realm-play-charge";
import { awardClears, bountyStatusFor, MAX_CLEARS_PER_MINUTE, type BountyStatus, type ClearRow } from "@/lib/realm/spells/bounty";
import { latestClears, RELOAD_MEMORY_MS, STAMP_SLACK_MS, type RecentClear } from "@/lib/realm3d/trouble-reload";

/** The database, or a transaction on it: the reads and writes below run on either. */
type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export async function appendLedger(
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
 * Charges Realm play time to the ledger: the one write behind both the play clock's server
 * action and its page-hide beacon. Callers have authorized the child; the charge's shape is
 * checked here, so neither way in can write one the other would refuse.
 */
export async function chargeRealmPlay(childId: string, date: string, minutes: number): Promise<void> {
  const problem = playChargeProblem(date, minutes);
  if (problem) throw new Error(problem);
  await appendLedger(childId, date, "spent", minutes);
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
 * The whole award as one write transaction: the per-minute limit, the day's allowance, the award
 * and its writes. Read-then-write outside a transaction let two calls at once (two tabs, a
 * replayed request) both read an untouched allowance and both bank it in full; the unique index
 * only stops the same home paying twice, not two calls paying different homes. A libsql write
 * transaction takes the write lock at BEGIN, so the second call reads what the first wrote.
 *
 * Calls for one hero in one server process also queue behind each other before they reach the
 * database. That is not only politeness: the local libsql driver leaves a statement that failed
 * on a busy lock un-reset on its connection, and the next COMMIT on that connection then fails
 * too, holding the lock. Across processes (production's instances on Turso) the transaction is
 * what serializes, and a busy lock is retried briefly.
 */
export async function awardTroubleClears(
  childId: string,
  date: string,
  homeIds: readonly string[],
): Promise<{ awarded: number; status: BountyStatus }> {
  return queued(childId, () =>
    withWriteRetry(() =>
      db.transaction(async (tx) => {
        const recent = await countTroubleClearsSince(childId, new Date(Date.now() - 60_000), tx);
        const batch = homeIds.slice(0, Math.max(0, MAX_CLEARS_PER_MINUTE - recent));
        const settings = await loadRealmSettings(childId, tx);
        let awarded = 0;
        if (batch.length > 0) {
          const { rows } = awardClears(batch, await loadLedger(childId, date, tx), settings, await loadTroubleClears(childId, date, tx));
          awarded = await recordTroubleClearRows(childId, date, rows, tx);
        }
        // Read back inside the lock, so the answer is exactly what this call left behind.
        const status = bountyStatusFor(await loadLedger(childId, date, tx), settings, await loadTroubleClears(childId, date, tx));
        return { awarded, status };
      }),
    ),
  );
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
 * the balance never negative.
 */
export async function grantEarnedMinutesForCompletion(
  childId: string,
  assignmentId: string,
  date: string
): Promise<void> {
  const settings = await loadRealmSettings(childId);
  const earns = settings.accessMode === "earned" || settings.accessMode === "both";
  if (!settings.enabled || !earns || settings.earnedMinutesPerQuest <= 0) return;

  // Minutes are earned once per quest: a quest revised back to pending and
  // finished again must not bank a second grant.
  const existing = await db
    .select({ id: schema.realmPlayLedger.id })
    .from(schema.realmPlayLedger)
    .where(
      and(
        eq(schema.realmPlayLedger.childId, childId),
        eq(schema.realmPlayLedger.kind, "earned"),
        eq(schema.realmPlayLedger.sourceAssignmentId, assignmentId)
      )
    )
    .limit(1);
  if (existing.length > 0) return;

  await appendLedger(childId, date, "earned", settings.earnedMinutesPerQuest, assignmentId);
}
