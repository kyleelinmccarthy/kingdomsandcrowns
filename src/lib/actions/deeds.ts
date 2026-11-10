"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess, type FamilyAccess } from "@/lib/auth/access";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { BAND_LABELS, type ContentBand } from "@/lib/utils/content-bands";
import { bandForGrade } from "@/lib/utils/grade-levels";
import { findSkill, type SkillArea } from "@/lib/utils/skills";
import { buildingProgress, findBuilding, type Building } from "@/lib/utils/kingdom";
import { deedStory, findDeed } from "@/lib/utils/deeds";
import {
  buildDeedRun,
  runCandidates,
  type PoolItem,
} from "@/lib/utils/deed-engine";
import { masteryChangeCopy, masteryLabel, parseRecentResults, progressToNextRung, recordResult } from "@/lib/utils/mastery";
import type { Question } from "@/lib/utils/drill-generators";
import { isTaskCorrect, kindOf, taskDef, type ResponseByKind, type Task, type TaskKind } from "@/lib/tasks/registry";
import { CHALLENGE, MAX_STARS, RUN_EFFECTS, countsTowardBuilding, runPoints, starsFor, type QuestionOutcome, type RunKind, type Stars } from "@/lib/utils/deed-scoring";
import { outcomeOf, refuseGiveUp, refuseRetry, statusOf, type QuestionStatus } from "@/lib/utils/deed-attempts";
import {
  ALREADY_ANSWERED, ANSWER_EVERY, ANSWER_FIRST, CHALLENGE_LOCKED, CHALLENGE_NOT_READY, CLOSED, FINISHED, HERO_ONLY, NONE_READY,
  NOT_IN_CHRONICLE, NOT_IN_RUN, NOT_THROUGH, PICK_SHOWN,
} from "@/lib/utils/deed-refusals";
import { overdueSkills } from "@/lib/utils/review-schedule";
import type { AttemptResult, RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { hintFor } from "@/lib/utils/skill-hints";
import { findOpenRun, insertRun, loadMasteryRows, loadRecentMisses, parseRun, resumedStart, type DeedRunRow } from "@/lib/services/deed-run-store";
import { buildingStars, gradeForDeed, loadDeedBest, loadHeroLevels, loadKingdomOverview, type BuildingOverview } from "@/lib/services/deeds";
import { loadFocusSkillIds } from "@/lib/services/learning-focus";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadRealmSettings, paySideQuest } from "@/lib/services/realm-play";
import { NO_SIDE_QUEST_PAY, type SideQuestPay } from "@/lib/utils/side-quest-pay";

export type MasteryRow = { skillId: string; label: string; area: SkillArea; level: number; levelLabel: string; lastPracticedAt: string | null };
export type DeedsOverview = {
  enabled: boolean; band: ContentBand; bandLabel: string; tone: "gentle" | "monsters";
  buildings: BuildingOverview[]; mastery: MasteryRow[];
};

function masteryRow(row: typeof schema.skillMastery.$inferSelect): MasteryRow | null {
  const skill = findSkill(row.skillId);
  if (!skill) return null;
  return {
    skillId: row.skillId, label: skill.label, area: skill.area, level: row.level,
    levelLabel: masteryLabel(row.level), lastPracticedAt: row.lastPracticedAt ? row.lastPracticedAt.toISOString() : null,
  };
}

/** A hero may see their own deeds; a closed Realm shows as such rather than throwing. */
export async function getDeedsOverview(childId: string): Promise<DeedsOverview> {
  await requireChildAccess(childId);
  const [kingdom, mastery] = await Promise.all([loadKingdomOverview(childId), loadMasteryRows(childId)]);
  return {
    // The page's one coarse label still describes the hero themselves, not any one
    // strand's gap; the per-strand grades reach the engine, not this header.
    enabled: kingdom.enabled, band: kingdom.band, bandLabel: BAND_LABELS[kingdom.band], tone: kingdom.tone,
    buildings: kingdom.buildings, mastery: mastery.map(masteryRow).filter((m): m is MasteryRow => m !== null),
  };
}

export async function getMasteryOverview(childId: string): Promise<MasteryRow[]> {
  await requireChildAccess(childId);
  return (await loadMasteryRows(childId)).map(masteryRow).filter((m): m is MasteryRow => m !== null);
}

