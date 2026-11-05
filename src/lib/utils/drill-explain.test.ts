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

  it("splits a two-digit product into tens and ones, in the signed cases too", () => {
    let split = 0, stated = 0, signed = 0;
    for (const level of [3, 4]) {
      for (let seed = 1; seed <= 200; seed++) {
        const q = generate("integer-ops", level, seed);
        const m = q.prompt.match(/^What is (-?\d+) × (-?\d+)\?$/);
        if (!m) continue;
        const [x, y] = [Math.abs(Number(m[1])), Math.abs(Number(m[2]))];
        if (x === 0 || y === 0) continue;
        const wantsSplit = x >= 10 && y >= 10 && (x % 10 !== 0 || y % 10 !== 0);
        if (wantsSplit) {
          split++;
          expect(q.explain, q.prompt).toMatch(/\d+ × \d+0 = \d+, \d+ × \d = \d+, \d+ \+ \d+ = \d+/);
          if (Number(m[1]) < 0 || Number(m[2]) < 0) { signed++; expect(q.explain, q.prompt).toMatch(/signs (differ|match)/); }
        } else {
          stated++;
          expect(q.explain, q.prompt).not.toContain(" + ");
        }
      }
    }
    expect(split).toBeGreaterThan(0);
    expect(signed).toBeGreaterThan(0);
    expect(stated).toBeGreaterThan(0);
  });

  it("names the chunks only when there is more than one", () => {
    let single = 0, several = 0;
    for (const id of ["add-1000", "sub-1000"]) {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 200; seed++) {
          const e = generate(id, level, seed).explain!;
          if (e.includes(", then ")) { several++; expect(e).toContain("in chunks"); }
          else { single++; expect(e).not.toContain("in chunks"); }
        }
      }
    }
    expect(single).toBeGreaterThan(0);
    expect(several).toBeGreaterThan(0);
  });

  it("explains area in the prompt's own words", () => {
    const areas = Array.from({ length: 200 }, (_, i) => generate("area-perimeter", 0, i + 1)).filter((q) => q.prompt.endsWith("area?"));
    expect(areas.length).toBeGreaterThan(0);
    for (const q of areas) expect(q.explain).toContain("wide times tall");
  });
});
