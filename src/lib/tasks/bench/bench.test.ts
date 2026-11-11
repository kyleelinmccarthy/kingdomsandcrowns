/**
 * The catalog harness: every generator registered in BENCH, levels 0-4, 200 seeds each. A later
 * band extends the bench just by registering its skills; nothing here lists them.
 */
import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { BENCH, benchFor } from ".";
import { measureKind } from "../measure";
import { parseAnswer, sameValue, type Rational } from "../parse-answer";
import { toClientTask } from "../registry";
import type { MeasureTask, Quantity } from "../types";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
/** Skills whose pieces or answers may be negative (none yet: the integer skills arrive with grade 6+). */
const INTEGER_SKILLS = new Set<string>();
/** K-1: the child may not read the prompt, so it is spoken. */
const READ_ALOUD_SKILLS = new Set(["add-10", "sub-10", "add-20", "sub-20"]);
/**
 * What a cut's unit measures. A square unit is an area and a cubic one a volume; every other unit a
 * generator uses is named here, so a new unit fails until someone says what it measures.
 */
const UNIT_QUANTITY: Record<string, Quantity> = {
  feet: "length", inches: "length", yards: "length", miles: "length", meters: "length", centimeters: "length", cm: "length", blocks: "length",
  // Each flagstone is a foot square: the floor's area, counted in squares (area-perimeter).
  flagstones: "area",
  stones: "count", buckets: "count", pots: "count",
  pounds: "weight", ounces: "weight",
};
const quantityOfUnit = (unit: string): Quantity | undefined =>
  unit.startsWith("square ") ? "area" : unit.startsWith("cubic ") ? "volume" : UNIT_QUANTITY[unit];

const draw = (skillId: string, level: number, seed: number): MeasureTask => {
  const t = BENCH[skillId](level, seededRng(seed), skillId);
  if (!t) throw new Error(`${skillId} gave no task at level ${level}, seed ${seed}`);
  return t;
};
const rat = (s: string): Rational => {
  const r = parseAnswer(s);
  if (!r) throw new Error(`unreadable length "${s}"`);
  return r;
};
const leq = (a: Rational, b: Rational) => a.n * b.d <= b.n * a.d;

const skills = Object.keys(BENCH);

