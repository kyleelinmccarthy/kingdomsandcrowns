import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { resolveMaterial, type MaterialId, type MaterialRow } from "@/lib/realm/materials";
import { loadRealmSettings, withChildLock, type Exec } from "@/lib/services/realm-play";

/**
 * Materials: what finished quests bring to the Realm. Plain module: callers have already
 * authorized the child.
 */

/**
 * Called once per completed quest. Mints the quest's subject material into the ledger, once:
 * the partial unique index on `source_assignment_id` (earned rows) is the guard, so a doubled
 * request (two tabs, the timer and the card, a redo after an undo) writes nothing the second
 * time and reports the row that is already there. Undoing a quest never takes materials back.
 *
 * It mints whatever `enabled` and `accessMode` say: materials record work, they are not play time.
 * Returns null when nothing is minted (`materialsPerQuest` is 0, or the assignment is gone or
 * belongs to another hero: a quest only ever mints for the hero it belongs to).
 */
export async function grantMaterialsForCompletion(
  childId: string,
  assignmentId: string,
): Promise<{ materialId: MaterialId; amount: number } | null> {
  // A quest with no subject (or a deleted one) brings timber, like any unmatched name.
  const rows = await db
    .select({ name: schema.subject.name, material: schema.subject.material })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .leftJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(and(eq(schema.questAssignment.id, assignmentId), eq(schema.questAssignment.childId, childId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const materialId = resolveMaterial({ name: row.name ?? "", material: row.material ?? null });

  const { materialsPerQuest } = await loadRealmSettings(childId);
  if (materialsPerQuest <= 0) return null;

  const M = schema.realmMaterial;
  return withChildLock(childId, async (tx) => {
    const minted = await tx
      .insert(M)
      .values({
        id: nanoid(),
        childId,
        materialId,
        amount: materialsPerQuest,
        kind: "earned",
        origin: "quest",
        sourceAssignmentId: assignmentId,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: M.id });
    if (minted.length > 0) return { materialId, amount: materialsPerQuest };

    // Already minted: report what is there.
    const [existing] = await tx
      .select({ materialId: M.materialId, amount: M.amount })
      .from(M)
      .where(and(eq(M.childId, childId), eq(M.kind, "earned"), eq(M.sourceAssignmentId, assignmentId)))
      .limit(1);
    return existing ? { materialId: existing.materialId as MaterialId, amount: existing.amount } : null;
  });
}

/**
 * The grant that can never fail a quest: any error is logged and swallowed. The welcome script
 * re-runs safely, so a quest whose grant failed is repaired later.
 */
export async function grantMaterialsSafely(childId: string, assignmentId: string): Promise<void> {
  try {
    await grantMaterialsForCompletion(childId, assignmentId);
  } catch (e) {
    console.error("Could not mint materials for a completed quest", { childId, assignmentId }, e);
  }
}

/** The hero's whole ledger (earned and spent), oldest first; ties break on id so FIFO is deterministic. `createdAt` is epoch seconds. */
export async function loadMaterialLedger(childId: string, exec: Exec = db): Promise<MaterialRow[]> {
  const M = schema.realmMaterial;
  const rows = await exec
    .select({ materialId: M.materialId, amount: M.amount, kind: M.kind, sourceAssignmentId: M.sourceAssignmentId, createdAt: M.createdAt })
    .from(M)
    .where(eq(M.childId, childId))
    .orderBy(asc(M.createdAt), asc(M.id));
  return rows.map((r) => ({
    materialId: r.materialId,
    amount: r.amount,
    kind: r.kind,
    sourceAssignmentId: r.sourceAssignmentId,
    createdAt: Math.floor(r.createdAt.getTime() / 1000),
  }));
}
