"use server";

import { and, desc, eq, inArray, isNotNull, isNull, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { BAND_LABELS, type ContentBand } from "@/lib/utils/content-bands";
import { bandForGrade } from "@/lib/utils/grade-levels";
import { findSkill, type SkillArea } from "@/lib/utils/skills";
import { buildingProgress, findBuilding } from "@/lib/utils/kingdom";
import { deedStory, findDeed } from "@/lib/utils/deeds";
import { SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import {
  buildDeedRun,
  chooseSkills,
  gradeAnswer,
  toClientQuestion,
  type ClientQuestion,
  type PoolItem,
} from "@/lib/utils/deed-engine";
import { masteryChangeCopy, masteryLabel, parseRecentResults, recordResult } from "@/lib/utils/mastery";
import type { Question } from "@/lib/utils/drill-generators";
import { loadHeroLevels, loadKingdomOverview, type BuildingOverview } from "@/lib/services/deeds";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
export type MasteryRow = { skillId: string; label: string; area: SkillArea; level: number; levelLabel: string; lastPracticedAt: string | null };
export type DeedsOverview = {
  enabled: boolean; band: ContentBand; bandLabel: string; tone: "gentle" | "monsters";
  buildings: BuildingOverview[]; mastery: MasteryRow[];
};
export type RunStart = { runId: string; deed: { id: string; title: string; story: string; area: SkillArea }; questions: ClientQuestion[]; responses: (string | null)[] };
export type AnswerResult = { correct: boolean; answer: string };
export type RunSummary = {
  correctCount: number; total: number; flawless: boolean; masteryChanges: string[];
  building: { label: string; done: number; total: number; complete: boolean };
};

const CLOSED = "The Realm is closed for this hero. A grown-up can open it in the Chronicle.";
const RESUME_WINDOW_MS = 60 * 60 * 1000;

async function loadMasteryRows(childId: string) {
  return db.select().from(schema.skillMastery).where(eq(schema.skillMastery.childId, childId));
}

function masteryRow(row: typeof schema.skillMastery.$inferSelect): MasteryRow | null {
  const skill = findSkill(row.skillId);
  if (!skill) return null;
  return {
    skillId: row.skillId, label: skill.label, area: skill.area, level: row.level,
    levelLabel: masteryLabel(row.level), lastPracticedAt: row.lastPracticedAt ? row.lastPracticedAt.toISOString() : null,
  };
}

/** Questions the hero got wrong in their last five finished deeds, newest first. */
async function loadRecentMisses(childId: string): Promise<Question[]> {
  const runs = await db
    .select({ questions: schema.deedRun.questions, responses: schema.deedRun.responses })
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), isNotNull(schema.deedRun.completedAt)))
    .orderBy(desc(schema.deedRun.completedAt))
    .limit(5);
  const misses: Question[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    try {
      const qs = JSON.parse(run.questions) as Question[];
      const rs = JSON.parse(run.responses) as (string | null)[];
      // Runs are newest first, so the first time an id is seen is its newest miss; a
      // question missed again in an older run is not pushed a second time.
      qs.forEach((q, i) => {
        if (rs[i] !== null && rs[i] !== undefined && !gradeAnswer(q, rs[i]!) && !seen.has(q.id)) {
          seen.add(q.id);
          misses.push(q);
        }
      });
    } catch { /* a malformed old run is skipped, never fatal */ }
  }
  return misses.slice(0, 5);
}

/** A hero may see their own deeds; a closed Realm shows as such rather than throwing. */
export async function getDeedsOverview(childId: string): Promise<DeedsOverview> {
  await requireChildAccess(childId);
  const [kingdom, mastery] = await Promise.all([loadKingdomOverview(childId), loadMasteryRows(childId)]);
  const heroBand = bandForGrade(kingdom.ownGrade);
  return {
    // The page's one coarse label still describes the hero themselves, not any one
    // strand's gap; the per-strand grades reach the engine, not this header.
    enabled: kingdom.enabled, band: heroBand, bandLabel: BAND_LABELS[heroBand], tone: kingdom.tone,
    buildings: kingdom.buildings, mastery: mastery.map(masteryRow).filter((m): m is MasteryRow => m !== null),
  };
}

export async function getMasteryOverview(childId: string): Promise<MasteryRow[]> {
  await requireChildAccess(childId);
  return (await loadMasteryRows(childId)).map(masteryRow).filter((m): m is MasteryRow => m !== null);
}

// Sentence case here (not the SIDE_QUESTS title-case noun): this reads as a plain sentence, not an error code.
const HERO_ONLY = "Side quests are for the hero to play.";