export async function startDeedRun(
  childId: string,
  deedId: string,
  context: "page" | "realm" = "page",
  options?: { challenge?: boolean },
): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  const challenge = options?.challenge === true;
  // In the world, only the hero plays; a parent previewing the Realm reads stories but never
  // starts a run. A Crown Challenge is the hero's alone wherever it is asked from.
  if ((context === "realm" || challenge) && !isChildActor(access)) throw new Error(HERO_ONLY);
  const kind: RunKind = challenge ? "challenge" : "deed";
  const deed = findDeed(deedId);
  if (!deed) throw new Error(NOT_IN_CHRONICLE);
  const hero = await loadHeroLevels(childId);
  if (!hero.enabled) throw new Error(CLOSED);
  if (challenge) {
    const best = (await loadDeedBest(childId)).find((b) => b.deedId === deedId)?.bestStars ?? 0;
    if (best < MAX_STARS) throw new Error(CHALLENGE_LOCKED);
  }
  const story = deedStory(deed, hero.tone);

  // The focus picks are read alongside the open-run check: which pools to load depends on them.
  const [open, focusSkillIds] = await Promise.all([
    findOpenRun(and(eq(schema.deedRun.childId, childId), eq(schema.deedRun.deedId, deedId), eq(schema.deedRun.kind, kind))),
    loadFocusSkillIds(childId, hero.grades),
  ]);
  if (open) return resumedStart(open, { id: deed.id, title: deed.title, story, area: deed.area });

  // The deed's OWN strand decides the grade — never a fixed one, and never another
  // strand's. `gradeForDeed` is where that is pinned by test. A focus skill in the deed's strand
  // a grade either side joins the candidates (`runCandidates`), so its pool is loaded too.
  const grade = gradeForDeed(hero, deed);
  const skills = runCandidates(deed, grade, focusSkillIds);
  const poolSkillIds = skills.filter((s) => s.source.kind === "pool").map((s) => s.id);
  const [profileRow, masteryRows, poolRows, recentMisses, settings] = await Promise.all([
    // Memoized per request, so this is the same round trip loadHeroLevels just made.
    loadLearningProfileRow(childId),
    loadMasteryRows(childId),
    poolSkillIds.length > 0
      ? db.select().from(schema.drillItem).where(inArray(schema.drillItem.skillId, poolSkillIds))
      : Promise.resolve([] as (typeof schema.drillItem.$inferSelect)[]),
    // A challenge mixes nothing in, so it needs no misses.
    challenge ? Promise.resolve([] as Question[]) : loadRecentMisses(childId),
    loadRealmSettings(childId),
  ]);
  const profile = profileFromRow(profileRow);
  const masteryBySkill: Record<string, number> = {};
  // When each skill was last practised rides along on the rows already fetched above, so the
  // recency half of the selection weighting costs no extra query.
  const lastPracticedBySkill: Record<string, number | null> = {};
  for (const m of masteryRows) {
    masteryBySkill[m.skillId] = m.level;
    lastPracticedBySkill[m.skillId] = m.lastPracticedAt ? m.lastPracticedAt.getTime() : null;
  }
  const poolItems: PoolItem[] = poolRows.map((r) => ({
    id: r.id, skillId: r.skillId, prompt: r.prompt, answer: r.answer,
    distractors: JSON.parse(r.distractors) as string[], readAloud: r.readAloud, level: r.level,
  }));

  // Every skill this deed can serve that has rested past its interval, uncapped: which skills
  // the run itself practises is chosen inside buildDeedRun, which drops those and then caps.
  const dueSkillIds = overdueSkills(
    masteryRows.map((m) => ({ skillId: m.skillId, level: m.level, lastPracticedAt: lastPracticedBySkill[m.skillId] })),
    skills.map((s) => s.id), Date.now(),
  );
  const built = buildDeedRun({
    deed, grade, masteryBySkill, lastPracticedBySkill, profile, seed: Date.now() >>> 0, poolItems, focusSkillIds,
    ...(challenge
      ? { recentMisses: [], dueSkillIds: [], questionCount: CHALLENGE.questions, levelBoost: CHALLENGE.levelBoost }
      : { recentMisses, dueSkillIds, questionCount: settings.sideQuestLength }),
  });
  if (built.questions.length === 0) throw new Error(NONE_READY);
  // A crown is three right answers, never fewer: a thin pool at the higher rung waits.
  if (challenge && built.questions.length < CHALLENGE.questions) throw new Error(CHALLENGE_NOT_READY);

  const masteryStart: Record<string, number> = {};
  for (const id of built.skillIds) masteryStart[id] = masteryBySkill[id] ?? 0;
  return insertRun({
    id: nanoid(), childId, deedId, skillIds: JSON.stringify(built.skillIds), band: bandForGrade(grade),
    masteryStart: JSON.stringify(masteryStart),
    // Snapshotted, so a grown-up changing the setting mid-run never changes this run's rules.
    kind, secondChances: RUN_EFFECTS[kind].allowsSecondChances && settings.secondChances,
  }, built.questions, { id: deed.id, title: deed.title, story, area: deed.area });
}

