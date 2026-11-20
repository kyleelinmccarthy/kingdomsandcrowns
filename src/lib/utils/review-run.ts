import { seededRng, shuffle } from "./drill-generators";
import { applyProfile, drawForSkill, type PoolItem, type ProfileLike } from "./deed-engine";
import { overdueSkills, type MasteryTiming } from "./review-schedule";
import { findSkill, type Skill } from "./skills";
import { MASTERY_MAX } from "./mastery";
import type { ChoiceTask, Task } from "@/lib/tasks/types";

/**
 * A review run is a short interleaved set across what a child has already learned: spaced,
 * mixed retrieval practice. Three tasks, a skill at most once each.
 */
export const REVIEW_RUN = { tasks: 3 } as const;

/** Recent misses that may come back in one review run. */
const MAX_MISSES = 2;

/**
 * A review run is choice only (R-C6): a miss of another kind is never re-asked. Written as a
 * discriminant test, not `kindOf`, so it narrows. The review action loads misses through it, so
 * bench misses never use up the misses it reads (`loadRecentMisses`).
 */
export const reviewReasks = (t: Task): t is ChoiceTask => t.kind === undefined || t.kind === "choice";

/** A review run is choice only (R-C6): every pick, miss or fresh, is a choice task. */
type Pick = { skill: Skill; question: ChoiceTask; isMiss: boolean };

/**
 * Mastery rows for skills that exist and can be reviewed; the first row for a skill wins. A
 * `lock` skill is left out: a review run is choice only and a lock skill has no choice
 * questions, so counting it would light the riddle stones for a run that comes back empty.
 */
function knownRows(mastery: readonly MasteryTiming[]): Map<string, MasteryTiming> {
  const rows = new Map<string, MasteryTiming>();
  for (const r of mastery) {
    if (!rows.has(r.skillId)) {
      const skill = findSkill(r.skillId);
      if (skill && skill.source.kind !== "lock") rows.set(r.skillId, r);
    }
  }
  return rows;
}

/** True when any learned (level 1+) skill is past its review interval. */
export function reviewDue(mastery: readonly MasteryTiming[], now: number): boolean {
  const learned = [...knownRows(mastery).values()].filter((r) => r.level >= 1);
  return overdueSkills(learned, learned.map((r) => r.skillId), now).length > 0;
}

export function buildReviewRun(input: {
  mastery: readonly MasteryTiming[];
  recentMisses: Task[];
  poolItems: PoolItem[];
  /** The grown-up's focus skills: the learned ones come before least-recently-practised ones. */
  focusSkillIds?: string[];
  /** The hero's learning profile, applied as a side quest applies it (`applyProfile`); none is the default profile. */
  profile?: ProfileLike;
  now: number;
  seed: number;
}): { skillIds: string[]; questions: ChoiceTask[] } {
  const { poolItems, now } = input;
  const rng = seededRng(input.seed);
  const rows = knownRows(input.mastery);
  if (rows.size === 0) return { skillIds: [], questions: [] };

  // Misses first: known skills the child has a row for, deduped by question id (first wins),
  // one per skill, capped.
  const missPicks: Pick[] = [];
  const seenMissIds = new Set<string>();
  const missSkills = new Set<string>();
  for (const m of input.recentMisses) {
    if (missPicks.length >= MAX_MISSES) break;
    if (!reviewReasks(m)) continue;
    if (seenMissIds.has(m.id)) continue;
    seenMissIds.add(m.id);
    const skill = findSkill(m.skillId);
    if (!skill || !rows.has(skill.id) || missSkills.has(skill.id)) continue;
    missSkills.add(skill.id);
    missPicks.push({ skill, question: m, isMiss: true });
  }

  // Then overdue skills, then learned focus skills (an unlearned one has nothing to review), then
  // everything learned, least recently practised first (never practised counts as oldest). A
  // skill appears once, wherever it first qualifies.
  const learned = [...rows.values()].filter((r) => r.level >= 1 && !missSkills.has(r.skillId));
  const oldestFirst = [...learned].sort(
    (a, b) => (a.lastPracticedAt ?? -Infinity) - (b.lastPracticedAt ?? -Infinity),
  );
  const priority: string[] = [];
  for (const id of [
    ...overdueSkills(learned, learned.map((r) => r.skillId), now),
    ...(input.focusSkillIds ?? []).filter((id) => learned.some((r) => r.skillId === id)),
    ...oldestFirst.map((r) => r.skillId),
  ]) {
    if (!priority.includes(id)) priority.push(id);
  }

  const levelOf = (id: string) => Math.max(0, Math.min(MASTERY_MAX, Math.floor(rows.get(id)!.level)));
  const excludeIds = new Set(missPicks.map((p) => p.question.id));
  const excludePrompts = new Set(missPicks.map((p) => p.question.prompt));
  const drawOne = (skill: Skill): Pick | null => {
    // Drawn as a choice, whatever a deed would play the skill with: a review never benches (R-C6).
    const [q] = drawForSkill(skill, levelOf(skill.id), 1, rng, poolItems, excludeIds, excludePrompts, "choice");
    if (!q) return null;
    excludeIds.add(q.id);
    excludePrompts.add(q.prompt);
    return { skill, question: q, isMiss: false };
  };

  const picks: Pick[] = [...missPicks];
  for (const id of priority) {
    if (picks.length >= REVIEW_RUN.tasks) break;
    const pick = drawOne(findSkill(id)!);
    if (pick) picks.push(pick);
  }

  // Interleave: if every pick is one area and another area is available, the last non-miss
  // pick gives way to the best-priority skill from elsewhere.
  if (picks.length > 1 && new Set(picks.map((p) => p.skill.area)).size === 1) {
    const area = picks[0].skill.area;
    const swapAt = picks.map((p) => p.isMiss).lastIndexOf(false);
    if (swapAt >= 0) {
      for (const id of priority) {
        const skill = findSkill(id)!;
        if (skill.area === area) continue;
        const pick = drawOne(skill);
        if (pick) {
          picks[swapAt] = pick;
          break;
        }
      }
    }
  }

  const ordered = shuffle(picks, rng);
  // After the shuffle, so a hero with the default profile gets exactly the run they always did.
  const questions = applyProfile(ordered.map((p) => p.question), input.profile ?? { fewerChoices: false }, rng);
  return { skillIds: ordered.map((p) => p.skill.id), questions };
}
