import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { IMPROVEMENTS, type ImprovementId } from "@/lib/realm/improvements";
import { allocateSpend, materialBalance, MATERIAL_IDS, type MaterialId } from "@/lib/realm/materials";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { seasonLabel } from "@/lib/utils/seasons";
import { loadMaterialLedger } from "./realm-materials";
import { withChildLock, type Tx } from "./realm-play";

/**
 * What `planState` reads for a hero, from the database: the highest level built of each plan, the
 * core buildings that stand (a building is raised once its quests are done, or once it was ever
 * marked complete), and the materials in hand.
 */
export async function loadPlanInput(childId: string): Promise<{
  built: Record<string, number>;
  raised: Set<string>;
  balance: Record<MaterialId, number>;
}> {
  const [levels, progress, ledger] = await Promise.all([
    db
      .select({ improvementId: schema.realmImprovement.improvementId, level: schema.realmImprovement.level })
      .from(schema.realmImprovement)
      .where(eq(schema.realmImprovement.childId, childId)),
    db
      .select({ buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone, completedAt: schema.kingdomProgress.completedAt })
      .from(schema.kingdomProgress)
      .where(eq(schema.kingdomProgress.childId, childId)),
    loadMaterialLedger(childId),
  ]);
  const built: Record<string, number> = {};
  for (const r of levels) built[r.improvementId] = Math.max(built[r.improvementId] ?? 0, r.level);
  const raised = new Set<string>();
  for (const row of progress) {
    const building = BUILDINGS.find((b) => b.id === row.buildingId);
    if (building && (row.completedAt !== null || buildingProgress(row.deedsDone, building).complete)) raised.add(building.id);
  }
  return { built, raised, balance: materialBalance(ledger) };
}

/** What a plaque says about one quest that paid for a level (the `sources` column holds these as JSON). */
type SourceQuest = { title: string; subject: string | null; date: string | null };

/** A quest whose assignment has since been deleted still stands on the plaque, by this name. */
const UNKNOWN_QUEST: SourceQuest = { title: "A quest", subject: null, date: null };

/** The quests behind the spent materials, in the order given (the ledger's FIFO order). Reads through `tx`. */
async function loadSourceQuests(childId: string, assignmentIds: string[], tx: Tx): Promise<SourceQuest[]> {
  if (assignmentIds.length === 0) return [];
  const rows = await tx
    .select({ id: schema.questAssignment.id, title: schema.quest.title, subject: schema.subject.name, date: schema.questAssignment.date })
    .from(schema.questAssignment)
    .leftJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .leftJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(and(eq(schema.questAssignment.childId, childId), inArray(schema.questAssignment.id, assignmentIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return assignmentIds.map((id) => {
    const r = byId.get(id);
    return r ? { title: r.title ?? UNKNOWN_QUEST.title, subject: r.subject ?? null, date: r.date } : UNKNOWN_QUEST;
  });
}

/**
 * Finishes a build run: spends the level's cost from the hero's materials and writes the level with
 * its plaque, exactly once. The whole of it runs in ONE `withChildLock` transaction and every read
 * and write goes through `tx`, so two runs finishing at once (a tablet and a laptop) are served one
 * after the other: the second reads what the first spent. Nothing here can overspend, and the
 * balance cannot go negative.
 *
 *  - A level already built is reported built, with no spend and no plaque (the two-tabs case).
 *  - A level whose predecessor is not built, or that is not in the catalog, is an "error".
 *  - Short of materials is "short"; nothing is written.
 *  - Otherwise the level row is inserted first (`onConflictDoNothing` on `(child, plan, level)`), and
 *    only when that insert wins are the `spent` rows written, so a spend never exists without its level.
 *
 * `stars` is the run's, kept on the plaque; the level is built whatever they are.
 */
export async function finishBuild(
  childId: string,
  ref: { improvementId: ImprovementId; level: number },
  stars: number,
  now: Date,
): Promise<NonNullable<RunSummary["improvement"]>> {
  const plan = IMPROVEMENTS[ref.improvementId];
  const { improvementId, level } = ref;
  return withChildLock(childId, async (tx) => {
    const ledger = await loadMaterialLedger(childId, tx);
    const balance = materialBalance(ledger);
    const head = { id: improvementId, label: plan?.label ?? improvementId, level };

    const I = schema.realmImprovement;
    const stands = async (lvl: number) =>
      (await tx.select({ id: I.id }).from(I).where(and(eq(I.childId, childId), eq(I.improvementId, improvementId), eq(I.level, lvl))).limit(1)).length > 0;

    if (!plan || !Number.isInteger(level) || level < 1 || level > plan.levels.length) return { ...head, built: false, reason: "error", balance };
    // Built already (another tab, or a retry): nothing to spend, nothing to announce.
    if (await stands(level)) return { ...head, built: true, balance };
    if (level > 1 && !(await stands(level - 1))) return { ...head, built: false, reason: "error", balance };

    const alloc = allocateSpend(plan.levels[level - 1].cost, ledger);
    if (!alloc.ok) return { ...head, built: false, reason: "short", balance };

    const [openSeason] = await tx
      .select({ id: schema.season.id, startDate: schema.season.startDate })
      .from(schema.season)
      .where(and(eq(schema.season.childId, childId), isNull(schema.season.completedAt)))
      .orderBy(desc(schema.season.ordinal))
      .limit(1);
    const [hero] = await tx.select({ displayName: schema.child.displayName }).from(schema.child).where(eq(schema.child.id, childId)).limit(1);
    const builtBy = hero?.displayName ?? "A hero";
    const sources = await loadSourceQuests(childId, alloc.sources, tx);

    const won = await tx
      .insert(I)
      .values({
        id: nanoid(), childId, improvementId, level, stars,
        seasonId: openSeason?.id ?? null, builtByName: builtBy, sources: JSON.stringify(sources), builtAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: I.id });
    // Another call built it between our read and our insert: it spent, we do not.
    if (won.length === 0) return { ...head, built: true, balance };

    const M = schema.realmMaterial;
    const paid = MATERIAL_IDS.filter((id) => (alloc.spend[id] ?? 0) > 0);
    if (paid.length > 0) {
      await tx.insert(M).values(
        paid.map((materialId) => ({
          id: nanoid(), childId, materialId, amount: alloc.spend[materialId] ?? 0, kind: "spent" as const,
          origin: "quest" as const, sourceAssignmentId: null, improvementId, level, createdAt: now,
        })),
      );
    }
    const after = { ...balance };
    for (const id of paid) after[id] = Math.max(0, after[id] - (alloc.spend[id] ?? 0));
    return {
      ...head, built: true, balance: after,
      plaque: {
        improvementId, level, label: plan.label, builtBy, season: openSeason ? seasonLabel(openSeason.startDate) : null,
        sources: sources.map((q) => q.title), stars,
      },
    };
  });
}