/** A stored run, once the caller may act for its hero, and who the caller is. */
async function loadRun(runId: string): Promise<{ run: DeedRunRow; access: FamilyAccess }> {
  const rows = await db.select().from(schema.deedRun).where(eq(schema.deedRun.id, runId)).limit(1);
  if (!rows[0]) throw new Error(NOT_IN_CHRONICLE);
  const { access } = await requireChildAccess(rows[0].childId, { write: true });
  return { run: rows[0], access };
}

/** An open run and one question of it, with every guard every attempt action shares. */
async function loadAttemptState(runId: string, index: number) {
  const { run } = await loadRun(runId);
  if (run.completedAt) throw new Error(FINISHED);
  const state = parseRun(run);
  if (!Number.isInteger(index) || index < 0 || index >= state.questions.length) {
    throw new Error(NOT_IN_RUN);
  }
  return { run, ...state, question: state.questions[index], attempt: state.attempts[index] };
}

/**
 * What the browser may know about a question in this state: the answer only once it is resolved.
 * An open second chance echoes the stored first pick, so a late repeat rules out what was stored.
 */
function resultFor(question: Task, status: QuestionStatus, firstPick?: string): AttemptResult {
  if (status === "unanswered") throw new Error(ANSWER_FIRST);
  if (status === "open") return { correct: false, secondChance: true, hint: hintFor(question.skillId), firstPick };
  const correct = status === "right-first" || status === "right-second";
  const result: AttemptResult = { correct, secondChance: false, answer: taskDef(kindOf(question)).answerText(question) };
  if (question.explain) result.explain = question.explain;
  else if (!correct) result.hint = hintFor(question.skillId);
  return result;
}

/** The kind's coded note on a response, only when it has one: `none` is left off the result. */
function feedbackOf(question: Task, parsed: ResponseByKind[TaskKind]): Pick<AttemptResult, "feedback"> {
  const code = taskDef(kindOf(question)).feedback(question, parsed);
  return code === "none" ? {} : { feedback: code };
}

/**
 * Mastery reads the first try only, and moves on every answer rather than at the end, so an
 * abandoned run still taught something. Insert-first (same pattern as loadRealmSettings): the
 * row always exists before we read it, so two first answers to one skill racing each other
 * can't both see "no row" and both fall into an insert — one insert wins, onConflictDoNothing
 * no-ops the other, and both then land on the same unconditional update below.
 * Returns what the child may see of it right away: the skill's meter, and a promotion.
 */
