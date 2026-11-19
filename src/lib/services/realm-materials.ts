import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { IMPROVEMENTS, type ImprovementId } from "@/lib/realm/improvements";
import { materialBalance, resolveMaterial, type MaterialId, type MaterialRow } from "@/lib/realm/materials";
import { EMPTY_WORKS, type Delivery, type Plaque, type Works } from "@/lib/realm/works-state";
import { seasonLabel } from "@/lib/utils/seasons";
import { settingsFromRow } from "@/lib/utils/realm-settings";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { rewardLines, type QuestReward } from "@/lib/utils/quest-rewards";
import { loadDeedBest, siteTally } from "@/lib/services/deeds";
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

/** The columns a plaque is read from: a `realm_improvement` row and the start date of its season (null when it has none). */
const plaqueColumns = {
  improvementId: schema.realmImprovement.improvementId,
  level: schema.realmImprovement.level,
  stars: schema.realmImprovement.stars,
  builtByName: schema.realmImprovement.builtByName,
  sources: schema.realmImprovement.sources,
  startDate: schema.season.startDate,
};
type PlaqueRow = { improvementId: ImprovementId; level: number; stars: number; builtByName: string; sources: string; startDate: string | null };

/** The one shaping of a built level's row into its plaque: `loadWorks` and `finishBuild` both read through it. */
export function plaqueFromRow(r: PlaqueRow): Plaque {
  return {
    improvementId: r.improvementId,
    level: r.level,
    label: IMPROVEMENTS[r.improvementId].label,
    builtBy: r.builtByName,
    season: r.startDate ? seasonLabel(r.startDate) : null,
    sources: sourceTitles(r.sources),
    stars: r.stars,
  };
}

/** The plaque of one built level as it stands on record, or null when that level is not built. Reads through `exec` (a transaction, inside the lock). */
export async function loadPlaque(childId: string, improvementId: ImprovementId, level: number, exec: Exec = db): Promise<Plaque | null> {
  const I = schema.realmImprovement;
  const [row] = await exec
    .select(plaqueColumns)
    .from(I)
    .leftJoin(schema.season, eq(I.seasonId, schema.season.id))
    .where(and(eq(I.childId, childId), eq(I.improvementId, improvementId), eq(I.level, level)))
    .limit(1);
  return row ? plaqueFromRow({ ...row, improvementId }) : null;
}

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
      .select(plaqueColumns)
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
        // Newer than the mark; no mark (or no settings row yet) is everything. A row minted in the same second as the last one shown can be missed on the card, but never from the balance (accepted).
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
    plaques.push(plaqueFromRow({ ...r, improvementId: id }));
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

/**
 * What `planState` reads for a hero, from the database: the highest level built of each plan, the
 * core buildings that stand (each of its stories done once, or ever marked complete), and the
 * materials in hand.
 */
export async function loadPlanInput(childId: string): Promise<{
  built: Record<string, number>;
  raised: Set<string>;
  balance: Record<MaterialId, number>;
}> {
  const [levels, progress, ledger, best] = await Promise.all([
    db
      .select({ improvementId: schema.realmImprovement.improvementId, level: schema.realmImprovement.level })
      .from(schema.realmImprovement)
      .where(eq(schema.realmImprovement.childId, childId)),
    db
      .select({ buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone, completedAt: schema.kingdomProgress.completedAt })
      .from(schema.kingdomProgress)
      .where(eq(schema.kingdomProgress.childId, childId)),
    loadMaterialLedger(childId),
    loadDeedBest(childId),
  ]);
  const built: Record<string, number> = {};
  for (const r of levels) built[r.improvementId] = Math.max(built[r.improvementId] ?? 0, r.level);
  // The world's own rule (`buildingProgress` over `siteTally`), so the plans board and the world never disagree.
  const rowBy = new Map(progress.map((row) => [row.buildingId, row]));
  const raised = new Set(BUILDINGS.filter((b) => buildingProgress(siteTally(b.id, rowBy.get(b.id), best), b).complete).map((b) => b.id));
  return { built, raised, balance: materialBalance(ledger) };
}

/**
 * What the Tavern's plan card reads, and everything else a page needs to know about the hero's
 * kingdom in one go: the plans' inputs (built levels, buildings that stand, the satchel), the pin,
 * and three settings (whether quests bring materials, whether the Realm is on, whether finished
 * quests show their minutes). A page that has it hands it to `loadQuestRewards` so the kingdom is
 * read once.
 */
