/**
 * A build run's tasks (R-D6): three at the bench, started by the hero from the plans board. Pure,
 * and drawn from the hero's math grade, because the bench has content only for math: the grade's
 * two bench skills, two tasks from one and one from the other, the one the hero knows less well
 * taking the two. It is the deed engine's own draw (`drawForSkill`, `applyProfile`) without a deed:
 * a plan belongs to no side quest, so there is no deed to hand `buildDeedRun`.
 *
 * The grown-up's measure switch is respected: with it off the very same skills are asked as choice
 * tasks. A grade that somehow has no bench skill falls back to its math skills as choice, so a hero
 * is never refused a build for want of one.
 */
import { benchFor } from "@/lib/tasks/bench";
import { kindForSkill } from "@/lib/tasks/registry";
import type { Task, TaskKind } from "@/lib/tasks/types";
import { applyProfile, drawForSkill, type BuiltRun, type ProfileLike } from "./deed-engine";
import { seededRng, shuffle } from "./drill-generators";
import type { Grade } from "./grade-levels";
import { MASTERY_MAX } from "./mastery";
import { skillsFor, type Skill } from "./skills";

export const BUILD_RUN = { tasks: 3 } as const;

export function buildBuildRun(input: {
  grade: Grade;
  masteryBySkill: Record<string, number>;
  seed: number;
  /** The hands-on kinds the grown-up has left on (`enabledHandsOnKinds`); a kind that is off is asked as choice. */
  enabledKinds: ReadonlySet<TaskKind>;
  profile: ProfileLike;
}): BuiltRun {
  const { grade, masteryBySkill, enabledKinds, profile } = input;
  const rng = seededRng(input.seed);
  const all = skillsFor("math", grade);
  const benched = all.filter((s) => benchFor(s.id) !== undefined);
  const candidates = benched.length > 0 ? benched : all;
  if (candidates.length === 0) return { skillIds: [], questions: [] };

  const levelOf = (s: Skill) => Math.min(masteryBySkill[s.id] ?? 0, MASTERY_MAX);
  // The weaker skill first (a tie is the rng's), so it is the one asked twice.
  const picks = shuffle(candidates, rng)
    .sort((a, b) => levelOf(a) - levelOf(b))
    .slice(0, 2);
  const want = [BUILD_RUN.tasks - Math.floor(BUILD_RUN.tasks / 2), Math.floor(BUILD_RUN.tasks / 2)];

  const have = new Set<string>();
  const draw = (skill: Skill, count: number): Task[] => {
    if (count <= 0) return [];
    const kind = kindForSkill("measure", skill.id, enabledKinds);
    const drawn = drawForSkill(skill, levelOf(skill), count, rng, [], new Set(have), new Set(), kind);
    for (const t of drawn) have.add(t.id);
    return drawn;
  };
  const bySkill = picks.map((skill, i) => draw(skill, want[i] ?? 0));
  // A skill that came up short hands its slots to the others, then to any candidate.
  for (const skill of [...picks, ...candidates]) {
    const short = BUILD_RUN.tasks - bySkill.reduce((n, t) => n + t.length, 0);
    if (short <= 0) break;
    const extra = draw(skill, short);
    const at = Math.max(0, picks.indexOf(skill));
    if (bySkill[at]) bySkill[at] = [...bySkill[at], ...extra];
    else bySkill.push(extra);
  }

  const grouped = bySkill.flat();
  const ordered = profile.predictableRoutine ? grouped : shuffle(grouped, rng);
  const skillIds = [...new Set(grouped.map((t) => t.skillId))];
  return { skillIds, questions: applyProfile(ordered, profile, rng) };
}
