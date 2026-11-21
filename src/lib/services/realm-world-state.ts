import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getTimezoneForChild, usableTimeZone } from "@/lib/services/family-timezone";
import { realmNow } from "@/lib/services/realm-clock";
import { addPlacesFound } from "@/lib/services/realm-places";
import type { Exec, Tx } from "@/lib/services/realm-play";
import { LORE, LORE_IDS, type LoreId } from "@/lib/realm/lore";
import { rewardKey, type WorldObject } from "@/lib/realm/world-objects";
import { lockedNow, nextRewards, solvedCount, type WorldRow } from "@/lib/realm/world-state";
import { towerRef } from "@/lib/realm/puzzle-tower";
import { DEEDS } from "@/lib/utils/deeds";
import type { QuestionOutcome } from "@/lib/utils/deed-scoring";
import type { TowerOutcome, WorldOutcome } from "@/lib/utils/deed-run-types";
import type { ContentBand } from "@/lib/utils/content-bands";

/**
 * THE WORLD'S STATE on the server: reading a hero's `realm_world_state` rows and opening a chest or
 * vault door. Plain module; callers have already authorised the hero. The rules are pure
 * (`realm/world-state.ts`); this is where they meet the database and the server's day.
 */

/** The day a lock is judged on: the server's date in the family's zone, never the device's (`realmNow`). */
export type WorldClock = { today: string; zone: string };

export async function worldClock(childId: string, now: Date = new Date()): Promise<WorldClock> {
  const [moment, zone] = await Promise.all([realmNow(childId, now), getTimezoneForChild(childId)]);
  return { today: moment.date, zone: usableTimeZone(zone) };
}

/**
 * The query behind `loadWorldRows`: every world-state row this hero has, searched by hero through
 * `realm_world_state_child_object_idx` (the query-plan test pins it). Exposed so the plan can be read.
 */
export function worldRowsQuery(childId: string, exec: Exec = db) {
  const W = schema.realmWorldState;
  return exec.select({ objectId: W.objectId, state: W.state, updatedAt: W.updatedAt }).from(W).where(eq(W.childId, childId));
}

/**
 * Every world-state row this hero has. `updatedAt` comes through the column's own timestamp mode,
 * epoch seconds read as the instant they were written; nothing here converts it by hand.
 */
export async function loadWorldRows(childId: string, exec: Exec = db): Promise<WorldRow[]> {
  return worldRowsQuery(childId, exec);
}

const LORE_PREFIX = "lore:";

/**
 * The lore pages this hero has found, in the order they were found (`updated_at`, then `object_id`
 * so a tie never wobbles), each with its title and text. An id that is not in the catalog is
 * skipped. Whatever the locks switch says: a page found stays found (R-G7), and a grown-up visiting
 * reads the same pages, so the caller has already authorised read access and nothing here asks.
 */
export async function loadFoundPages(childId: string): Promise<{ id: LoreId; title: string; text: string }[]> {
  const W = schema.realmWorldState;
  const rows = await db
    .select({ objectId: W.objectId })
    .from(W)
    .where(and(eq(W.childId, childId), like(W.objectId, `${LORE_PREFIX}%`)))
    .orderBy(asc(W.updatedAt), asc(W.objectId));
  const known = new Set<string>(LORE_IDS);
  return rows.flatMap((r) => {
    const id = r.objectId.slice(LORE_PREFIX.length);
    return known.has(id) ? [{ id: id as LoreId, ...LORE[id as LoreId] }] : [];
  });
}

/** The science side quests played as locks (`mechanic: "lock"`): the ones whose 3 stars open the Tower (PC-G8). */
const LOCK_DEED_IDS = DEEDS.filter((d) => d.mechanic === "lock").map((d) => d.id);

/**
 * The query behind `loadStarredBands` (R-G5): the distinct bands of this hero's finished 3-star runs
 * of a science lock side quest. `kind = 'deed'` leaves out Crown Challenges, world runs and tower
 * runs; `stars = 3` is written only when a run closes, so an open run is never counted. It reads the
 * deed's identity, whether the run played as sorts or as `choice` (PC-G8). Searched by hero through
 * `deed_run_child_completed_idx` (the query-plan test pins it).
 */
export function starredBandsQuery(childId: string, exec: Exec = db) {
  const R = schema.deedRun;
  return exec
    .selectDistinct({ band: R.band })
    .from(R)
    .where(and(eq(R.childId, childId), eq(R.kind, "deed"), inArray(R.deedId, LOCK_DEED_IDS), eq(R.stars, 3)));
}