async function recordFirstTry(childId: string, skillId: string, correct: boolean, now: Date): Promise<Pick<AttemptResult, "meter" | "rungChange">> {
  await db.insert(schema.skillMastery).values({
    id: nanoid(), childId, skillId, level: 0,
    recentResults: "[]", correctTotal: 0, attemptTotal: 0,
    lastPracticedAt: null, createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  const existing = await db
    .select()
    .from(schema.skillMastery)
    .where(and(eq(schema.skillMastery.childId, childId), eq(schema.skillMastery.skillId, skillId)))
    .limit(1);
  const before = { level: existing[0]?.level ?? 0, recentResults: parseRecentResults(existing[0]?.recentResults ?? null) };
  const state = recordResult(before, correct);
  await db.update(schema.skillMastery).set({
    level: state.level, recentResults: JSON.stringify(state.recentResults),
    correctTotal: (existing[0]?.correctTotal ?? 0) + (correct ? 1 : 0), attemptTotal: (existing[0]?.attemptTotal ?? 0) + 1,
    lastPracticedAt: now, updatedAt: now,
  }).where(and(eq(schema.skillMastery.childId, childId), eq(schema.skillMastery.skillId, skillId)));
  const skillLabel = findSkill(skillId)?.label;
  const progress = progressToNextRung(state);
  return {
    meter: skillLabel && progress ? { skillLabel, ...progress } : null,
    rungChange: skillLabel && state.level > before.level ? `${skillLabel}: getting stronger!` : null,
  };
}

// Bounds the re-read loop below; only answers racing on other questions of the same run retry.
const ANSWER_WRITE_TRIES = 5;

/**
 * `response` is untrusted: the task's kind parses it before anything is written, and a response
 * that is not well formed for the task is refused with nothing stored and no mastery moved.
 */
export async function answerDeedQuestion(runId: string, index: number, response: unknown): Promise<AttemptResult> {
  for (let tries = 0; tries < ANSWER_WRITE_TRIES; tries++) {
    const { run, questions, responses, question, attempt, allows } = await loadAttemptState(runId, index);
    const def = taskDef(kindOf(question));
    const parsed = def.parseResponse(response, question);
    if (parsed === null) throw new Error(PICK_SHOWN);
    const answer = def.encode(parsed);
    // A repeat answer to the same question (double tap, or the loser of a race) is not re-graded:
    // it hears what was stored, and while a second chance is open that is still only a hint.
    if (attempt.first !== null) return resultFor(question, statusOf(question, attempt, allows), attempt.first);
    const next = questions.map((_, i) => responses[i] ?? null);
    next[index] = answer;
    const correctCount = questions.filter((q, i) => next[i] !== null && isTaskCorrect(q, next[i]!)).length;
    const now = new Date();
    // Conditional on the stored responses being the ones just read, so two first answers can
    // never both land; a call that loses re-reads, and either hears the winner or reapplies.
    const written = await db
      .update(schema.deedRun)
      .set({ responses: JSON.stringify(next), correctCount, updatedAt: now })
      .where(and(eq(schema.deedRun.id, runId), eq(schema.deedRun.responses, run.responses), isNull(schema.deedRun.completedAt)))
      .returning({ id: schema.deedRun.id });
    if (written.length === 0) continue;
    const correct = isTaskCorrect(question, answer);
    const moved = RUN_EFFECTS[run.kind].movesMastery ? await recordFirstTry(run.childId, question.skillId, correct, now) : {};
    return { ...resultFor(question, statusOf(question, { first: answer, second: null }, allows), answer), ...moved, ...feedbackOf(question, parsed) };
  }
  throw new Error(NOT_THROUGH);
}

/**
 * The one write of a second try (a retry, or "" for a give-up). Conditional on the stored list
 * being the one just read, so of two calls racing for one question only the first lands.
 */
async function writeSecondTry(run: DeedRunRow, secondTries: (string | null)[], questionCount: number, index: number, value: string) {
  const next = Array.from({ length: questionCount }, (_, i) => secondTries[i] ?? null);
  next[index] = value;
  const written = await db
    .update(schema.deedRun)
    .set({ secondTries: JSON.stringify(next), updatedAt: new Date() })
    .where(and(eq(schema.deedRun.id, run.id), eq(schema.deedRun.secondTries, run.secondTries), isNull(schema.deedRun.completedAt)))
    .returning({ id: schema.deedRun.id });
  if (written.length === 0) throw new Error(ALREADY_ANSWERED);
}

export async function retryDeedQuestion(runId: string, index: number, response: unknown): Promise<AttemptResult> {
  const { run, questions, secondTries, question, attempt, allows } = await loadAttemptState(runId, index);
  // `refuseRetry` parses `response` with the task's kind (PICK_SHOWN when it is not well formed), before any write.
  const refusal = refuseRetry(question, attempt, allows, response);
  if (refusal) throw new Error(refusal);
  const def = taskDef(kindOf(question));
  const parsed = def.parseResponse(response, question);
  if (parsed === null) throw new Error(PICK_SHOWN);
  const answer = def.encode(parsed);
  await writeSecondTry(run, secondTries, questions.length, index, answer);
  return { ...resultFor(question, statusOf(question, { ...attempt, second: answer }, allows)), ...feedbackOf(question, parsed) };
}

/** "Show me": closes an open second chance as a miss. Safe to answer, because the try is spent. */
export async function resolveDeedQuestion(runId: string, index: number): Promise<AttemptResult> {
  const { run, questions, secondTries, question, attempt, allows } = await loadAttemptState(runId, index);
  const refusal = refuseGiveUp(question, attempt, allows);
  if (refusal) throw new Error(refusal);
  await writeSecondTry(run, secondTries, questions.length, index, "");
  return resultFor(question, "missed");
}

/** Raises the building when the run counts, and reads where it stands either way. */
async function buildingAfter(childId: string, building: Building, counted: boolean, now: Date) {
  if (counted) {
    // Insert-first, then an unconditional atomic increment: two completions of the
    // same building racing each other can't both read deedsDone=0 and both write 1,
    // losing a deed. The insert only ever seeds a fresh row (onConflictDoNothing),
    // so the +1 below always applies to whatever is already there.
    await db.insert(schema.kingdomProgress).values({
      id: nanoid(), childId, buildingId: building.id, deedsDone: 0,
      completedAt: null, createdAt: now, updatedAt: now,
    }).onConflictDoNothing();
    await db.update(schema.kingdomProgress)
      .set({ deedsDone: sql`${schema.kingdomProgress.deedsDone} + 1`, updatedAt: now })
      .where(and(eq(schema.kingdomProgress.childId, childId), eq(schema.kingdomProgress.buildingId, building.id)));
  }
  const [row] = await db
    .select()
    .from(schema.kingdomProgress)
    .where(and(eq(schema.kingdomProgress.childId, childId), eq(schema.kingdomProgress.buildingId, building.id)))
    .limit(1);
  const progress = buildingProgress(row?.deedsDone ?? 0, building);
  if (row && progress.complete && row.completedAt === null) {
    await db.update(schema.kingdomProgress).set({ completedAt: now }).where(eq(schema.kingdomProgress.id, row.id));
  }
  return progress;
}

export async function completeDeedRun(runId: string): Promise<RunSummary> {
  const { run, access } = await loadRun(runId);
  if (run.completedAt) throw new Error(FINISHED);
  const { questions, statuses } = parseRun(run);
  // An open second chance blocks finishing exactly as an unanswered question does.
  const outcomes = statuses.map(outcomeOf).filter((o): o is QuestionOutcome => o !== null);
  if (outcomes.length !== questions.length) throw new Error(ANSWER_EVERY);
  const effects = RUN_EFFECTS[run.kind];
  const correctCount = statuses.filter((s) => s === "right-first").length;
  const flawless = correctCount === questions.length;
  const { points, max: maxPoints } = runPoints(outcomes);
  const stars: Stars = effects.earnsStars ? starsFor(points, maxPoints) : 0;
  // Read before this run's stars are written, so a new best is never measured against itself. A
  // run of no deed (a review) has no best and no building to measure, so nothing is read for it.
  const bestBefore = run.deedId === null ? [] : await loadDeedBest(run.childId);
  const before = bestBefore.find((b) => b.deedId === run.deedId);
  const previousBest = before?.bestStars ?? 0;
  // Mirrors `loadDeedBest`'s crown: a finished challenge with every question right first time.
  const crowned = (before?.crowned ?? false) || (run.kind === "challenge" && flawless);
  const now = new Date();
  const finished = await db
    .update(schema.deedRun)
    .set({ correctCount, flawless, stars, completedAt: now, updatedAt: now })
    .where(and(eq(schema.deedRun.id, runId), isNull(schema.deedRun.completedAt)))
    .returning({ id: schema.deedRun.id });
  // Two finishes racing: only the one that closed the run may raise the building, or be paid.
  if (finished.length === 0) throw new Error(FINISHED);
  // Only the hero's own run pays play minutes (spec 2026-11-09 §2a); a challenge earns no stars.
  // Paid now, after the win, and finished before the building is raised: SQLite has one write
  // lock, so the pay's transaction and the building's write must not overlap (`payForRun` never rejects).
  const pay = effects.earnsStars && stars > 0 && isChildActor(access) ? await payForRun(run.childId, runId, stars) : NO_SIDE_QUEST_PAY;

  const counted = effects.raisesBuilding && countsTowardBuilding(stars);
  const deed = run.deedId ? findDeed(run.deedId) : null;
  const building = deed ? findBuilding(deed.buildingId) : null;
  const progress = building ? await buildingAfter(run.childId, building, counted, now) : { done: 0, total: 0, complete: false };

  // A challenge earns no stars, so it cannot move a best; a deed can only raise it.
  const deedBest = Math.max(previousBest, stars) as Stars;
  const bestAfter = [...bestBefore.filter((b) => b.deedId !== run.deedId), ...(run.deedId ? [{ deedId: run.deedId, bestStars: deedBest }] : [])];
  const buildingStarsNow = building ? buildingStars(building.id, bestAfter) : { stars: 0, maxStars: 0 };

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
    correctCount, total: questions.length, flawless, masteryChanges, stars, previousBest, deedBest, counted, crowned, kind: run.kind,
    // A run owned by no side quest (a review) raises nothing, so it has no building to show.
    building: run.deedId ? { label: building?.label ?? "the kingdom", ...progress, ...buildingStarsNow } : null,
    minutesEarned: pay.minutes, sideQuestPayFull: pay.full,
  };
}

/**
 * The run is already finished when this runs, so a failed minute write must not fail the finish:
 * the child still sees their stars. Nothing retries it today, so a failure costs that run's
 * minutes; the write is once per run, so a retry added later could safely pay them.
 */
async function payForRun(childId: string, runId: string, stars: number): Promise<SideQuestPay> {
  try {
    return await paySideQuest(childId, runId, stars);
  } catch (err) {
    console.error("side-quest pay failed", { runId, err });
    return NO_SIDE_QUEST_PAY;
  }
}
