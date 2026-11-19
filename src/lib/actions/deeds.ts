"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { isTaskCorrect, taskDefOf, type ResponseByKind, type Task, type TaskKind } from "@/lib/tasks/registry";
import { CHALLENGE, MAX_STARS, RUN_EFFECTS, countsTowardBuilding, runPoints, starsFor, type QuestionOutcome, type RunKind, type Stars } from "@/lib/utils/deed-scoring";
import { outcomeOf, refuseGiveUp, refuseRetry, statusOf, type QuestionStatus } from "@/lib/utils/deed-attempts";
import {
  ALREADY_ANSWERED, ANSWER_EVERY, ANSWER_FIRST, BUILD_HERO_ONLY, CHALLENGE_LOCKED, CHALLENGE_NOT_READY, CLOSED, FINISHED, HERO_ONLY, NONE_READY,
  NOT_IN_CHRONICLE, NOT_IN_RUN, NOT_THROUGH, PICK_SHOWN,
} from "@/lib/utils/deed-refusals";
import { overdueSkills } from "@/lib/utils/review-schedule";
import type { AttemptResult, RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { hintFor } from "@/lib/utils/skill-hints";
import { benchDemoAt, findOpenRun, insertRun, loadMasteryRows, loadRecentMisses, parseRun, resumedStart, type DeedRunRow } from "@/lib/services/deed-run-store";
import {
  buildingStars, gradeForDeed, loadDeedBest, loadHeroLevels, loadKingdomOverview, loadSiteState, siteTally, type BuildingOverview, type DeedBest,
} from "@/lib/services/deeds";
import { loadFocusSkillIds } from "@/lib/services/learning-focus";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadRealmSettings, paySideQuest } from "@/lib/services/realm-play";
import { finishBuild } from "@/lib/services/improvements";
import { loadMaterialLedger } from "@/lib/services/realm-materials";
import { IMPROVEMENTS, parsePlanRef, type ImprovementId } from "@/lib/realm/improvements";
import { MATERIAL_IDS, materialBalance, type MaterialId } from "@/lib/realm/materials";
import { NO_SIDE_QUEST_PAY, type SideQuestPay } from "@/lib/utils/side-quest-pay";
import { enabledHandsOnKinds } from "@/lib/utils/realm-settings";

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
  context: "page" | "realm" | "gate" = "page",
  options?: { challenge?: boolean },
): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  // `context` crosses the wire, so it is untrusted: anything but the two named worlds is the page.
  const ctx = context === "realm" || context === "gate" ? context : "page";
  const challenge = options?.challenge === true;
  // In the world, or on the gate's board, only the hero plays; a parent previewing the Realm reads
  // stories but never starts a run. A Crown Challenge is the hero's alone wherever it is asked from.
  if ((ctx === "realm" || ctx === "gate" || challenge) && !isChildActor(access)) throw new Error(HERO_ONLY);
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
  // So is the building's site, for the bench's drawing: only a side quest's own run raises it.
  const building = kind === "deed" ? findBuilding(deed.buildingId) : null;
  const [open, focusSkillIds, site] = await Promise.all([
    findOpenRun(and(eq(schema.deedRun.childId, childId), eq(schema.deedRun.deedId, deedId), eq(schema.deedRun.kind, kind))),
    loadFocusSkillIds(childId, hero.grades),
    building ? loadSiteState(childId, building) : Promise.resolve(null),
  ]);
  // The deed's OWN strand decides the grade — never a fixed one, and never another
  // strand's. `gradeForDeed` is where that is pinned by test. A focus skill in the deed's strand
  // a grade either side joins the candidates (`runCandidates`), so its pool is loaded too.
  const grade = gradeForDeed(hero, deed);
  // A young hero meets Aldo's worked example before their first bench task (R-C9), resumed or fresh.
  const withDemo = async (start: RunStart): Promise<RunStart> => {
    const at = await benchDemoAt(childId, grade, start);
    return at === null ? start : { ...start, demo: { at } };
  };
  if (open) return withDemo(resumedStart(open, { id: deed.id, title: deed.title, story, area: deed.area }, site ?? undefined));
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
    // The grown-up's switches decide which hands-on kinds a NEW run may draw (an open run is a
    // snapshot and never asks); the gate is multiple choice whatever they say (R-C4).
    enabledKinds: ctx === "gate" ? new Set<TaskKind>() : enabledHandsOnKinds(settings),
    ...(challenge
      ? { recentMisses: [], dueSkillIds: [], questionCount: CHALLENGE.questions, levelBoost: CHALLENGE.levelBoost }
      : { recentMisses, dueSkillIds, questionCount: settings.sideQuestLength }),
  });
  if (built.questions.length === 0) throw new Error(NONE_READY);
  // A crown is three right answers, never fewer: a thin pool at the higher rung waits.
  if (challenge && built.questions.length < CHALLENGE.questions) throw new Error(CHALLENGE_NOT_READY);

  const masteryStart: Record<string, number> = {};
  for (const id of built.skillIds) masteryStart[id] = masteryBySkill[id] ?? 0;
  const start = await insertRun({
    id: nanoid(), childId, deedId, skillIds: JSON.stringify(built.skillIds), band: bandForGrade(grade),
    masteryStart: JSON.stringify(masteryStart),
    // Snapshotted, so a grown-up changing the setting mid-run never changes this run's rules.
    kind, secondChances: RUN_EFFECTS[kind].allowsSecondChances && settings.secondChances,
  }, built.questions, { id: deed.id, title: deed.title, story, area: deed.area });
  // A fresh run has laid nothing yet.
  return withDemo(site ? { ...start, site: { ...site, placed: 0 } } : start);
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
function resultFor(question: Task, status: QuestionStatus, firstPick?: string, rightPick?: string): AttemptResult {
  if (status === "unanswered") throw new Error(ANSWER_FIRST);
  if (status === "open") return { correct: false, secondChance: true, hint: hintFor(question.skillId), firstPick };
  const correct = status === "right-first" || status === "right-second";
  const def = taskDefOf(question);
  const result: AttemptResult = { correct, secondChance: false, answer: def.answerText(question) };
  // The notation behind a hands-on task is the reward for solving it: sent on a right answer only (R-C8),
  // and built from what the child did (`rightPick`, the stored response that solved it).
  const solved = correct && rightPick !== undefined ? def.decode(rightPick) : null;
  if (solved !== null && def.bridge) result.bridge = def.bridge(question, solved);
  if (question.explain) result.explain = question.explain;
  else if (!correct) result.hint = hintFor(question.skillId);
  return result;
}

