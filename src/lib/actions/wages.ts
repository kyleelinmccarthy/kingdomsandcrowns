"use server";

import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { getActor, requireAdultActor } from "@/lib/auth/actor";
import { parseDollarsToCents, sumCents } from "@/lib/utils/wages";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formatDate } from "@/lib/utils/dates";

/** What a hero is currently owed, in cents. Negative if a parent overpaid. */
export async function getWageBalance(childId: string): Promise<number> {
  await requireChildAccess(childId);
  const rows = await db
    .select({ amountCents: schema.wageLedgerEntry.amountCents })
    .from(schema.wageLedgerEntry)
    .where(eq(schema.wageLedgerEntry.childId, childId));
  return sumCents(rows);
}

/** Ledger history, newest first. */
export async function getWageLedger(childId: string, limit = 100) {
  await requireChildAccess(childId);
  return db
    .select()
    .from(schema.wageLedgerEntry)
    .where(eq(schema.wageLedgerEntry.childId, childId))
    .orderBy(desc(schema.wageLedgerEntry.createdAt))
    .limit(limit);
}

/**
 * Records money actually handed over. The parent types a positive amount —
 * `parseDollarsToCents` rejects negatives — and the sign is applied here, so
 * the convention lives in exactly one place and the balance stays a plain sum.
 */
export async function recordWagePayout(
  childId: string,
  amount: string,
  note?: string
) {
  await requireAdultActor();
  await requireChildAccess(childId, { write: true });

  const cents = parseDollarsToCents(amount);
  if (cents === 0) throw new Error("Enter an amount greater than zero");

  const actor = await getActor();
  await db.insert(schema.wageLedgerEntry).values({
    id: nanoid(),
    childId,
    type: "payout",
    amountCents: -cents,
    taskAssignmentId: null,
    taskTitle: null,
    date: formatDate(new Date()),
    note: note ? sanitizeText(note, 500) : null,
    createdByUserId: actor?.kind === "adult" ? actor.userId : null,
    createdAt: new Date(),
  });
}