describe("bench catalog", () => {
  it("registers skills, and benchFor reads own keys only", () => {
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) expect(benchFor(s)).toBe(BENCH[s]);
    expect(benchFor("toString")).toBeUndefined();
  });

  describe.each(skills)("%s", (skillId) => {
    describe.each(LEVELS)("level %i", (level) => {
      const tasks = SEEDS.map((seed) => draw(skillId, level, seed));

      it("is deterministic: the same seed gives the same task", () => {
        for (const seed of SEEDS) expect(draw(skillId, level, seed)).toEqual(tasks[seed - 1]);
      });

      it("has enough variety: >= 5 distinct ids at level 0, >= 8 above", () => {
        expect(new Set(tasks.map((t) => t.id)).size).toBeGreaterThanOrEqual(level === 0 ? 5 : 8);
      });

      it("varies in content, not just order: >= 3 distinct tasks at level 0, >= 5 above", () => {
        // The mark and the offered lengths (sorted, so a permutation is the same task); a cut is its beam and answer.
        const content = (t: MeasureTask) =>
          t.mode === "assemble" ? `${t.target!.value}|${t.pieces!.map((p) => p.value).sort().join(",")}` : `${t.maxLength}|${t.answer}`;
        expect(new Set(tasks.map(content)).size).toBeGreaterThanOrEqual(level === 0 ? 3 : 5);
      });

      it("is a measure task for this skill with a stable, skill-prefixed id", () => {
        for (const t of tasks) {
          expect(t.kind).toBe("measure");
          expect(t.skillId).toBe(skillId);
          expect(t.id.startsWith(`${skillId}:`)).toBe(true);
        }
      });

      it("is solvable, and the stored solution (or answer) is itself right", () => {
        for (const t of tasks) {
          if (t.mode === "assemble") {
            expect(t.pieces!.length).toBeGreaterThanOrEqual(2);
            const n = t.pieces!.length;
            let hits = 0;
            for (let mask = 1; mask < 1 << n; mask++) {
              const picks = [...Array(n).keys()].filter((i) => mask & (1 << i));
              if (measureKind.isCorrect(t, picks)) hits++;
            }
            expect(hits, t.id).toBeGreaterThan(0);
            const sol = [...t.solution!].sort((a, b) => a - b);
            expect(measureKind.parseResponse(sol, t), t.id).toEqual(sol);
            expect(measureKind.isCorrect(t, sol), t.id).toBe(true);
          } else {
            const r = measureKind.parseResponse(t.answer, t);
            expect(r, t.id).not.toBeNull();
            expect(measureKind.isCorrect(t, r!), t.id).toBe(true);
          }
        }
      });

      it("offers no two pieces of one value (a decoy may run longer than the mark)", () => {
        for (const t of tasks.filter((x) => x.mode === "assemble")) {
          const vals = t.pieces!.map((p) => rat(p.value));
          for (let i = 0; i < vals.length; i++) {
            for (let j = i + 1; j < vals.length; j++) expect(sameValue(vals[i], vals[j]), t.id).toBe(false);
          }
        }
      });

      it("keeps every length non-negative unless the skill is about integers", () => {
        if (INTEGER_SKILLS.has(skillId)) return;
        const zero = rat("0");
        for (const t of tasks) {
          const values = [...(t.pieces ?? []).map((p) => p.value), ...(t.target ? [t.target.value] : []), ...(t.answer !== undefined ? [t.answer] : [])];
          for (const v of values) expect(leq(zero, rat(v)), `${t.id}: ${v}`).toBe(true);
        }
      });

      it("says what every cut measures, as its unit does, and shows the bench (I-3)", () => {
        for (const t of tasks.filter((x) => x.mode === "cut")) {
          const expected = quantityOfUnit(t.unit);
          expect(expected, `${t.id}: what does "${t.unit}" measure? Add it to UNIT_QUANTITY`).toBeDefined();
          expect(t.quantity, `${t.id} (${t.unit})`).toBe(expected);
          const view = toClientTask(t).view as { quantity?: Quantity };
          expect(view.quantity, t.id).toBe(t.quantity);
        }
      });

      it("makes every cut answer reachable with the stepper: answer <= maxLength", () => {
        for (const t of tasks.filter((x) => x.mode === "cut")) {
          expect(t.step, t.id).toBeDefined();
          expect(t.maxLength, t.id).toBeDefined();
          expect(leq(rat(t.answer!), rat(t.maxLength!)), t.id).toBe(true);
        }
      });

      it("never lets the stepper hand over a cut: the answer is at least two steps, on the step's own grid (RC-i)", () => {
        for (const t of tasks.filter((x) => x.mode === "cut")) {
          const answer = rat(t.answer!);
          const step = rat(t.step!);
          expect(leq({ n: step.n * BigInt(2), d: step.d }, answer), `${t.id}: answer ${t.answer} under two steps of ${t.step}`).toBe(true);
          expect(sameValue(step, answer), t.id).toBe(false);
          // answer / step is a whole number, so the stepper can land on it.
          expect((answer.n * step.d) % (answer.d * step.n), `${t.id}: ${t.answer} is not a multiple of ${t.step}`).toBe(BigInt(0));
        }
      });

      it("builds the bridge from the task's own numbers", () => {
        for (const t of tasks) {
          const mark = t.mode === "assemble" ? t.target!.value : t.answer!;
          // The mark ends the line as a whole value (after "= "), not as a substring of another number.
          expect(t.bridge.endsWith(`= ${mark}`), t.id).toBe(true);
          // A sum for assemble; a cut is a difference, a product or a quotient (area, rows, a unit fraction).
          expect(t.bridge, t.id).toMatch(t.mode === "assemble" ? /\+/ : /[−×÷+]/);
        }
      });

      it("names a missed cut bare and leaves the working to its explanation, so the equation is said once", () => {
        for (const t of tasks.filter((x) => x.mode === "cut")) {
          expect(t.explain, t.id).toBeTruthy();
          expect(measureKind.answerText(t), t.id).not.toContain("=");
          expect(measureKind.answerText(t).startsWith(t.answer!), t.id).toBe(true);
        }
      });

      it("has a short, kind prompt", () => {
        for (const t of tasks) {
          expect(t.prompt.length, t.id).toBeLessThanOrEqual(160);
          expect(`${t.prompt} ${t.readAloud ?? ""} ${t.explain ?? ""}`).not.toMatch(/\b(behind|ahead)\b/i);
        }
      });

      it("writes a/an by how a number is spoken: never 'a 8', 'a 11', 'a 18', 'a 8x'; never 'an' before another number", () => {
        // Eight, eleven, eighteen, eighty-x and eight hundred-x take "an"; any other number takes "a".
        const AN_NUMBER = "(?:8|11|18|8\\d|8\\d\\d)";
        const wrongA = new RegExp(`\\b[Aa] ${AN_NUMBER}\\b`);
        const wrongAn = new RegExp(`\\b[Aa]n (?!${AN_NUMBER}\\b)\\d`);
        for (const t of tasks) {
          for (const text of [t.prompt, t.readAloud ?? "", t.explain ?? ""]) {
            expect(text, t.id).not.toMatch(wrongA);
            expect(text, t.id).not.toMatch(wrongAn);
          }
        }
      });

      it("carries readAloud for K-1 skills", () => {
        if (!READ_ALOUD_SKILLS.has(skillId)) return;
        for (const t of tasks) {
          expect(t.readAloud, t.id).toBeTruthy();
          expect(t.readAloud!, t.id).not.toMatch(/\d/);
        }
      });

      it("never lets the answer, solution or bridge reach the client", () => {
        for (const t of tasks) {
          const json = JSON.stringify(toClientTask(t));
          for (const leak of ['"answer"', '"solution"', '"bridge"', '"explain"', '"value"', t.bridge]) expect(json, t.id).not.toContain(leak);
        }
      });
    });
  });
});
