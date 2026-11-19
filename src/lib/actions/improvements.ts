"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { IMPROVEMENTS, planRef, planState, type ImprovementId } from "@/lib/realm/improvements";
import { buildBuildRun } from "@/lib/utils/build-run";
import { RUN_EFFECTS } from "@/lib/utils/deed-scoring";
import { BUILD_HERO_ONLY, CLOSED, DELIVERY_HERO_ONLY, NONE_READY, PIN_HERO_ONLY, PLAN_NOT_READY, RISE_HERO_ONLY } from "@/lib/utils/deed-refusals";
import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
import { bandForGrade } from "@/lib/utils/grade-levels";
import { enabledHandsOnKinds } from "@/lib/utils/realm-settings";
import { profileFromRow } from "@/lib/utils/learning-profile";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { benchDemoAt, findOpenRun, insertRun, loadMasteryRows, resumedStart } from "@/lib/services/deed-run-store";
import { loadHeroLevels } from "@/lib/services/deeds";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { advanceDeliverySeen, loadPlanInput, setPinnedPlan } from "@/lib/services/realm-materials";
import { announceBuildings } from "@/lib/services/realm-rises";

/** What Aldo says at the bench: one short line for the build run's header. */
const BUILD_AREA = "math" as const;
const BUILD_STORY = "Aldo has the plans ready. Measure true and it will stand.";

/**
 * Starts the next level of a plan as a build run: three tasks at the bench (`buildBuildRun`), for the
 * hero alone. It writes only the run. Completing it, which spends materials and writes the level, is
 * the build hook's (`completeDeedRun`); starting never reserves or spends anything, so an abandoned
 * run costs the hero nothing.
 */
export async function startBuildRun(childId: string, improvementId: string): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  // Building happens in the Realm, and only the hero plays there; a parent previewing never builds.
  if (!isChildActor(access)) throw new Error(BUILD_HERO_ONLY);
  const hero = await loadHeroLevels(childId);
  if (!hero.enabled) throw new Error(CLOSED);
  // `improvementId` crosses the network: only a catalog id gets as far as the ledger.
  if (typeof improvementId !== "string" || !Object.hasOwn(IMPROVEMENTS, improvementId)) throw new Error(PLAN_NOT_READY);
  const id = improvementId as ImprovementId;
  // The level on offer must be affordable and its building raised, judged from the hero's own rows.
  const status = planState(await loadPlanInput(childId)).find((p) => p.id === id);
  if (!status || status.state !== "ready") throw new Error(PLAN_NOT_READY);
  const plan = { improvementId: id, level: status.level };
  const sourceRef = planRef(id, status.level);
  const header: RunStart["deed"] = { id: `build:${sourceRef}`, title: IMPROVEMENTS[id].label, story: BUILD_STORY, area: BUILD_AREA };

  // The bench has content for math alone, so a build run is the hero's math grade, reached through its strand key, as `gradeForDeed` does.
  const grade = hero.grades[BUILD_AREA];
  // A young hero meets Aldo's worked example before their first bench task (R-C9), resumed or fresh.
  const withDemo = async (start: RunStart): Promise<RunStart> => {
    const at = await benchDemoAt(childId, grade, start);
    return at === null ? start : { ...start, demo: { at } };
  };
  const open = await findOpenRun(and(
    eq(schema.deedRun.childId, childId), eq(schema.deedRun.kind, "build"), eq(schema.deedRun.sourceRef, sourceRef),
  ));
  if (open) return withDemo(resumedStart(open, header, undefined, plan));

  const [masteryRows, settings, profileRow] = await Promise.all([
    loadMasteryRows(childId), loadRealmSettings(childId),
    // Memoized per request: the same round trip loadHeroLevels just made.
    loadLearningProfileRow(childId),
  ]);
  const masteryBySkill: Record<string, number> = {};
  for (const m of masteryRows) masteryBySkill[m.skillId] = m.level;
  const built = buildBuildRun({
    grade, masteryBySkill, seed: Date.now() >>> 0,
    // The grown-up's switches decide which hands-on kinds a NEW run may draw; off means choice.
    enabledKinds: enabledHandsOnKinds(settings), profile: profileFromRow(profileRow),
  });
  if (built.questions.length === 0) throw new Error(NONE_READY);

  const masteryStart: Record<string, number> = {};
  for (const skillId of built.skillIds) masteryStart[skillId] = masteryBySkill[skillId] ?? 0;
  const start = await insertRun({
    id: nanoid(), childId, deedId: null, sourceRef, skillIds: JSON.stringify(built.skillIds), band: bandForGrade(grade),
    masteryStart: JSON.stringify(masteryStart),
    // Snapshotted, so a grown-up changing the setting mid-run never changes this run's rules.
    kind: "build", secondChances: RUN_EFFECTS.build.allowsSecondChances && settings.secondChances,
  }, built.questions, header);
  // A fresh run has laid nothing yet.
  return withDemo({ ...start, plan: { ...plan, placed: 0 } });
}

/** The most buildings one call may mark: the kingdom has eight. */
const MAX_ANNOUNCED = BUILDINGS.length;

/**
 * The world has shown these buildings rising, so they never rise again (D13.6): stamps `announced_at`
 * on the hero's own raised-and-unannounced rows among `ids`. The hero's Realm is the only caller; the
 * Side Quests page never marks, and a grown-up previewing is refused so they cannot use up the
 * moment. `ids` crosses the network, so it is checked whole before anything is written.
 */
export async function markBuildingsAnnounced(childId: string, ids: unknown): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error(RISE_HERO_ONLY);
  if (!Array.isArray(ids) || ids.length > MAX_ANNOUNCED || !ids.every((id) => typeof id === "string" && findBuilding(id))) {
    throw new Error("That is not a building.");
  }
  await announceBuildings(childId, ids as string[]);
}

/**
 * Pins the plan the hero is working toward (null clears it): the Tavern card and the Realm's beacon
 * lean on it. The hero alone chooses; a grown-up previewing is refused. `improvementId` crosses the
 * network, so only null or a catalog id (an own key, never `__proto__`) is written.
 */
export async function pinPlan(childId: string, improvementId: unknown): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error(PIN_HERO_ONLY);
  if (improvementId !== null && (typeof improvementId !== "string" || !Object.hasOwn(IMPROVEMENTS, improvementId))) {
    throw new Error(PLAN_NOT_READY);
  }
  await setPinnedPlan(childId, improvementId as ImprovementId | null);
  revalidatePath("/tavern");
}

/**
 * The hero has seen the delivery card for every row up to `through` (epoch seconds, the newest the
 * card showed). Hero only, so a grown-up previewing never uses it up. The server clamps a future
 * value to now and never moves the mark backwards (`advanceDeliverySeen`).
 */
export async function markDeliverySeen(childId: string, through: unknown): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error(DELIVERY_HERO_ONLY);
  if (typeof through !== "number" || !Number.isFinite(through)) throw new Error("That is not a time.");
  await advanceDeliverySeen(childId, through);
}
