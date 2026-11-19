"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { IMPROVEMENTS, planRef, planState, type ImprovementId } from "@/lib/realm/improvements";
import { buildBuildRun } from "@/lib/utils/build-run";
import { RUN_EFFECTS } from "@/lib/utils/deed-scoring";
import { BUILD_HERO_ONLY, CLOSED, NONE_READY, PLAN_NOT_READY } from "@/lib/utils/deed-refusals";
import { bandForGrade } from "@/lib/utils/grade-levels";
import { enabledHandsOnKinds } from "@/lib/utils/realm-settings";
import { profileFromRow } from "@/lib/utils/learning-profile";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { benchDemoAt, findOpenRun, insertRun, loadMasteryRows, resumedStart } from "@/lib/services/deed-run-store";
import { loadHeroLevels } from "@/lib/services/deeds";
import { loadPlanInput } from "@/lib/services/improvements";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadRealmSettings } from "@/lib/services/realm-play";

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
