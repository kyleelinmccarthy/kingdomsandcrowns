"use server";

import { PRACTICE_RUN, practiceSkill } from "@/lib/utils/practice-run";
import { PRACTICE_STORY, PUZZLE_PRACTICE } from "@/lib/utils/practice-copy";
import { PRACTICE_HERO_ONLY, PRACTICE_OFF } from "@/lib/utils/deed-refusals";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { startLockRun } from "@/lib/services/lock-runs";

/** The one practice run a hero has open at a time is named by this, as a review's page run is "page". */
const PRACTICE_REF = "practice";

/**
 * Puzzle practice (R-F8): a `world` run of three logic locks at the hero's own grade, or of the
 * grown-up's logic focus skill a grade either side (`practiceSkill`), from the Side Quests page. It pays nothing and raises nothing; its answers
 * move the hero's logic mastery (`RUN_EFFECTS.world`). The hero's alone: a grown-up looking at the
 * page is refused, as at the bench. Refused too while the grown-up has locks switched off, even with a
 * practice run open, since logic is played on locks alone (R-F7). A second start picks the open
 * practice run back up rather than stacking another. The shared lock-run skeleton (`startLockRun`) does the rest.
 */
export async function startPracticeRun(childId: string): Promise<RunStart> {
  return startLockRun(childId, {
    kind: "world",
    sourceRef: PRACTICE_REF,
    refusals: { heroOnly: PRACTICE_HERO_ONLY, off: PRACTICE_OFF },
    pick: (hero, focusSkillIds) => {
      const skill = practiceSkill(hero.grades.logic, focusSkillIds);
      // The hero's own logic grade names the band, whichever skill the focus chose.
      return skill ? { skill, grade: hero.grades.logic, boost: 0 } : null;
    },
    count: PRACTICE_RUN.tasks,
    header: () => ({ id: PRACTICE_REF, title: PUZZLE_PRACTICE, story: PRACTICE_STORY, area: "logic" }),
    demo: true,
  });
}
