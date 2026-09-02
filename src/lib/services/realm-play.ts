import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { settingsFromRow, type RealmSettings } from "@/lib/utils/realm-settings";
import type { LedgerRow } from "@/lib/utils/realm-access";

/**
 * Realm play-time plumbing shared by the actions and the quest-completion
 * hook. Plain module: callers have already authorized the child.
 */

/** Insert-if-missing then select, so two first reads can't make two rows. */
export async function loadRealmSettings(childId: string): Promise<RealmSettings> {
  const now = new Date();
  await db
    .insert(schema.realmSettings)
    .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  return settingsFromRow(rows[0] ?? null);
}

export async function loadLedger(childId: string, date: string): Promise<LedgerRow[]> {
  return db
    .select({ kind: schema.realmPlayLedger.kind, minutes: schema.realmPlayLedger.minutes })
    .from(schema.realmPlayLedger)
    .where(and(eq(schema.realmPlayLedger.childId, childId), eq(schema.realmPlayLedger.date, date)));
}

export async function appendLedger(
  childId: string,
  date: string,
  kind: LedgerRow["kind"],
  minutes: number,
  sourceAssignmentId: string | null = null
): Promise<void> {
  await db.insert(schema.realmPlayLedger).values({
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
