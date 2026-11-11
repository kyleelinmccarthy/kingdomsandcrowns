import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { ADDSUB_DENOM_MAX, DEC_WHOLE_MAX, EQUIV_DENOM_MAX, RECT_MAX } from "@/lib/utils/generators/intermediate";
import { BENCH } from ".";
import { measureKind } from "../measure";
import { formatRational, parseAnswer, sameValue, type Rational } from "../parse-answer";
import type { MeasureTask } from "../types";

const G35 = ["area-perimeter", "frac-unit", "frac-equiv", "mul-multi", "frac-addsub", "dec-ops"];
const make = (skillId: string, level: number, seed: number): MeasureTask => BENCH[skillId](level, seededRng(seed), skillId)!;
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const LEVELS = [0, 1, 2, 3, 4];
const rat = (s: string): Rational => parseAnswer(s)!;
const num = (s: string) => { const r = rat(s); return Number(r.n) / Number(r.d); };
const denom = (s: string) => Number(rat(s).d);
const tasksOf = (skillId: string, level: number) => seeds.map((seed) => make(skillId, level, seed));
const sumOf = (t: MeasureTask, picks: number[]) =>
  picks.reduce<Rational>((a, i) => { const v = rat(t.pieces![i].value); return { n: a.n * v.d + v.n * a.d, d: a.d * v.d }; }, { n: BigInt(0), d: BigInt(1) });
/** The two stored pieces of an assemble task, shorter first (the order its bridge is written in). */
const solutionPair = (t: MeasureTask) => t.solution!.map((k) => t.pieces![k].value).sort((a, b) => num(a) - num(b));
const cutOff = (t: MeasureTask) => /Cut off (\S+) (?:foot|feet)\./.exec(t.prompt)![1];