export async function startDeedRun(childId: string, deedId: string, context: "page" | "realm" = "page"): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  // In the world, only the hero plays; a parent previewing the Realm reads stories but never starts a run.
  if (context === "realm" && !isChildActor(access)) throw new Error(HERO_ONLY);
  const deed = findDeed(deedId);
  if (!deed) throw new Error(`That ${SIDE_QUEST_LOWER} is not in the chronicle.`);
  const hero = await loadHeroLevels(childId);
  if (!hero.enabled) throw new Error(CLOSED);
  const story = deedStory(deed, hero.tone);

  // A run abandoned minutes ago is picked back up rather than restarted.
  const since = new Date(Date.now() - RESUME_WINDOW_MS);
  const open = await db
    .select()
    .from(schema.deedRun)
    .where(and(eq(schema.deedRun.childId, childId), eq(schema.deedRun.deedId, deedId), isNull(schema.deedRun.completedAt), gt(schema.deedRun.startedAt, since)))
    .limit(1);
  if (open[0]) {
    const qs = JSON.parse(open[0].questions) as Question[];
    const responses = JSON.parse(open[0].responses) as (string | null)[];
    return { runId: open[0].id, deed: { id: deed.id, title: deed.title, story, area: deed.area }, questions: qs.map(toClientQuestion), responses };
  }

  const grade = hero.grades[deed.area];
  const skills = chooseSkills(deed, grade);
  const poolSkillIds = skills.filter((s) => s.source.kind === "pool").map((s) => s.id);
  const [profileRow, masteryRows, poolRows, recentMisses] = await Promise.all([
    // Memoized per request, so this is the same round trip loadHeroLevels just made.
    loadLearningProfileRow(childId),
    loadMasteryRows(childId),
    poolSkillIds.length > 0
      ? db.select().from(schema.drillItem).where(inArray(schema.drillItem.skillId, poolSkillIds))
      : Promise.resolve([] as (typeof schema.drillItem.$inferSelect)[]),
    loadRecentMisses(childId),
  ]);
  const profile = profileFromRow(profileRow);
  const masteryBySkill: Record<string, number> = {};
  for (const m of masteryRows) masteryBySkill[m.skillId] = m.level;
  const poolItems: PoolItem[] = poolRows.map((r) => ({
    id: r.id, skillId: r.skillId, prompt: r.prompt, answer: r.answer,
    distractors: JSON.parse(r.distractors) as string[], readAloud: r.readAloud, level: r.level,
  }));

  const built = buildDeedRun({ deed, grade, masteryBySkill, profile, seed: Date.now() >>> 0, poolItems, recentMisses });
  if (built.questions.length === 0) throw new Error(`No ${SIDE_QUESTS_LOWER} are ready for this hero yet.`);

  const now = new Date();
  const runId = nanoid();
  const masteryStart: Record<string, number> = {};
  for (const id of built.skillIds) masteryStart[id] = masteryBySkill[id] ?? 0;
  await db.insert(schema.deedRun).values({
    id: runId, childId, deedId, skillIds: JSON.stringify(built.skillIds), band: bandForGrade(grade),
    questions: JSON.stringify(built.questions), responses: JSON.stringify(built.questions.map(() => null)),
    masteryStart: JSON.stringify(masteryStart), correctCount: 0, flawless: false,
    startedAt: now, completedAt: null, createdAt: now, updatedAt: now,
  });
  return {
    runId, deed: { id: deed.id, title: deed.title, story, area: deed.area },
    questions: built.questions.map(toClientQuestion), responses: built.questions.map(() => null),
  };
}

async function loadRun(runId: string) {
  const rows = await db.select().from(schema.deedRun).where(eq(schema.deedRun.id, runId)).limit(1);
  if (!rows[0]) throw new Error(`That ${SIDE_QUEST_LOWER} is not in the chronicle.`);
  await requireChildAccess(rows[0].childId, { write: true });
  return rows[0];
}

