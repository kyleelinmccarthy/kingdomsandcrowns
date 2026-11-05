/**
 * After a child's tries are spent the board shows `question.explain`, so every grade-3 and
 * grade-6 math skill must carry one. The baseline fixture pins what the generators asked
 * BEFORE explanations existed: writing a line of working must not draw a random number or
 * change a question, or every run already in flight would shift under the children.
 */
import { describe, it, expect } from "vitest";
import baseline from "./__fixtures__/drill-explain-baseline.json";
import { GENERATORS, seededRng, type Question } from "./drill-generators";
import { SKILLS } from "./skills";

const SKILL_IDS = [
  "mul-facts", "div-facts", "frac-unit", "area-perimeter", "round-nearest", "add-1000",
  "sub-1000", "integer-ops", "percent-of", "ratio-rate", "frac-div", "eval-expr",
];
const LEVELS = [0, 1, 2, 3, 4];

function generate(skillId: string, level: number, seed: number): Question {
  const skill = SKILLS.find((s) => s.id === skillId);
  if (!skill || skill.source.kind !== "generator") throw new Error(`${skillId} is not a generator skill`);
  return GENERATORS[skill.source.generatorId](level, seededRng(seed), skillId);
}

describe("worked explanations", () => {
  it.each(SKILL_IDS)("%s explains every question with its answer in it", (skillId) => {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 200; seed++) {
        const q = generate(skillId, level, seed);
        expect(q.explain, `${skillId} L${level} seed ${seed}: ${q.prompt}`).toBeTruthy();
        expect(q.explain!.length, q.explain).toBeLessThanOrEqual(200);
        expect(q.explain, `"${q.explain}" should contain ${q.answer}`).toContain(q.answer);
        expect(q.explain).not.toMatch(/NaN|undefined|Infinity/);
        expect(q.explain).not.toMatch(/\b(behind|ahead|level|grade|rung|review|failed)\b/i);
      }
    }
  });

  it("leaves every question exactly as it was asked before explanations", () => {
    const entries = Object.entries(baseline as Record<string, Pick<Question, "id" | "prompt" | "choices" | "answer">>);
    expect(entries).toHaveLength(SKILL_IDS.length * LEVELS.length * 50);
    for (const [key, was] of entries) {
      const [skillId, level, seed] = key.split("/");
      const q = generate(skillId, Number(level), Number(seed));
      expect({ id: q.id, prompt: q.prompt, choices: q.choices, answer: q.answer }, key).toEqual(was);
    }
  });
});