/** The kind's coded note on a response, only when it has one: `none` is left off the result. */
function feedbackOf(question: Task, parsed: ResponseByKind[TaskKind]): Pick<AttemptResult, "feedback"> {
  const code = taskDefOf(question).feedback(question, parsed);
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
    const def = taskDefOf(question);
    const parsed = def.parseResponse(response, question);
    if (parsed === null) throw new Error(PICK_SHOWN);
    const answer = def.encode(parsed);
    // A repeat answer to the same question (double tap, or the loser of a race) is not re-graded:
    // it hears what was stored. While a second chance is open that is still only a hint, and the
    // stored answer's note (which way a length is off); once resolved, the resolution alone.
    if (attempt.first !== null) {
      const status = statusOf(question, attempt, allows);
      const result = resultFor(question, status, attempt.first, status === "right-first" ? attempt.first : (attempt.second ?? undefined));
      const storedFirst = status === "open" ? def.decode(attempt.first) : null;
      return storedFirst !== null ? { ...result, ...feedbackOf(question, storedFirst) } : result;
    }
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
    return { ...resultFor(question, statusOf(question, { first: answer, second: null }, allows), answer, answer), ...moved, ...feedbackOf(question, parsed) };
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
  const def = taskDefOf(question);
  const parsed = def.parseResponse(response, question);
  if (parsed === null) throw new Error(PICK_SHOWN);
  const answer = def.encode(parsed);
  await writeSecondTry(run, secondTries, questions.length, index, answer);
  return { ...resultFor(question, statusOf(question, { ...attempt, second: answer }, allows), undefined, answer), ...feedbackOf(question, parsed) };
}