export async function answerDeedQuestion(runId: string, index: number, answer: string): Promise<AnswerResult> {
  const run = await loadRun(runId);
  if (run.completedAt) throw new Error(`That ${SIDE_QUEST_LOWER} has already been finished.`);
  const questions = JSON.parse(run.questions) as Question[];
  const responses = JSON.parse(run.responses) as (string | null)[];
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) throw new Error(`That question is not in this ${SIDE_QUEST_LOWER}.`);
  const question = questions[index];
  // A repeat answer to the same question (double tap, retry) is not re-graded.
  if (responses[index] !== null && responses[index] !== undefined) {
    return { correct: gradeAnswer(question, responses[index]!), answer: question.answer };
  }
  const correct = gradeAnswer(question, answer);
  responses[index] = answer;
  const now = new Date();
  await db
    .update(schema.deedRun)
    .set({ responses: JSON.stringify(responses), correctCount: run.correctCount + (correct ? 1 : 0), updatedAt: now })
    .where(eq(schema.deedRun.id, runId));

  // Mastery moves on every answer, not at the end, so an abandoned run still taught something.
  // Insert-first (same pattern as loadRealmSettings): the row always exists before we
  // read it, so two first answers to one skill racing each other can't both see "no
  // row" and both fall into an insert — one insert wins, onConflictDoNothing no-ops
  // the other, and both then land on the same unconditional update below.
  await db.insert(schema.skillMastery).values({
    id: nanoid(), childId: run.childId, skillId: question.skillId, level: 0,
    recentResults: "[]", correctTotal: 0, attemptTotal: 0,
    lastPracticedAt: null, createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  const existing = await db
    .select()
    .from(schema.skillMastery)
    .where(and(eq(schema.skillMastery.childId, run.childId), eq(schema.skillMastery.skillId, question.skillId)))
    .limit(1);
  const state = recordResult(
    { level: existing[0]?.level ?? 0, recentResults: parseRecentResults(existing[0]?.recentResults ?? null) },
    correct,
  );
  await db.update(schema.skillMastery).set({
    level: state.level, recentResults: JSON.stringify(state.recentResults),
    correctTotal: (existing[0]?.correctTotal ?? 0) + (correct ? 1 : 0), attemptTotal: (existing[0]?.attemptTotal ?? 0) + 1,
    lastPracticedAt: now, updatedAt: now,
  }).where(and(eq(schema.skillMastery.childId, run.childId), eq(schema.skillMastery.skillId, question.skillId)));
  return { correct, answer: question.answer };
}

export async function completeDeedRun(runId: string): Promise<RunSummary> {
  const run = await loadRun(runId);
  if (run.completedAt) throw new Error(`That ${SIDE_QUEST_LOWER} has already been finished.`);
  const questions = JSON.parse(run.questions) as Question[];
  const responses = JSON.parse(run.responses) as (string | null)[];
  if (responses.length !== questions.length || responses.some((r) => r === null || r === undefined)) {
    throw new Error(`Answer every question before finishing the ${SIDE_QUEST_LOWER}.`);
  }
  const correctCount = questions.filter((q, i) => gradeAnswer(q, responses[i]!)).length;
  const flawless = correctCount === questions.length;
  const now = new Date();
  await db.update(schema.deedRun).set({ correctCount, flawless, completedAt: now, updatedAt: now }).where(eq(schema.deedRun.id, runId));

  const deed = findDeed(run.deedId);
  const building = deed ? findBuilding(deed.buildingId) : null;
  let progress = { done: 0, total: building?.deedsToBuild ?? 0, complete: false };
  if (building) {
    // Insert-first, then an unconditional atomic increment: two completions of the
    // same building racing each other can't both read deedsDone=0 and both write 1,
    // losing a deed. The insert only ever seeds a fresh row (onConflictDoNothing),
    // so the +1 below always applies to whatever is already there.
    await db.insert(schema.kingdomProgress).values({
      id: nanoid(), childId: run.childId, buildingId: building.id, deedsDone: 0,
      completedAt: null, createdAt: now, updatedAt: now,
    }).onConflictDoNothing();
    await db.update(schema.kingdomProgress)
      .set({ deedsDone: sql`${schema.kingdomProgress.deedsDone} + 1`, updatedAt: now })
      .where(and(eq(schema.kingdomProgress.childId, run.childId), eq(schema.kingdomProgress.buildingId, building.id)));
    const rows = await db
      .select()
      .from(schema.kingdomProgress)
      .where(and(eq(schema.kingdomProgress.childId, run.childId), eq(schema.kingdomProgress.buildingId, building.id)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("Hero not found.");
    progress = buildingProgress(row.deedsDone, building);
    if (progress.complete && row.completedAt === null) {
      await db.update(schema.kingdomProgress)
        .set({ completedAt: now })
        .where(eq(schema.kingdomProgress.id, row.id));
    }
  }

  const masteryStart = JSON.parse(run.masteryStart) as Record<string, number>;
  const skillIds = JSON.parse(run.skillIds) as string[];
  const current = await loadMasteryRows(run.childId);
  const masteryChanges: string[] = [];
  for (const id of skillIds) {
    const skill = findSkill(id);
    const after = current.find((m) => m.skillId === id)?.level ?? 0;
    const copy = skill ? masteryChangeCopy(masteryStart[id] ?? 0, after, skill.label) : null;
    if (copy) masteryChanges.push(copy);
  }

  revalidatePath("/side-quests");
  revalidatePath("/spellbook");
  revalidatePath("/loot");
  return {
    correctCount, total: questions.length, flawless, masteryChanges,
    building: { label: building?.label ?? "the kingdom", ...progress },
  };
}
