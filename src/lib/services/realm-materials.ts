import { and, asc, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { IMPROVEMENTS, type ImprovementId } from "@/lib/realm/improvements";
import { materialBalance, resolveMaterial, type MaterialId, type MaterialRow } from "@/lib/realm/materials";
import { EMPTY_WORKS, type Delivery, type Plaque, type Works } from "@/lib/realm/works-state";
import { seasonLabel } from "@/lib/utils/seasons";
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

export type { Delivery, Plaque, Works };
export { EMPTY_WORKS };

/** The quest titles a plaque keeps (D8's `sources` JSON: `{ title, subject, date }[]`). Bad JSON or a wrong shape is none. */
function sourceTitles(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((s: unknown) => {
      const title = s && typeof s === "object" ? (s as { title?: unknown }).title : undefined;
      return typeof title === "string" && title !== "" ? [title] : [];
    });
  } catch {
    return [];
  }
}

const A_QUEST = "A quest";

/**
 * What the Realm reads about the hero's works, in one round of parallel reads: the satchel, the
 * highest level built of each plan with a plaque per built level, the pinned plan, and the delivery
 * (earned rows newer than `delivery_seen_at`; never seen means all of them). Reads only: it never
 * creates the settings row. Callers have authorized the child.
 */
export async function loadWorks(childId: string): Promise<Works> {
  const M = schema.realmMaterial;
  const I = schema.realmImprovement;
  const S = schema.realmSettings;
  const [ledger, built, settings, delivered] = await Promise.all([
    loadMaterialLedger(childId),
    db
      .select({
        improvementId: I.improvementId, level: I.level, stars: I.stars, builtByName: I.builtByName, sources: I.sources,
        startDate: schema.season.startDate,
      })
      .from(I)
      .leftJoin(schema.season, eq(I.seasonId, schema.season.id))
      .where(eq(I.childId, childId))
      .orderBy(asc(I.builtAt), asc(I.level)),
    db.select({ pinnedPlan: S.pinnedPlan }).from(S).where(eq(S.childId, childId)).limit(1),
    db
      .select({ materialId: M.materialId, amount: M.amount, origin: M.origin, createdAt: M.createdAt, title: schema.quest.title })
      .from(M)
      .leftJoin(schema.questAssignment, eq(M.sourceAssignmentId, schema.questAssignment.id))
      .leftJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
      .where(and(
        eq(M.childId, childId),
        eq(M.kind, "earned"),
        // Newer than the mark; no mark (or no settings row yet) is everything.
        gt(M.createdAt, sql`coalesce((select ${S.deliverySeenAt} from ${S} where ${S.childId} = ${childId}), -1)`),
      ))
      .orderBy(asc(M.createdAt), asc(M.id)),
  ]);

  const levels: Record<string, number> = {};
  const plaques: Plaque[] = [];
  for (const r of built) {
    // The catalog is the authority: an id it has lost (or a prototype key) draws nothing.
    if (!Object.hasOwn(IMPROVEMENTS, r.improvementId)) continue;
    const id = r.improvementId as ImprovementId;
    levels[id] = Math.max(levels[id] ?? 0, r.level);
    plaques.push({
      improvementId: id,
      level: r.level,
      label: IMPROVEMENTS[id].label,
      builtBy: r.builtByName,
      season: r.startDate ? seasonLabel(r.startDate) : null,
      sources: sourceTitles(r.sources),
      stars: r.stars,
    });
  }

  const pinned = settings[0]?.pinnedPlan;
  const delivery: Delivery | null = delivered.length === 0
    ? null
    : {
        rows: delivered.map((r) => ({
          materialId: r.materialId as MaterialId, amount: r.amount, title: r.title ?? A_QUEST, origin: r.origin,
        })),
        // Rows come oldest first, so the last is the newest.
        through: Math.floor(delivered[delivered.length - 1].createdAt.getTime() / 1000),
      };

  return {
    balance: materialBalance(ledger),
    built: levels,
    plaques,
    pinned: pinned && Object.hasOwn(IMPROVEMENTS, pinned) ? pinned : null,
    delivery,
  };
}

/** Pins a plan (or clears the pin with null). The caller has checked the id against the catalog; the settings row is created if missing (an upsert). */
export async function setPinnedPlan(childId: string, improvementId: ImprovementId | null): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.realmSettings)
    .values({ id: nanoid(), childId, pinnedPlan: improvementId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: schema.realmSettings.childId, set: { pinnedPlan: improvementId, updatedAt: now } });
}

/**
 * Moves `delivery_seen_at` forward to `throughSeconds`, never past now and never backwards: the
 * stored mark only ever grows, so a stale tab cannot bring a seen delivery back. The caller has
 * checked it is a finite number. The settings row is created if missing (an upsert).
 */
export async function advanceDeliverySeen(childId: string, throughSeconds: number): Promise<void> {
  const S = schema.realmSettings;
  const now = new Date();
  const target = Math.max(0, Math.min(Math.floor(throughSeconds), Math.floor(now.getTime() / 1000)));
  // One statement, so two tabs cannot each read an old mark and write the smaller value last.
  await db
    .insert(S)
    .values({ id: nanoid(), childId, deliverySeenAt: new Date(target * 1000), createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: S.childId,
      set: { deliverySeenAt: sql`max(coalesce(${S.deliverySeenAt}, 0), ${target})`, updatedAt: now },
    });
}
