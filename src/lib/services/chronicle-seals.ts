import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { buildSeal, sealToStore, type SealInput } from "@/lib/utils/seals";

/** The name a seal carries when the grown-up has none on file. */
const UNNAMED = "A grown-up";

/** Whether a quest has been finished (only a finished quest can be sealed). */
export async function isAssignmentCompleted(assignmentId: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.questAssignment.status })
    .from(schema.questAssignment)
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);
  return rows[0]?.status === "completed";
}

/** A grown-up's display name as it goes on a seal. */
async function displayNameOf(userId: string): Promise<string> {
  const rows = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  return rows[0]?.name?.trim() || UNNAMED;
}

/**
 * Press a seal on a finished quest, or lift it (`null`). One write, guarded on `completed` so a
 * quest put back to the to-do list between the check and the write is not sealed.
 */
export async function writeSeal(assignmentId: string, seal: string | null): Promise<void> {
  await db
    .update(schema.questAssignment)
    .set({ seal, updatedAt: new Date() })
    .where(and(eq(schema.questAssignment.id, assignmentId), eq(schema.questAssignment.status, "completed")));
}

/** Build the stored seal for a validated input: the grown-up's name now, and the time in epoch seconds. */
export async function sealFor(input: SealInput, userId: string): Promise<string> {
  return sealToStore(buildSeal(input, await displayNameOf(userId), Math.floor(Date.now() / 1000)));
}
