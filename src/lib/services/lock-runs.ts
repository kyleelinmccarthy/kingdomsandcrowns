import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "@/lib/db/schema";
import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { bandForGrade, type Grade } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { lockLevel, lockRun } from "@/lib/utils/practice-run";
import { RUN_EFFECTS } from "@/lib/utils/deed-scoring";
import { CLOSED, NONE_READY } from "@/lib/utils/deed-refusals";
import { enabledHandsOnKinds } from "@/lib/utils/realm-settings";
import { findSkill, type Skill } from "@/lib/utils/skills";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { demoAt, findOpenRun, insertRun, loadMasteryRows, resumedStart, type DeedRunRow } from "@/lib/services/deed-run-store";
import { loadHeroLevels, type HeroLevels } from "@/lib/services/deeds";
import { loadFocusSkillIds } from "@/lib/services/learning-focus";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { loadRealmSettings } from "@/lib/services/realm-play";

/**
 * What one kind of lock run says about itself to `startLockRun`: Puzzle practice, a chest or vault
 * door (`actions/world-locks.ts`), a Tower floor.
 */
export type LockRunSpec = {
  kind: "world" | "tower";
  /** What owns the run, and what a later start resumes it by: "practice", an object id, a tower ref. */
  sourceRef: string;
  /** Thrown to a grown-up, and while the grown-up has locks switched off. */
  refusals: { heroOnly: string; off: string };
  /** A refusal of this run's own, after the shared ones and before anything is read for the run. */
  check?: (hero: HeroLevels) => Promise<void>;
  /** The skill drawn, the grade that names the run's band, and how many rungs above the hero's mastery. */
  pick: (hero: HeroLevels, focusSkillIds: readonly string[]) => { skill: Skill; grade: Grade; boost: number } | null;
  count: number;
  header: (skill: Skill) => RunStart["deed"];
  /** Whether a young hero meets Pip before their first lock of a kind (R-F10). */
  demo: boolean;
};

/** The skill an open run was drawn from (one per lock run), or null if this build no longer has it. */
function storedSkill(run: DeedRunRow): Skill | null {
  try {
    const [id] = JSON.parse(run.skillIds) as unknown[];
    return typeof id === "string" ? findSkill(id) : null;
  } catch {
    return null;
  }
}

/**
 * Starts, or picks back up, a lock run (RG-j): the one skeleton Puzzle practice, the world's locks
 * and the Tower share, in `startPracticeRun`'s order:
 *   1. the caller may write for this hero (family scoped), and is the hero, else `heroOnly`;
 *   2. the Realm is open (`CLOSED`), and the grown-up's locks are on, else `off`, even for an open run;
 *   3. the run's own `check`;
 *   4. an open run of this kind and `sourceRef` is resumed, never stacked;
 *   5. else `pick` chooses the skill, with the grown-up's focus picks to hand;
 *   6. at the hero's mastery of it, capped, plus the pick's boost, capped again;
 *   7. `count` locks, seeded by the server's clock (PC-G3); none is `NONE_READY`;
 *   8. written by `insertRun`, its second chances frozen from the settings, with Pip's demo when asked.
 * Every task reaches the browser through `insertRun` or `resumedStart` (`toClientTask` views), so
 * no lock's solution does.
 */
export async function startLockRun(childId: string, spec: LockRunSpec): Promise<RunStart> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error(spec.refusals.heroOnly);
  const [hero, settings] = await Promise.all([loadHeroLevels(childId), loadRealmSettings(childId)]);
  if (!hero.enabled) throw new Error(CLOSED);
  if (!settings.mechanics.lock) throw new Error(spec.refusals.off);
  await spec.check?.(hero);

  // A young hero meets Pip before their first lock (R-F10), resumed or fresh: at their grade in the lock's own strand.
  const withDemo = async (start: RunStart, skill: Skill): Promise<RunStart> => {
    if (!spec.demo) return start;
    const at = await demoAt(childId, hero.grades[skill.area], start);
    return at === null ? start : { ...start, demo: { at } };
  };
  const open = await findOpenRun(and(
    eq(schema.deedRun.childId, childId), eq(schema.deedRun.kind, spec.kind), eq(schema.deedRun.sourceRef, spec.sourceRef),
  ));
  const openSkill = open ? storedSkill(open) : null;
  // A run whose skill this build no longer has is left behind: the fresh one below is newer, so it is the one resumed next.
  if (open && openSkill) return withDemo(resumedStart(open, spec.header(openSkill)), openSkill);

  const [masteryRows, profileRow, focusSkillIds] = await Promise.all([
    loadMasteryRows(childId),
    // Memoized per request: the same round trip loadHeroLevels just made.
    loadLearningProfileRow(childId),
    loadFocusSkillIds(childId, hero.grades),
  ]);
  const pick = spec.pick(hero, focusSkillIds);
  if (!pick) throw new Error(NONE_READY);
  const mastery = masteryRows.find((m) => m.skillId === pick.skill.id)?.level ?? 0;
  const built = lockRun({
    skill: pick.skill, level: lockLevel(mastery, pick.boost), count: spec.count, seed: Date.now() >>> 0, enabledKinds: enabledHandsOnKinds(settings), profile: profileFromRow(profileRow),
  });
  if (built.questions.length === 0) throw new Error(NONE_READY);

  return withDemo(await insertRun({
    id: nanoid(), childId, deedId: null, sourceRef: spec.sourceRef, skillIds: JSON.stringify(built.skillIds), band: bandForGrade(pick.grade),
    masteryStart: JSON.stringify({ [pick.skill.id]: mastery }),
    // Snapshotted, so a grown-up changing the setting mid-run never changes this run's rules.
    kind: spec.kind, secondChances: RUN_EFFECTS[spec.kind].allowsSecondChances && settings.secondChances,
  }, built.questions, spec.header(pick.skill)), pick.skill);
}
