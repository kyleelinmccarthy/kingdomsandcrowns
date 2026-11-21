/**
 * The sampling and checking behind `/dev/content`, kept out of the component so the
 * page renders a plain array and nothing about what a parent sees depends on React.
 */
import { GENERATORS, seededRng, type Question } from "@/lib/utils/drill-generators";
import { VERIFIERS } from "@/lib/utils/drill-verify";
import type { Grade } from "@/lib/utils/grade-levels";
import { skillsFor, type Skill, type SkillArea } from "@/lib/utils/skills";

export const LEVELS = [0, 1, 2, 3, 4] as const;

/** Five per level is enough to spot a pattern without making the page unreadable. */
export const DRAWS_PER_LEVEL = 5;

/**
 * One fixed seed for the whole page. A parent who reloads must see the SAME questions:
 * otherwise "the third one at level 2 is wrong" stops meaning anything by the time they
 * come back to look, and a question they half-noticed is gone forever.
 */
const PAGE_SEED = 0x6b634d61;

/** Distinct per skill AND level, so two skills sharing a generator do not show the same five. */
export function seedFor(skillId: string, level: number): number {
  let h = PAGE_SEED;
  for (let i = 0; i < skillId.length; i++) h = (Math.imul(h, 31) + skillId.charCodeAt(i)) >>> 0;
  return (h + Math.imul(level + 1, 0x9e3779b1)) >>> 0;
}

/**
 * What the independent verifier makes of a question. A verifier THROWS when it cannot
 * parse a prompt — deliberately, since an unreadable prompt is itself a defect — so the
 * throw is caught here and shown as a disagreement rather than blanking the page a
 * parent came to read.
 */
export type Verdict =
  | { agrees: true }
  | { agrees: false; detail: string };

export type SampledQuestion = { question: Question; verdict: Verdict };

export type SampledLevel = { level: number; questions: SampledQuestion[] };

/** One clue of a trail pool, as the page shows it: what the child reads, where it leads, and what a miss says. */
export type SampledTrailClue = { level: number; text: string; readAloud?: string; answerLabel: string; redirect: string; why: string };

export type SampledSkill =
  | { skill: Skill; kind: "generator"; generatorId: string; levels: SampledLevel[]; disagreements: number }
  /** `clues`: a pool skill a trail pool also credits (`read-g1`, `read-g3`, `read-g4`) is walked as a trail where trails are on. */
  | { skill: Skill; kind: "pool"; poolId: string; clues: SampledTrailClue[] }
  | { skill: Skill; kind: "lock" }
  | { skill: Skill; kind: "trail"; clues: SampledTrailClue[] };

export function verdictFor(generatorId: string, question: Question): Verdict {
  const verify = VERIFIERS[generatorId];
  if (!verify) return { agrees: false, detail: `no verifier is registered for generator "${generatorId}"` };
  try {
    const derived = verify(question);
    if (derived === question.answer) return { agrees: true };
    return { agrees: false, detail: `reading the prompt gives ${derived}, but the answer key says ${question.answer}` };
  } catch (error) {
    return { agrees: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A generator that throws is reported in place of its questions rather than taken as a
 * reason to show nothing: the other skills at that grade are still worth reading.
 */
function drawLevel(skillId: string, generatorId: string, level: number): SampledQuestion[] {
  const generate = GENERATORS[generatorId];
  if (!generate) {
    return [
      {
        question: { id: `${skillId}:missing`, skillId, prompt: `(no generator "${generatorId}")`, choices: [], answer: "" },
        verdict: { agrees: false, detail: `no generator is registered as "${generatorId}"` },
      },
    ];
  }
  const rng = seededRng(seedFor(skillId, level));
  const out: SampledQuestion[] = [];
  for (let i = 0; i < DRAWS_PER_LEVEL; i++) {
    try {
      const question = generate(level, rng, skillId);
      out.push({ question, verdict: verdictFor(generatorId, question) });
    } catch (error) {
      out.push({
        question: { id: `${skillId}:threw:${level}:${i}`, skillId, prompt: "(the generator threw)", choices: [], answer: "" },
        verdict: { agrees: false, detail: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return out;
}

/**
 * Every skill the map gives this grade in this strand, with its sample drawn. `trails` is the trail
 * pools' clues by skill id (`sample-trails.ts`, drawn on the server so the pools' answers never ride
 * into the browser's bundle); a trail skill with none shows no sample.
 */
export function sampleGrade(area: SkillArea, grade: Grade, trails: Readonly<Record<string, SampledTrailClue[]>> = {}): SampledSkill[] {
  return skillsFor(area, grade).map((skill) => {
    // A reading trail's clues come from its pool (`trailPoolFor`), sampled by the server page and passed in.
    const clues = Object.prototype.hasOwnProperty.call(trails, skill.id) ? trails[skill.id] : [];
    if (skill.source.kind === "pool") return { skill, kind: "pool", poolId: skill.source.poolId, clues };
    if (skill.source.kind === "lock") return { skill, kind: "lock" };
    if (skill.source.kind === "trail") return { skill, kind: "trail", clues };
    const generatorId = skill.source.generatorId;
    const levels = LEVELS.map((level) => ({ level, questions: drawLevel(skill.id, generatorId, level) }));
    const disagreements = levels.reduce(
      (n, l) => n + l.questions.filter((q) => !q.verdict.agrees).length,
      0,
    );
    return { skill, kind: "generator", generatorId, levels, disagreements };
  });
}
