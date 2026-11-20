import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getTimezoneForChild, usableTimeZone } from "@/lib/services/family-timezone";
import { realmNow } from "@/lib/services/realm-clock";
import { addPlacesFound } from "@/lib/services/realm-places";
import type { Exec, Tx } from "@/lib/services/realm-play";
import { rewardKey, type WorldObject } from "@/lib/realm/world-objects";
import { lockedNow, nextRewards, type WorldRow } from "@/lib/realm/world-state";
import type { QuestionOutcome } from "@/lib/utils/deed-scoring";
import type { WorldOutcome } from "@/lib/utils/deed-run-types";

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
 * Every world-state row this hero has. `updatedAt` comes through the column's own timestamp mode,
 * epoch seconds read as the instant they were written; nothing here converts it by hand.
 */
export async function loadWorldRows(childId: string, exec: Exec = db): Promise<WorldRow[]> {
  const W = schema.realmWorldState;
  return exec.select({ objectId: W.objectId, state: W.state, updatedAt: W.updatedAt }).from(W).where(eq(W.childId, childId));
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
