import { and, asc, count, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { computeRealmAccess, isQuiet } from "@/lib/utils/realm-access";
import type { AccessScene } from "@/lib/services/realm-access-scene";
import { appendLedger, loadLedger, openDay, withChildLock, type Exec, type Tx } from "@/lib/services/realm-play";
import { awardClears, bountyStatusFor, MAX_CLEARS_PER_MINUTE, type BountyStatus, type ClearRow } from "@/lib/realm/spells/bounty";
import { latestClears, RELOAD_MEMORY_MS, STAMP_SLACK_MS, type RecentClear } from "@/lib/realm3d/trouble-reload";

/**
 * Troubles cleared in the Realm: what each home paid, what a reload remembers, and the bounty's
 * award. Plain module: callers have already authorized the child. Every write goes through
 * `awardTroubleClears`, which opens the day under the child's lock (`services/realm-play.ts`).
 */

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
async function recordTroubleClearRows(childId: string, date: string, rows: readonly ClearRow[], tx: Tx): Promise<number> {
  const now = new Date();
  let banked = 0;
  for (const r of rows) {
    if (r.minutes > 0) {
      const landed = await tx
        .insert(schema.realmTroubleClear)
        .values({ id: nanoid(), childId, date, homeId: r.homeId, minutes: r.minutes, createdAt: now })
        .onConflictDoNothing()
        .returning({ minutes: schema.realmTroubleClear.minutes });
      if (landed.length > 0) {
        banked += r.minutes;
        continue;
      }
    }
    await tx.insert(schema.realmTroubleClear).values({ id: nanoid(), childId, date, homeId: r.homeId, minutes: 0, createdAt: now });
  }
  if (banked > 0) await appendLedger(childId, date, "bonus", banked, {}, tx);
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