/** The bands this hero has 3 stars at on a science lock side quest: what opens the Tower's floors. */
export async function loadStarredBands(childId: string, exec: Exec = db): Promise<ReadonlySet<ContentBand>> {
  return new Set((await starredBandsQuery(childId, exec)).map((r) => r.band));
}

/**
 * What the Realm's bundle reads of the world's state, in its first round (PC-G15): the hero's rows,
 * and `starred`, the bands they have 3 stars at on a science lock side quest, which open the
 * Tower's floors. Two queries, in parallel.
 */
export async function loadWorldRaw(childId: string): Promise<{ rows: WorldRow[]; starred: ReadonlySet<ContentBand> }> {
  const [rows, starred] = await Promise.all([loadWorldRows(childId), loadStarredBands(childId)]);
  return { rows, starred };
}

/** The state a reward's own row is written with (PC-G1). Fragments are found places, not rows here. */
const REWARD_STATE = { decor: "placed", lore: "found" } as const;

/**
 * Opens `object` for the hero inside the caller's locked transaction (PC-G2 steps 2-5, RG-c), after
 * the caller has closed the run in the same transaction. A miss writes nothing. A right answer reads
 * the hero's rows, and if the object is still shut (`lockedNow`, on the server's day) writes it
 * "open" and writes what it gives (`nextRewards`): decorations and pages as rows of their own, a
 * map as a found place. A plain read-check-write: `withChildLock` holds the database's write lock,
 * so a second finish waits, then reads the "open" this one wrote and gives nothing. Anything that
 * throws rolls the whole transaction back, the run's close included (RG-n).
 */
export async function openWorldObject(
  tx: Tx, childId: string, object: WorldObject, outcome: QuestionOutcome, now: Date, clock: WorldClock,
): Promise<WorldOutcome> {
  if (outcome === "miss") return { objectId: object.id, opened: false, reason: "missed", rewards: [] };
  const rows = await loadWorldRows(childId, tx);
  const row = rows.find((r) => r.objectId === object.id) ?? null;
  if (!lockedNow(object, row, clock.today, clock.zone)) return { objectId: object.id, opened: false, reason: "already-open", rewards: [] };

  const rewards = nextRewards(object, new Set(rows.map((r) => r.objectId)));
  const W = schema.realmWorldState;
  const target = [W.childId, W.objectId];
  await tx.insert(W).values({ id: nanoid(), childId, objectId: object.id, state: "open", updatedAt: now })
    .onConflictDoUpdate({ target, set: { state: "open", updatedAt: now } });
  const kept = rewards.flatMap((r) => (r.kind === "fragment" ? [] : [{ id: nanoid(), childId, objectId: rewardKey(r), state: REWARD_STATE[r.kind], updatedAt: now }]));
  if (kept.length > 0) await tx.insert(W).values(kept).onConflictDoNothing({ target });
  await addPlacesFound(childId, rewards.flatMap((r) => (r.kind === "fragment" ? [r.placeId] : [])), tx);
  return { objectId: object.id, opened: true, rewards };
}

/**
 * Counts one solved bonus lock on a floor inside the caller's locked transaction: the floor's
 * record, `tower:<band>`, is created holding "1" or has its count raised by one in the one
 * statement, so a count is never read, added to and written back. Returns the count now.
 */
export async function bumpTowerRecord(tx: Tx, childId: string, band: ContentBand, now: Date): Promise<number> {
  const W = schema.realmWorldState;
  const [row] = await tx.insert(W).values({ id: nanoid(), childId, objectId: towerRef(band), state: "1", updatedAt: now })
    .onConflictDoUpdate({ target: [W.childId, W.objectId], set: { state: sql`CAST(CAST(${W.state} AS INTEGER) + 1 AS TEXT)`, updatedAt: now } })
    .returning({ state: W.state });
  return solvedCount(row.state);
}

/**
 * What finishing a Tower floor's run did, inside the caller's locked transaction (R-G4b, RG-n),
 * after the caller has closed the run in it. A right first try counts one solved
 * (`bumpTowerRecord`); a miss writes nothing and reports the count as it stands (0 for a floor
 * never solved). Anything that throws rolls the whole transaction back, the run's close included.
 */
export async function recordTowerSolve(tx: Tx, childId: string, band: ContentBand, outcome: QuestionOutcome, now: Date): Promise<TowerOutcome> {
  if (outcome === "first") return { band, solved: await bumpTowerRecord(tx, childId, band, now), solvedNow: true };
  const W = schema.realmWorldState;
  const [row] = await tx.select({ state: W.state }).from(W).where(and(eq(W.childId, childId), eq(W.objectId, towerRef(band))));
  return { band, solved: solvedCount(row?.state), solvedNow: false };
}