describe("grade 3-5 bench (R-C3)", () => {
  it("registers the six grade 3-5 skills", () => {
    for (const s of G35) expect(BENCH[s], s).toBeTypeOf("function");
  });

  it("clamps out-of-range levels", () => {
    for (const s of G35) {
      expect(make(s, 9, 4)).toEqual(make(s, 4, 4));
      expect(make(s, -3, 4)).toEqual(make(s, 0, 4));
    }
  });

  describe("area-perimeter", () => {
    it("is a cut of either the walk round (feet) or the floor (flagstones), chosen by the seed", () => {
      const all = LEVELS.flatMap((l) => tasksOf("area-perimeter", l));
      const per = all.filter((t) => t.unit === "feet");
      const area = all.filter((t) => t.unit === "flagstones");
      expect(per.length + area.length).toBe(all.length);
      expect(per.length).toBeGreaterThan(all.length * 0.3);
      expect(area.length).toBeGreaterThan(all.length * 0.3);
      for (const t of all) expect(t.mode).toBe("cut");
    });

    it("perimeter adds all four sides; area multiplies; both within the level's side ceiling", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("area-perimeter", level)) {
          const [w, d] = /(\d+) by (\d+)/.exec(t.prompt)!.slice(1).map(Number);
          expect(Math.max(w, d)).toBeLessThanOrEqual(RECT_MAX[level]);
          expect(Math.min(w, d)).toBeGreaterThanOrEqual(2);
          if (t.unit === "feet") {
            expect(t.answer).toBe(String(2 * (w + d)));
            expect(t.bridge).toBe(`${w} + ${d} + ${w} + ${d} = ${2 * (w + d)}`);
            expect(t.id).toBe(`area-perimeter:cut:per:${w}x${d}`);
          } else {
            expect(t.answer).toBe(String(w * d));
            expect(t.bridge).toBe(`${w} × ${d} = ${w * d}`);
            expect(t.id).toBe(`area-perimeter:cut:area:${w}x${d}`);
          }
          expect(t.step).toBe("1");
          expect(Number(t.maxLength)).toBeGreaterThan(Number(t.answer));
        }
      }
    });

    it("reaches the level ceiling", () => {
      const sides = tasksOf("area-perimeter", 4).flatMap((t) => /(\d+) by (\d+)/.exec(t.prompt)!.slice(1).map(Number));
      expect(Math.max(...sides)).toBe(RECT_MAX[4]);
    });
  });

  describe("frac-unit", () => {
    it("cuts a 1-foot beam into n equal parts: the answer is 1/n", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("frac-unit", level)) {
          const n = Number(/into (\d+) equal parts/.exec(t.prompt)![1]);
          expect(t.prompt).toMatch(/1-foot/);
          expect(t.answer).toBe(`1/${n}`);
          expect(t.maxLength).toBe("1");
          expect(t.bridge).toBe(`1 ÷ ${n} = 1/${n}`);
        }
      }
    });

    it("steps on a finer grid than the answer, and the answer sits on that grid", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("frac-unit", level)) {
          expect(t.step).toBe("1/24");
          expect(t.step).not.toBe(t.answer);
          expect(24 % denom(t.answer!)).toBe(0);
        }
      }
    });

    it("answers a quarter for a quarter, a half for a half", () => {
      const byN = new Map(tasksOf("frac-unit", 1).map((t) => [/into (\d+) equal/.exec(t.prompt)![1], t.answer]));
      expect(byN.get("4")).toBe("1/4");
      expect(byN.get("2")).toBe("1/2");
    });
  });

  describe("frac-equiv", () => {
    it("assembles to a reduced fraction from pieces in mixed denominators, one denominator nested in the other", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("frac-equiv", level)) {
          expect(t.mode).toBe("assemble");
          expect(t.pieces!.length).toBeGreaterThanOrEqual(4);
          expect(t.pieces!.length).toBeLessThanOrEqual(5);
          const [a, b] = solutionPair(t);
          expect(denom(a)).not.toBe(denom(b));
          expect(Math.max(denom(a), denom(b)) % Math.min(denom(a), denom(b))).toBe(0);
          expect(denom(t.target!.value)).toBeGreaterThanOrEqual(2);
          expect(num(t.target!.value)).toBeLessThan(1);
          expect(Math.max(denom(a), denom(b))).toBeLessThanOrEqual(EQUIV_DENOM_MAX[level]);
          // stored values and the mark are reduced strings, so equal values are equal strings
          for (const v of [a, b, t.target!.value]) expect(v).toMatch(/^\d+\/\d+$/);
          expect(t.bridge).toBe(`${a} + ${b} = ${t.target!.value}`);
          expect(t.target!.label).toBe(`${t.target!.value} foot`);
        }
      }
    });

    it("accepts any subset that hits the mark, and names the child's own sum on success", () => {
      const t = make("frac-equiv", 2, 6);
      const [i, j] = [...t.solution!].sort((x, y) => x - y);
      expect(measureKind.isCorrect(t, [i, j])).toBe(true);
      expect(measureKind.isCorrect(t, [i])).toBe(false);
      expect(measureKind.bridge!(t, [i, j])).toMatch(/^[\d/]+ \+ [\d/]+ = [\d/]+$/);
    });

    it("decoys come from the pieces' own family: no unrelated denominators give the answer away", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("frac-equiv", level)) {
          for (const p of t.pieces!) expect([7, 11], t.id).not.toContain(denom(p.value));
        }
      }
    });

    it("some decoy runs longer than the mark, on some task (RC-f)", () => {
      const tasks = LEVELS.flatMap((l) => tasksOf("frac-equiv", l));
      expect(tasks.some((t) => t.pieces!.some((p) => num(p.value) > num(t.target!.value)))).toBe(true);
    });
  });

  describe("mul-multi", () => {
    const SHAPES = [[2, 1], [3, 1], [4, 1], [2, 2], [3, 2]];
    it("is rows of stones: r x c, with the digit shapes of the choice ladder", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("mul-multi", level)) {
          const [r, c] = /(\d+) rows of (\d+) stones/.exec(t.prompt)!.slice(1).map(Number);
          expect(String(c)).toHaveLength(SHAPES[level][0]);
          expect(String(r)).toHaveLength(SHAPES[level][1]);
          expect(t.mode).toBe("cut");
          expect(t.answer).toBe(String(r * c));
          expect(t.bridge).toBe(`${r} × ${c} = ${r * c}`);
          expect(t.step).toBe("1");
          expect(Number(t.maxLength)).toBeGreaterThan(r * c);
          expect(t.unit).toBe("stones");
        }
      }
    });

    it("never uses a trailing-zero factor (the product is not a place shift)", () => {
      for (const t of tasksOf("mul-multi", 3)) {
        const [r, c] = /(\d+) rows of (\d+) stones/.exec(t.prompt)!.slice(1).map(Number);
        expect(r % 10).not.toBe(0);
        expect(c % 10).not.toBe(0);
      }
    });
  });

  describe("frac-addsub", () => {
    it("draws both readings: assemble (unlike denominators) and cut (a subtraction)", () => {
      for (const level of LEVELS) {
        const ts = tasksOf("frac-addsub", level);
        expect(ts.filter((t) => t.mode === "assemble").length).toBeGreaterThan(40);
        expect(ts.filter((t) => t.mode === "cut").length).toBeGreaterThan(40);
        for (const t of ts.filter((x) => x.mode === "assemble")) {
          const [a, b] = solutionPair(t);
          expect(denom(a)).not.toBe(denom(b));
          expect(t.bridge).toBe(`${a} + ${b} = ${t.target!.value}`);
          expect(Math.max(denom(a), denom(b))).toBeLessThanOrEqual(ADDSUB_DENOM_MAX[level]);
        }
      }
    });

    it("cut: beam minus the cut is what is left, on a grid of the denominators in play", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("frac-addsub", level).filter((x) => x.mode === "cut")) {
          const beam = t.maxLength!, off = cutOff(t);
          expect(t.bridge).toBe(`${beam} − ${off} = ${t.answer}`);
          const b = rat(beam), o = rat(off);
          expect(sameValue({ n: b.n * o.d - o.n * b.d, d: b.d * o.d }, rat(t.answer!))).toBe(true);
          expect(rat(t.answer!).n > BigInt(0)).toBe(true);
          expect(t.answer).not.toBe(t.maxLength);
          // the step is finer than the grid of the beam's and the cut's denominators, so no answer is one press
          const step = rat(t.step!);
          expect(step.n).toBe(BigInt(1));
          expect(Number(step.d) % denom(beam)).toBe(0);
          expect(Number(step.d) % denom(off)).toBe(0);
          expect(num(t.answer!)).toBeGreaterThan(2 * num(t.step!) - 1e-9);
        }
      }
    });

    it("includes the 7/8 - 1/4 reading, graded by value", () => {
      const hit = LEVELS.flatMap((l) => tasksOf("frac-addsub", l)).find((t) => t.mode === "cut" && t.bridge === "7/8 − 1/4 = 5/8");
      expect(hit).toBeDefined();
      expect(hit!.step).toBe("1/16");
      expect(measureKind.isCorrect(hit!, "5/8")).toBe(true);
      expect(measureKind.isCorrect(hit!, "0.625")).toBe(true);
      expect(measureKind.feedback(hit!, "1/2")).toBe("too_short");
    });

    it("lets a total pass one only from level 3, and an improper operand only at level 4", () => {
      const over = (l: number) => tasksOf("frac-addsub", l).filter((t) => t.mode === "assemble" && num(t.target!.value) > 1).length;
      expect(over(0) + over(1) + over(2)).toBe(0);
      expect(over(3) + over(4)).toBeGreaterThan(0);
      const improper = (l: number) =>
        tasksOf("frac-addsub", l).filter((t) => t.mode === "assemble" && t.solution!.some((k) => num(t.pieces![k].value) > 1)).length;
      expect(improper(3)).toBe(0);
      expect(improper(4)).toBeGreaterThan(0);
    });
  });

  describe("dec-ops", () => {
    it("draws both readings, and every value is a decimal string with no trailing zero", () => {
      for (const level of LEVELS) {
        const ts = tasksOf("dec-ops", level);
        expect(ts.filter((t) => t.mode === "assemble").length).toBeGreaterThan(40);
        expect(ts.filter((t) => t.mode === "cut").length).toBeGreaterThan(40);
        for (const t of ts) {
          const values = [...(t.pieces ?? []).map((p) => p.value), ...(t.target ? [t.target.value] : []), t.answer, t.maxLength].filter((v): v is string => !!v);
          for (const v of values) expect(v, t.id).toMatch(/^\d+(\.\d*[1-9])?$/);
        }
      }
    });

    it("assemble: the stored two decimals make the mark exactly, written as 1.25 + 0.5 = 1.75", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("dec-ops", level).filter((x) => x.mode === "assemble")) {
          expect(sameValue(sumOf(t, t.solution!), rat(t.target!.value))).toBe(true);
          const [a, b] = solutionPair(t);
          expect(t.bridge).toBe(`${a} + ${b} = ${t.target!.value}`);
          expect(num(a)).toBeGreaterThan(0);
        }
      }
    });

    it("cut: beam minus the cut, on a hundredths stepper, with at least two steps left", () => {
      for (const level of LEVELS) {
        for (const t of tasksOf("dec-ops", level).filter((x) => x.mode === "cut")) {
          const beam = t.maxLength!, off = cutOff(t);
          expect(t.bridge).toBe(`${beam} − ${off} = ${t.answer}`);
          expect(t.step).toBe("0.01");
          expect(num(t.answer!)).toBeGreaterThanOrEqual(0.02);
          expect(num(beam)).toBeLessThanOrEqual(DEC_WHOLE_MAX[level] + 1);
          expect(num(t.answer!)).toBeGreaterThan(0);
        }
      }
    });

    it("grades equivalent forms of a cut as right", () => {
      for (const t of LEVELS.flatMap((l) => tasksOf("dec-ops", l)).filter((x) => x.mode === "cut")) {
        const exact = formatRational(rat(t.answer!), "fraction");
        expect(measureKind.isCorrect(t, exact), t.id).toBe(true);
        expect(measureKind.isCorrect(t, formatRational(rat(t.answer!), "decimal")), t.id).toBe(true);
      }
    });
  });

  it("says '1 foot', never '1 feet', and 'feet' only for more than one", () => {
    const texts = G35.flatMap((s) => LEVELS.flatMap((l) => tasksOf(s, l))).flatMap((t) =>
      [t.prompt, t.explain ?? "", ...(t.pieces ?? []).map((p) => p.label), t.target?.label ?? ""]);
    for (const x of texts) {
      expect(x).not.toMatch(/(?<![\d./])1 feet\b/);
      for (const m of x.matchAll(/\b(\d+)\/(\d+) feet\b/g)) expect(Number(m[1])).toBeGreaterThan(Number(m[2]));
      for (const m of x.matchAll(/\b(\d+\/\d+) foot\b/g)) expect(num(m[1])).toBeLessThanOrEqual(1);
    }
  });
});