/** "Show me": closes an open second chance as a miss. Safe to answer, because the try is spent. */
export async function resolveDeedQuestion(runId: string, index: number): Promise<AttemptResult> {
  const { run, questions, secondTries, question, attempt, allows } = await loadAttemptState(runId, index);
  const refusal = refuseGiveUp(question, attempt, allows);
  if (refusal) throw new Error(refusal);
  await writeSecondTry(run, secondTries, questions.length, index, "");
  return resultFor(question, "missed");
}

/**
 * Who raised a building, read as it rises: the hero's own name (never a grown-up's) and their open
 * season. Each read is best effort and alone: a failure leaves that one null and the building rises
 * anyway (D13.7). A hero with no grade has no open season, which is null too.
 */
async function raisedRecord(childId: string): Promise<{ raisedByName: string | null; raisedSeasonId: string | null }> {
  const [name, season] = await Promise.all([
    db.select({ displayName: schema.child.displayName }).from(schema.child).where(eq(schema.child.id, childId)).limit(1)
      .then((rows) => rows[0]?.displayName ?? null)
      .catch((err: unknown) => {
        console.error("Raised-by name failed to load", err);
        return null;
      }),
    db.select({ id: schema.season.id }).from(schema.season)
      .where(and(eq(schema.season.childId, childId), isNull(schema.season.completedAt)))
      .orderBy(desc(schema.season.ordinal))
      .limit(1)
      .then((rows) => rows[0]?.id ?? null)
      .catch((err: unknown) => {
        console.error("Raised-by season failed to load", err);
        return null;
      }),
  ]);
  return { raisedByName: name, raisedSeasonId: season };
}

/**
 * Counts the run at its site and reads where the building stands, raising it the first time its
 * stories are all done (D13). `countsRun` is a side quest's own run: every one finished counts in the
 * site's lifetime runs (`deeds_done`, display only), stars or none. Progress is read from the stories'
 * bests AFTER this run's own write, so this run's story counts, and of two stories finishing the
 * building at once the later read sees both. `bestBefore` excludes this run: it says whether the
 * building already stood, so the run was practice.
 */
async function buildingAfter(
  childId: string, building: Building, countsRun: boolean, bestBefore: readonly DeedBest[], now: Date,
): Promise<{ progress: { done: number; total: number; complete: boolean; practice: boolean }; bestNow: DeedBest[] }> {
  const where = and(eq(schema.kingdomProgress.childId, childId), eq(schema.kingdomProgress.buildingId, building.id));
  if (countsRun) {
    // Insert-first, then an unconditional atomic increment: two completions of the
    // same building racing each other can't both read deedsDone=0 and both write 1,
    // losing a run. The insert only ever seeds a fresh row (onConflictDoNothing),
    // so the +1 below always applies to whatever is already there.
    await db.insert(schema.kingdomProgress).values({
      id: nanoid(), childId, buildingId: building.id, deedsDone: 0,
      completedAt: null, createdAt: now, updatedAt: now,
    }).onConflictDoNothing();
    await db.update(schema.kingdomProgress)
      .set({ deedsDone: sql`${schema.kingdomProgress.deedsDone} + 1`, updatedAt: now })
      .where(where);
  }
  const [rows, bestNow] = await Promise.all([
    db.select().from(schema.kingdomProgress).where(where).limit(1),
    loadDeedBest(childId),
  ]);
  const row = rows[0];
  const practice = buildingProgress(siteTally(building.id, row, bestBefore), building).complete;
  const progress = buildingProgress(siteTally(building.id, row, bestNow), building);
  if (row && progress.complete && row.completedAt === null) {
    const record = await raisedRecord(childId);
    // Raised once: of two finishes racing here, only the first write lands, so one name is written.
    await db.update(schema.kingdomProgress)
      .set({ completedAt: now, ...record, updatedAt: now })
      .where(and(eq(schema.kingdomProgress.id, row.id), isNull(schema.kingdomProgress.completedAt)));
  }
  return { progress: { ...progress, practice }, bestNow };
}