export type PlanCardData = {
  materialsPerQuest: number;
  enabled: boolean;
  showMinutes: boolean;
  pinned: string | null;
  built: Record<string, number>;
  raised: string[];
  balance: Record<MaterialId, number>;
};

/** Reads only (it never creates the settings row); callers have authorized the child. */
export async function loadPlanCardData(childId: string): Promise<PlanCardData> {
  const [input, [row]] = await Promise.all([
    loadPlanInput(childId),
    db.select().from(schema.realmSettings).where(eq(schema.realmSettings.childId, childId)).limit(1),
  ]);
  const settings = settingsFromRow(row ?? null);
  return {
    materialsPerQuest: settings.materialsPerQuest,
    enabled: settings.enabled,
    showMinutes: settings.showMinutesOnQuests,
    pinned: row?.pinnedPlan ?? null,
    built: input.built,
    raised: [...input.raised],
    balance: input.balance,
  };
}

/**
 * What finished quests made, for their cards: "+1 Ink · the Library's Reading Wing needs 3 more"
 * (see `rewardLines` for the hint) and, when a grown-up turned `showMinutesOnQuests` on, the Realm
 * minutes each quest earned. One entry per assignment asked about. Reads only (it never creates
 * the settings row); every row is scoped to `childId`.
 *
 * A page that already read the kingdom passes it as `known` and this reads only the quests' own
 * rows (the earned materials, and the minutes when they are shown): one or two queries. Without it,
 * the kingdom and the settings are read here, in parallel with the earned rows.
 */
export async function loadQuestRewards(childId: string, assignmentIds: string[], known?: PlanCardData): Promise<Record<string, QuestReward>> {
  const ids = [...new Set(assignmentIds)];
  if (ids.length === 0) return {};
  const M = schema.realmMaterial;
  const L = schema.realmPlayLedger;
  const S = schema.realmSettings;
  const minutesFor = (): Promise<{ assignmentId: string | null; minutes: number }[]> =>
    db
      .select({ assignmentId: L.sourceAssignmentId, minutes: sql<number>`sum(${L.minutes})` })
      .from(L)
      .where(and(eq(L.childId, childId), eq(L.kind, "earned"), inArray(L.sourceAssignmentId, ids)))
      .groupBy(L.sourceAssignmentId);

  const earnedQuery = db
    .select({ materialId: M.materialId, amount: M.amount, sourceAssignmentId: M.sourceAssignmentId })
    .from(M)
    .where(and(eq(M.childId, childId), eq(M.kind, "earned"), inArray(M.sourceAssignmentId, ids)));

  const [earned, input, { pinned, minutes }] = await Promise.all([
    earnedQuery,
    known ? { built: known.built, raised: new Set(known.raised), balance: known.balance } : loadPlanInput(childId),
    known
      ? Promise.resolve(known.showMinutes ? minutesFor() : null).then((rows) => ({ pinned: known.pinned, minutes: rows }))
      : // The settings, then (only when the setting is on) the minutes: one chain, overlapping the other reads.
        db
          .select({ pinnedPlan: S.pinnedPlan, showMinutes: S.showMinutesOnQuests })
          .from(S)
          .where(eq(S.childId, childId))
          .limit(1)
          .then(async ([row]) => ({ pinned: row?.pinnedPlan ?? null, minutes: row?.showMinutes ? await minutesFor() : null })),
  ]);

  const made = rewardLines(earned, input, pinned);
  const earnedMinutes = new Map((minutes ?? []).map((m) => [m.assignmentId, Number(m.minutes)]));
  const out: Record<string, QuestReward> = {};
  for (const id of ids) {
    out[id] = { made: made.get(id) ?? null, minutes: minutes === null ? null : (earnedMinutes.get(id) ?? null) };
  }
  return out;
}

/** Whether the hero's Realm is on (the default for a hero with no settings row). Reads only: it never creates the row. */
export async function loadRealmEnabled(childId: string): Promise<boolean> {
  const [row] = await db.select().from(schema.realmSettings).where(eq(schema.realmSettings.childId, childId)).limit(1);
  return settingsFromRow(row ?? null).enabled;
}
