import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "@/lib/db/schema";
import { allocatePlan, IMPROVEMENTS, UNKNOWN_QUEST_TITLE, type ImprovementId } from "@/lib/realm/improvements";
import { materialBalance, MATERIAL_IDS } from "@/lib/realm/materials";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import { seasonLabel } from "@/lib/utils/seasons";
import { loadMaterialLedger, loadPlaque } from "./realm-materials";
import { withChildLock, type Tx } from "./realm-play";

/** What a plaque says about one quest that paid for a level (the `sources` column holds these as JSON). */
type SourceQuest = { title: string; subject: string | null; date: string | null };

/** A quest whose assignment has since been deleted still stands on the plaque, by this name. */
const UNKNOWN_QUEST: SourceQuest = { title: UNKNOWN_QUEST_TITLE, subject: null, date: null };

/**
 * The quests behind the spent materials, in the order given (the ledger's FIFO order), each title
 * once: two assignments of one quest are one line on the plaque, kept where it first paid. Reads
 * through `tx`.
 */
async function loadSourceQuests(childId: string, assignmentIds: string[], tx: Tx): Promise<SourceQuest[]> {
  if (assignmentIds.length === 0) return [];
  const rows = await tx
    .select({ id: schema.questAssignment.id, title: schema.quest.title, subject: schema.subject.name, date: schema.questAssignment.date })
    .from(schema.questAssignment)
    .leftJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .leftJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(and(eq(schema.questAssignment.childId, childId), inArray(schema.questAssignment.id, assignmentIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const quests = assignmentIds.map((id): SourceQuest => {
    const r = byId.get(id);
    return r ? { title: r.title ?? UNKNOWN_QUEST.title, subject: r.subject ?? null, date: r.date } : UNKNOWN_QUEST;
  });
  return quests.filter((q, i) => quests.findIndex((other) => other.title === q.title) === i);
}

/**
 * Finishes a build run: spends the level's cost from the hero's materials and writes the level with
 * its plaque, exactly once. The whole of it runs in ONE `withChildLock` transaction and every read
 * and write goes through `tx`, so two runs finishing at once (a tablet and a laptop) are served one
 * after the other: the second reads what the first spent. Nothing here can overspend, and the
 * balance cannot go negative.
 *
 *  - A level already built is reported built, with no spend, carrying the plaque already on record
 *    (the two-tabs case: this client never heard of that level, so it must be handed its plaque).
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
    const onRecord = async () => {
      const plaque = await loadPlaque(childId, improvementId, level, tx);
      return plaque ? { plaque } : {};
    };
    const stands = async (lvl: number) =>
      (await tx.select({ id: I.id }).from(I).where(and(eq(I.childId, childId), eq(I.improvementId, improvementId), eq(I.level, lvl))).limit(1)).length > 0;

    if (!plan || !Number.isInteger(level) || level < 1 || level > plan.levels.length) return { ...head, built: false, reason: "error", balance };
    // Built already (another tab, or a retry): nothing to spend. Hand back the plaque on record, so the client never holds a built level with none.
    if (await stands(level)) return { ...head, built: true, balance, ...(await onRecord()) };
    if (level > 1 && !(await stands(level - 1))) return { ...head, built: false, reason: "error", balance };

    // The one rule for what a plan costs and who may pay its secondary share (RD-t), as `planState` uses it.
    const alloc = allocatePlan(improvementId, level, ledger);
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
    // Another call built it between our read and our insert: it spent, we do not. Read what it left, and its plaque.
    if (won.length === 0) return { ...head, built: true, balance: materialBalance(await loadMaterialLedger(childId, tx)), ...(await onRecord()) };

    const M = schema.realmMaterial;
    const paid = MATERIAL_IDS.filter((id) => (alloc.spend[id] ?? 0) > 0);
    const spentRows = paid.map((materialId) => ({
      id: nanoid(), childId, materialId, amount: alloc.spend[materialId] ?? 0, kind: "spent" as const,
      origin: "quest" as const, sourceAssignmentId: null, improvementId, level, createdAt: now,
    }));
    if (spentRows.length > 0) await tx.insert(M).values(spentRows);
    // The balance after the spend, by the one rule: the ledger as read plus the rows just written.
    const after = materialBalance([
      ...ledger,
      ...spentRows.map((r) => ({
        materialId: r.materialId, amount: r.amount, kind: r.kind, sourceAssignmentId: null, createdAt: Math.floor(now.getTime() / 1000),
      })),
    ]);
    return {
      ...head, built: true, balance: after,
      plaque: {
        improvementId, level, label: plan.label, builtBy, season: openSeason ? seasonLabel(openSeason.startDate) : null,
        sources: sources.map((q) => q.title), stars,
      },
    };
  });
}
