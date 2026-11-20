"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { bandForGrade } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { buildPracticeRun } from "@/lib/utils/practice-run";
import { PRACTICE_STORY, PUZZLE_PRACTICE } from "@/lib/utils/practice-copy";
import { RUN_EFFECTS } from "@/lib/utils/deed-scoring";
import { CLOSED, NONE_READY, PRACTICE_HERO_ONLY, PRACTICE_OFF } from "@/lib/utils/deed-refusals";
import { enabledHandsOnKinds } from "@/lib/utils/realm-settings";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { demoAt, findOpenRun, insertRun, loadMasteryRows, resumedStart } from "@/lib/services/deed-run-store";
import { loadHeroLevels } from "@/lib/services/deeds";
import { loadFocusSkillIds } from "@/lib/services/learning-focus";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadRealmSettings } from "@/lib/services/realm-play";

/** The one practice run a hero has open at a time is named by this, as a review's page run is "page". */
const PRACTICE_REF = "practice";

/**
 * Puzzle practice (R-F8): a `world` run of three logic locks at the hero's own grade, or of the
 * grown-up's logic focus skill a grade either side (`buildPracticeRun`), from the Side Quests page. It pays nothing and raises nothing; its answers
 * move the hero's logic mastery (`RUN_EFFECTS.world`). The hero's alone: a grown-up looking at the
 * page is refused, as at the bench. Refused too while the grown-up has locks switched off, even with a
 * practice run open, since logic is played on locks alone (R-F7). A second start picks the open
 * practice run back up rather than stacking another.
 */
export async function startPracticeRun(childId: string): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error(PRACTICE_HERO_ONLY);
  const [hero, settings] = await Promise.all([loadHeroLevels(childId), loadRealmSettings(childId)]);
  if (!hero.enabled) throw new Error(CLOSED);
  if (!settings.mechanics.lock) throw new Error(PRACTICE_OFF);

  const header: RunStart["deed"] = { id: PRACTICE_REF, title: PUZZLE_PRACTICE, story: PRACTICE_STORY, area: "logic" };
  const grade = hero.grades.logic;
  // A young hero meets Pip before their first lock (R-F10), resumed or fresh.
  const withDemo = async (start: RunStart): Promise<RunStart> => {
    const at = await demoAt(childId, grade, start);
    return at === null ? start : { ...start, demo: { at } };
  };
  const open = await findOpenRun(and(
    eq(schema.deedRun.childId, childId), eq(schema.deedRun.kind, "world"), eq(schema.deedRun.sourceRef, PRACTICE_REF),
  ));
  if (open) return withDemo(resumedStart(open, header));

  const [masteryRows, profileRow, focusSkillIds] = await Promise.all([
    loadMasteryRows(childId),
    // Memoized per request: the same round trip loadHeroLevels just made.
    loadLearningProfileRow(childId),
    loadFocusSkillIds(childId, hero.grades),
  ]);
  const masteryBySkill: Record<string, number> = {};
  for (const m of masteryRows) masteryBySkill[m.skillId] = m.level;
  const built = buildPracticeRun({
    grade, masteryBySkill, seed: Date.now() >>> 0, enabledKinds: enabledHandsOnKinds(settings), profile: profileFromRow(profileRow), focusSkillIds,
  });
  if (built.questions.length === 0) throw new Error(NONE_READY);

  const masteryStart: Record<string, number> = {};
  for (const skillId of built.skillIds) masteryStart[skillId] = masteryBySkill[skillId] ?? 0;
  return withDemo(await insertRun({
    id: nanoid(), childId, deedId: null, sourceRef: PRACTICE_REF, skillIds: JSON.stringify(built.skillIds), band: bandForGrade(grade),
    masteryStart: JSON.stringify(masteryStart),
    // Snapshotted, so a grown-up changing the setting mid-run never changes this run's rules.
    kind: "world", secondChances: RUN_EFFECTS.world.allowsSecondChances && settings.secondChances,
  }, built.questions, header));
}