export async function completeDeedRun(runId: string): Promise<RunSummary> {
  const { run, access } = await loadRun(runId);
  if (run.completedAt) throw new Error(FINISHED);
  const { questions, statuses } = parseRun(run);
  // An open second chance blocks finishing exactly as an unanswered question does.
  const outcomes = statuses.map(outcomeOf).filter((o): o is QuestionOutcome => o !== null);
  if (outcomes.length !== questions.length) throw new Error(ANSWER_EVERY);
  // Building spends the hero's materials, so only the hero finishes a build run; refused before anything is written.
  if (run.kind === "build" && !isChildActor(access)) throw new Error(BUILD_HERO_ONLY);
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
  // Only the hero's own run pays play minutes (spec 2026-11-09 §2a), and only a run kind that pays them (`paysMinutes`).
  // Paid now, after the win, and finished before the building is raised: SQLite has one write
  // lock, so the pay's transaction and the building's write must not overlap (`payForRun` never rejects).
  const pay = effects.paysMinutes && stars > 0 && isChildActor(access) ? await payForRun(run.childId, runId, stars) : NO_SIDE_QUEST_PAY;

  // A build run spends and builds only now that it is closed, and after any pay (a build pays none).
  const improvement = run.kind === "build" ? await finishBuildRun(run.childId, run.sourceRef, stars, now) : undefined;

  const counted = effects.raisesBuilding && countsTowardBuilding(stars);
  const deed = run.deedId ? findDeed(run.deedId) : null;
  const building = deed ? findBuilding(deed.buildingId) : null;
  // A challenge earns no stars, so it cannot move a best; a deed can only raise it.
  const deedBest = Math.max(previousBest, stars) as Stars;
  // Every side-quest run finished counts at its site, stars or none; a challenge counts none.
  const site = building ? await buildingAfter(run.childId, building, effects.raisesBuilding, bestBefore, now) : null;
  const progress = site?.progress ?? { done: 0, total: 0, complete: false, practice: false };
  const buildingStarsNow = building && site ? buildingStars(building.id, site.bestNow) : { stars: 0, maxStars: 0 };

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
    ...(improvement ? { improvement } : {}),
  };
}

/**
 * The build hook of `completeDeedRun`: the run is already closed, so whatever goes wrong here must
 * not fail the finish. Any throw reads as "error" (nothing was spent: `finishBuild` is one
 * transaction), with the balance from a fresh read, or zeros if that fails too.
 */
async function finishBuildRun(childId: string, sourceRef: string | null, stars: number, now: Date): Promise<NonNullable<RunSummary["improvement"]>> {
  const ref = parsePlanRef(sourceRef ?? "");
  // A ref that does not parse (it cannot, from `startBuildRun`) still gets a plan's shape in the summary.
  const head = ref
    ? { id: ref.improvementId, label: IMPROVEMENTS[ref.improvementId].label, level: ref.level }
    : { id: "" as ImprovementId, label: "the plan", level: 1 };
  const stopped = async (): Promise<NonNullable<RunSummary["improvement"]>> => {
    let balance = Object.fromEntries(MATERIAL_IDS.map((id) => [id, 0])) as Record<MaterialId, number>;
    try {
      balance = materialBalance(await loadMaterialLedger(childId));
    } catch {
      // The zeros stand: the summary still tells the hero nothing was spent.
    }
    return { ...head, built: false, reason: "error", balance };
  };
  if (!ref) return stopped();
  try {
    return await finishBuild(childId, ref, stars, now);
  } catch (err) {
    console.error("finishing a build failed", { childId, sourceRef, err });
    return stopped();
  }
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
