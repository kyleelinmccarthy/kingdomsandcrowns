import { describe, expect, it } from "vitest";
import { ONE_STEP_KINDS, seededRng } from "@/lib/utils/drill-generators";
import {
  POLY_SPAN, QUAD_ROOT_HIGH, SEQ_DIFF_MAX, SEQ_RATIO_MAX, SEQ_START_MAX, SEQ_TERM_MAX, SEQ_TERM_VALUE_MAX,
  SIMILAR_SCALE_MAX, SIMILAR_SIDE_MAX, SYSTEM_COEF_MAX, SYSTEM_SOLUTION_MAX, TRIG_HYP_MAX, UNIT_CIRCLE_REACH,
} from "@/lib/utils/generators/high";
import { BENCH } from ".";
import { TRIG_TABLE } from "./g912";
import { parseAnswer, type Rational } from "../parse-answer";
import type { MeasureTask } from "../types";

const G912 = ["one-step-eq", "systems-eq", "similar-tri", "trig-ratios", "quad-formula", "poly-ops", "sequences", "unit-circle"];
const make = (skillId: string, level: number, seed: number): MeasureTask => BENCH[skillId](level, seededRng(seed), skillId)!;
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const LEVELS = [0, 1, 2, 3, 4];
const tasksOf = (skillId: string, level: number) => seeds.map((seed) => make(skillId, level, seed));
const rat = (s: string): Rational => parseAnswer(s)!;
const num = (s: string) => { const r = rat(s); return Number(r.n) / Number(r.d); };
/** Floats from exact hundredths, compared at the hundredth. */
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const all = (skillId: string) => LEVELS.flatMap((l) => tasksOf(skillId, l));

describe("grade 9-12 bench (R-C3)", () => {
  it("registers the eight grade 9-12 skills, all cuts", () => {
    for (const s of G912) {
      expect(BENCH[s], s).toBeTypeOf("function");
      for (const l of LEVELS) for (const t of tasksOf(s, l)) expect(t.mode, t.id).toBe("cut");
    }
  });

  it("clamps out-of-range levels", () => {
    for (const s of G912) {
      expect(make(s, 9, 4)).toEqual(make(s, 4, 4));
      expect(make(s, -3, 4)).toEqual(make(s, 0, 4));
    }
  });

  it("never lets a cut's step give the answer away: the answer is at least two steps", () => {
    for (const s of G912) {
      for (const t of all(s)) expect(num(t.answer!), t.id).toBeGreaterThanOrEqual(2 * num(t.step!));
    }
  });

  it("uses one step per level and skill, so the step never says which task is which", () => {
    for (const s of G912) {
      for (const l of LEVELS) expect(new Set(tasksOf(s, l).map((t) => t.step)).size, `${s} level ${l}`).toBe(1);
    }
  });

  describe("one-step-eq", () => {
    const kind = (l: number, k: string) => tasksOf("one-step-eq", l).filter((t) => t.id.includes(`:${k}:`));

    it("draws the kinds the choice ladder does at each level", () => {
      for (const l of LEVELS) {
        const present = new Set(tasksOf("one-step-eq", l).map((t) => t.id.split(":")[2]));
        expect([...present].sort(), `level ${l}`).toEqual([...ONE_STEP_KINDS[l]].sort());
      }
    });

    it("add: x + a = total, so x = total - a", () => {
      for (const l of [0, 3, 4]) {
        for (const t of kind(l, "add")) {
          const [a, total, a2, total2] = /splices (\d+) (?:foot|feet) onto a \w+, and it reaches (\d+) feet: x \+ (\d+) = (\d+)\./.exec(t.prompt)!.slice(1).map(Number);
          expect([a, total]).toEqual([a2, total2]);
          expect(num(t.answer!), t.id).toBe(total - a);
          expect(t.bridge, t.id).toBe(`${total} − ${a} = ${total - a}`);
        }
      }
    });

    it("sub: x - a = b, so x = a + b", () => {
      for (const l of [1, 3, 4]) {
        for (const t of kind(l, "sub")) {
          const [a, b, a2, b2] = /trims (\d+) (?:foot|feet) off a \w+, leaving (\d+) (?:foot|feet): x − (\d+) = (\d+)\./.exec(t.prompt)!.slice(1).map(Number);
          expect([a, b]).toEqual([a2, b2]);
          expect(num(t.answer!), t.id).toBe(a + b);
          expect(t.bridge, t.id).toBe(`${b} + ${a} = ${a + b}`);
        }
      }
    });

    it("mul: a equal planks make total, so x = total / a; halves only from level 3, with a half-foot step", () => {
      for (const l of [2, 3, 4]) {
        for (const t of kind(l, "mul")) {
          const [a, total, a2, total2] = /^(\d+) equal planks laid end to end make (\d+) feet: (\d+)x = (\d+)\./.exec(t.prompt)!.slice(1).map(Number);
          expect([a, total]).toEqual([a2, total2]);
          expect(close(num(t.answer!) * a, total), t.id).toBe(true);
          expect(t.bridge, t.id).toBe(`${total} ÷ ${a} = ${t.answer}`);
          if (l < 3) expect(Number.isInteger(num(t.answer!)), t.id).toBe(true);
        }
      }
      const halves = (l: number) => tasksOf("one-step-eq", l).filter((t) => t.answer!.endsWith(".5"));
      for (const l of [0, 1, 2]) expect(halves(l)).toHaveLength(0);
      for (const l of [3, 4]) {
        expect(halves(l).length).toBeGreaterThan(3);
        for (const t of tasksOf("one-step-eq", l)) expect(t.step).toBe("0.5");
      }
    });

    it("div: a parts of q feet, so x = a * q", () => {
      expect(kind(3, "div")).toHaveLength(0);
      expect(kind(4, "div").length).toBeGreaterThan(20);
      for (const t of kind(4, "div")) {
        const [a, q, a2, q2] = /is cut into (\d+) equal parts of (\d+) feet each: x ÷ (\d+) = (\d+)\./.exec(t.prompt)!.slice(1).map(Number);
        expect([a, q]).toEqual([a2, q2]);
        expect(num(t.answer!), t.id).toBe(a * q);
        expect(t.bridge, t.id).toBe(`${a} × ${q} = ${a * q}`);
      }
    });
  });

  describe("systems-eq", () => {
    const parse = (t: MeasureTask) => {
      const m = /^(\d+) long planks? and (\d+) short ones? make (\d+) feet; (\d+) long and (\d+) short make (\d+) feet\. How long is a (long|short) plank\?$/.exec(t.prompt);
      return m ? { a: +m[1], b: +m[2], t1: +m[3], c: +m[4], d: +m[5], t2: +m[6], ask: m[7] } : null;
    };

    it("levels 0-1: a long and a short plank make the sum, the long one is d longer", () => {
      for (const l of [0, 1]) {
        for (const t of tasksOf("systems-eq", l)) {
          const m = /^A long plank and a short plank end to end make (\d+) feet\. The long one is (\d+) (?:foot|feet) longer\. How long is the (long|short) plank\?$/.exec(t.prompt)!;
          const [sum, d] = [+m[1], +m[2]];
          const long = (sum + d) / 2;
          const short = (sum - d) / 2;
          expect(Number.isInteger(long), t.id).toBe(true);
          expect(short, t.id).toBeGreaterThanOrEqual(2);
          expect(long, t.id).toBeLessThanOrEqual(SYSTEM_SOLUTION_MAX[l]);
          expect(num(t.answer!), t.id).toBe(m[3] === "long" ? long : short);
          expect(t.bridge, t.id).toBe(`x + y = ${sum}, x − y = ${d}, so ${m[3] === "long" ? "x" : "y"} = ${t.answer}`);
          if (l === 0) expect(m[3]).toBe("long");
        }
        expect(tasksOf("systems-eq", l).filter((t) => /short plank\?$/.test(t.prompt)).length > 0).toBe(l === 1);
      }
    });

    it("levels 2+: two mixes of long and short planks have one solution, and the answer solves both", () => {
      for (const l of [2, 3, 4]) {
        const tasks = tasksOf("systems-eq", l);
        for (const t of tasks) {
          const p = parse(t)!;
          expect(p, t.prompt).not.toBeNull();
          for (const k of [p.a, p.b, p.c, p.d]) {
            expect(k).toBeGreaterThanOrEqual(1);
            expect(k).toBeLessThanOrEqual(SYSTEM_COEF_MAX[l]);
          }
          expect(p.a * p.d - p.b * p.c, t.id).not.toBe(0);
          // Cramer's rule, from the prompt alone.
          const det = p.a * p.d - p.b * p.c;
          const long = (p.t1 * p.d - p.b * p.t2) / det;
          const short = (p.a * p.t2 - p.t1 * p.c) / det;
          expect(Number.isInteger(long) && Number.isInteger(short), t.id).toBe(true);
          expect(short, t.id).toBeGreaterThanOrEqual(2);
          expect(long, t.id).toBeGreaterThan(short);
          expect(long, t.id).toBeLessThanOrEqual(SYSTEM_SOLUTION_MAX[l]);
          const x = p.ask === "long" ? long : short;
          expect(num(t.answer!), t.id).toBe(x);
          const term = (k: number, v: string) => `${k === 1 ? "" : k}${v}`;
          expect(t.bridge, t.id).toBe(`${term(p.a, "x")} + ${term(p.b, "y")} = ${p.t1}, ${term(p.c, "x")} + ${term(p.d, "y")} = ${p.t2}, so ${p.ask === "long" ? "x" : "y"} = ${x}`);
        }
        expect(tasks.some((t) => parse(t)!.ask === "long")).toBe(true);
        expect(tasks.some((t) => parse(t)!.ask === "short")).toBe(true);
      }
    });
  });

  describe("similar-tri", () => {
    it("a post and its shadow scale to the tower and its shadow, within the choice ladder", () => {
      for (const l of LEVELS) {
        for (const t of tasksOf("similar-tri", l)) {
          const m = /^An? (\d+)-foot (\w+) casts an? (\d+)-foot shadow\. The (\w+)'s shadow is (\d+) feet long\. How tall is the (\w+)\?$/.exec(t.prompt)!;
          expect(m, t.prompt).not.toBeNull();
          const [h, s, shadow] = [+m[1], +m[3], +m[5]];
          expect(m[4]).toBe(m[6]);
          expect(h, t.id).toBeLessThanOrEqual(SIMILAR_SIDE_MAX[l]);
          expect(s, t.id).toBeLessThanOrEqual(SIMILAR_SIDE_MAX[l]);
          expect(h).not.toBe(s);
          const answer = (h * shadow) / s;
          expect(Number.isInteger(answer), t.id).toBe(true);
          expect(shadow / s, t.id).toBeLessThanOrEqual(SIMILAR_SCALE_MAX[l] * 1.0001);
          expect(answer, t.id).toBeGreaterThan(h);
          expect(num(t.answer!), t.id).toBe(answer);
          expect(t.bridge, t.id).toBe(`${h} ÷ ${s} × ${shadow} = ${answer}`);
        }
      }
    });
  });

  describe("trig-ratios", () => {
    it("the stated values are the real sines, cosines and tangents to two places", () => {
      for (const [deg, [sin, cos, tan]] of Object.entries(TRIG_TABLE)) {
        const r = (Number(deg) * Math.PI) / 180;
        expect(Math.abs(sin / 100 - Math.sin(r)), `sin ${deg}`).toBeLessThanOrEqual(0.0051);
        expect(Math.abs(cos / 100 - Math.cos(r)), `cos ${deg}`).toBeLessThanOrEqual(0.0051);
        expect(Math.abs(tan / 100 - Math.tan(r)), `tan ${deg}`).toBeLessThanOrEqual(0.0051);
      }
    });

    it("the answer is the length times the stated value, exact in hundredths, tolerance a hundredth", () => {
      const ratios = (l: number) => new Set(tasksOf("trig-ratios", l).map((t) => /\((sin|cos|tan) /.exec(t.prompt)![1]));
      expect([...ratios(0)]).toEqual(["sin"]);
      expect([...ratios(1)].sort()).toEqual(["cos", "sin"]);
      expect([...ratios(2)].sort()).toEqual(["cos", "sin"]);
      for (const l of [3, 4]) expect([...ratios(l)].sort()).toEqual(["cos", "sin", "tan"]);
      for (const l of LEVELS) {
        for (const t of tasksOf("trig-ratios", l)) {
          const m = /\((sin|cos|tan) (\d+)° ([=≈]) ([\d.]+)\)/.exec(t.prompt)!;
          const [ratio, deg, value] = [m[1], +m[2], m[4]];
          const stated = TRIG_TABLE[deg][ratio === "sin" ? 0 : ratio === "cos" ? 1 : 2];
          expect(num(value) * 100, t.id).toBeCloseTo(stated, 6);
          expect(m[3], t.id).toBe(value === "0.5" ? "=" : "≈");
          const length = Number(/(?:is|of) (\d+) feet/.exec(t.prompt)?.[1] ?? /(\d+) feet from/.exec(t.prompt)![1]);
          if (ratio !== "tan") expect(length, t.id).toBeLessThanOrEqual(TRIG_HYP_MAX[l]);
          expect(num(t.answer!) * 100, t.id).toBeCloseTo(length * stated, 6);
          expect(t.bridge, t.id).toBe(`${length} × ${value} = ${t.answer}`);
          expect(t.tolerance).toBe("0.01");
          expect(t.step).toBe("0.01");
        }
      }
    });

    it("asks sin for the rise of a rafter, cos for the reach along the ground, tan for a ladder or ramp's rise", () => {
      for (const t of all("trig-ratios")) {
        if (/\(sin /.test(t.prompt)) expect(t.prompt, t.id).toMatch(/How high does it rise\?$/);
        if (/\(cos /.test(t.prompt)) expect(t.prompt, t.id).toMatch(/How far does it reach along the ground\?$/);
        if (/\(tan /.test(t.prompt)) expect(t.prompt, t.id).toMatch(/How high does it reach\?$/);
      }
    });
  });

  describe("quad-formula", () => {
    it("level 0: a square yard of n flagstones has a side of sqrt(n)", () => {
      for (const t of tasksOf("quad-formula", 0)) {
        const n = Number(/paved with (\d+) flagstones/.exec(t.prompt)![1]);
        expect(num(t.answer!) ** 2, t.id).toBe(n);
        expect(Number.isInteger(num(t.answer!)), t.id).toBe(true);
        expect(t.bridge, t.id).toBe(`x × x = ${n}, so x = ${t.answer}`);
      }
    });

    it("a floor d feet longer than wide, covering A square feet: x(x + d) = A with x positive", () => {
      const rects = (l: number) => tasksOf("quad-formula", l).filter((t) => t.id.includes(":rect:"));
      expect(rects(0)).toHaveLength(0);
      for (const l of [1, 2, 3, 4]) {
        expect(rects(l).length).toBeGreaterThan(30);
        for (const t of rects(l)) {
          const m = /^A floor covers ([\d.]+) square feet and is (\d+) (?:foot|feet) longer than it is wide\. How wide is it\?$/.exec(t.prompt)!;
          const [area, d, x] = [num(m[1]), +m[2], num(t.answer!)];
          expect(close(x * (x + d), area), t.id).toBe(true);
          expect(x, t.id).toBeGreaterThanOrEqual(2);
          expect(d, t.id).toBeLessThanOrEqual(QUAD_ROOT_HIGH[l]);
          expect(t.bridge, t.id).toBe(`x × (x + ${d}) = ${m[1]}, so x = ${t.answer}`);
        }
      }
    });

    it("squares stay on the early rungs of the rectangle ladder, halves come at level 3 with a half-foot step", () => {
      for (const l of [2, 3, 4]) expect(tasksOf("quad-formula", l).filter((t) => t.id.includes(":sq:"))).toHaveLength(0);
      expect(tasksOf("quad-formula", 1).filter((t) => t.id.includes(":sq:")).length).toBeGreaterThan(20);
      const halves = (l: number) => tasksOf("quad-formula", l).filter((t) => t.answer!.endsWith(".5"));
      for (const l of [0, 1, 2]) expect(halves(l)).toHaveLength(0);
      for (const l of [3, 4]) {
        expect(halves(l).length).toBeGreaterThan(10);
        for (const t of tasksOf("quad-formula", l)) expect(t.step).toBe("0.5");
      }
    });
  });

  describe("poly-ops", () => {
    const evalFactor = (text: string, x: number) => {
      const m = /^x ([+−]) (\d+)$/.exec(text)!;
      return m[1] === "+" ? x + +m[2] : x - +m[2];
    };

    it("factored frames (and chests, level 4): multiply the factors at x", () => {
      for (const l of LEVELS) {
        for (const t of tasksOf("poly-ops", l).filter((u) => u.id.includes(":fac:"))) {
          const m = /^The mason's frame covers ((?:\([^)]+\))+) square feet\. If x = (\d+), how many square feet is that\?$/.exec(t.prompt)
            ?? /^The joiner's chest holds ((?:\([^)]+\))+) cubic feet\. If x = (\d+), how many cubic feet is that\?$/.exec(t.prompt)!;
          const x = +m[2];
          const factors = m[1].slice(1, -1).split(")(");
          const values = factors.map((f) => evalFactor(f, x));
          for (const v of values) expect(v, t.id).toBeGreaterThanOrEqual(1);
          const product = values.reduce((a, b) => a * b, 1);
          expect(num(t.answer!), t.id).toBe(product);
          expect(product, t.id).toBeGreaterThanOrEqual(4);
          expect(t.bridge, t.id).toBe(`${factors.map((f) => `(${f.replace("x", String(x))})`).join(" × ")} = ${product}`);
          for (const f of factors) expect(+/(\d+)$/.exec(f)![1], t.id).toBeLessThanOrEqual(l === 4 && factors.length === 3 ? 4 : POLY_SPAN[l]);
        }
      }
    });

    it("subtraction inside a factor joins at level 1; expanded floors at level 3; three-factor chests at level 4", () => {
      const has = (l: number, f: (t: MeasureTask) => boolean) => tasksOf("poly-ops", l).filter(f).length;
      expect(has(0, (t) => t.prompt.includes("−"))).toBe(0);
      expect(has(1, (t) => /\(x −/.test(t.prompt))).toBeGreaterThan(10);
      for (const l of [0, 1, 2]) expect(has(l, (t) => t.id.includes(":exp:"))).toBe(0);
      for (const l of [3, 4]) expect(has(l, (t) => t.id.includes(":exp:"))).toBeGreaterThan(20);
      for (const l of [0, 1, 2, 3]) expect(has(l, (t) => t.prompt.includes("chest"))).toBe(0);
      expect(has(4, (t) => t.prompt.includes("chest"))).toBeGreaterThan(20);
    });

    it("an expanded floor x^2 + bx + c evaluates at x, and the bridge is the evaluation", () => {
      for (const l of [3, 4]) {
        for (const t of tasksOf("poly-ops", l).filter((u) => u.id.includes(":exp:"))) {
          const m = /^The mason's floor covers x² (?:([+−]) (\d*)x )?([+−]) (\d+) square feet\. If x = (\d+), how many square feet is that\?$/.exec(t.prompt)!;
          expect(m, t.prompt).not.toBeNull();
          const x = +m[5];
          const b = m[1] ? (m[1] === "+" ? 1 : -1) * (m[2] === "" ? 1 : +m[2]) : 0;
          const c = (m[3] === "+" ? 1 : -1) * +m[4];
          const value = x * x + b * x + c;
          expect(num(t.answer!), t.id).toBe(value);
          expect(value, t.id).toBeGreaterThanOrEqual(4);
          expect(t.bridge.endsWith(`= ${value}`), t.id).toBe(true);
          expect(t.bridge.startsWith(`${x}² `), t.id).toBe(true);
        }
      }
    });
  });

  describe("sequences", () => {
    const arith = (l: number) => tasksOf("sequences", l).filter((t) => t.id.includes(":arith:") || t.id.includes(":down:"));
    const plural = (n: number) => (n === 1 ? "stone" : "stones");

    it("arithmetic: row n has a + (n - 1) * d stones, within the choice ladder", () => {
      for (const l of [0, 1, 2]) {
        for (const t of tasksOf("sequences", l).filter((u) => u.id.includes(":arith:"))) {
          const [a, d, n] = /^Row 1 of the cairn has (\d+) stones?, and each row after has (\d+) more\. How many stones are in row (\d+)\?$/.exec(t.prompt)!.slice(1).map(Number);
          expect(a, t.id).toBeLessThanOrEqual(SEQ_START_MAX[l]);
          expect(d, t.id).toBeGreaterThanOrEqual(2);
          expect(d, t.id).toBeLessThanOrEqual(SEQ_DIFF_MAX[l]);
          expect(n, t.id).toBeGreaterThanOrEqual(5);
          expect(n, t.id).toBeLessThanOrEqual(SEQ_TERM_MAX[l]);
          expect(num(t.answer!), t.id).toBe(a + (n - 1) * d);
          expect(t.bridge, t.id).toBe(`${a} + ${n - 1} × ${d} = ${a + (n - 1) * d}`);
          expect(t.prompt).toContain(`${a} ${plural(a)}`);
        }
      }
    });

    it("'fewer' rows count down from level 2, never below two stones", () => {
      for (const l of [0, 1]) expect(tasksOf("sequences", l).filter((t) => t.id.includes(":down:"))).toHaveLength(0);
      expect(tasksOf("sequences", 2).filter((t) => t.id.includes(":down:")).length).toBeGreaterThan(30);
      for (const t of tasksOf("sequences", 2).filter((u) => u.id.includes(":down:"))) {
        const [a, d, n] = /^Row 1 of the cairn has (\d+) stones, and each row after has (\d+) fewer\. How many stones are in row (\d+)\?$/.exec(t.prompt)!.slice(1).map(Number);
        expect(num(t.answer!), t.id).toBe(a - (n - 1) * d);
        expect(num(t.answer!), t.id).toBeGreaterThanOrEqual(2);
        expect(t.bridge, t.id).toBe(`${a} − ${n - 1} × ${d} = ${a - (n - 1) * d}`);
      }
      expect(arith(2).length).toBe(200);
    });

    it("geometric from level 3: row n has a * r^(n - 1) stones", () => {
      const sup = (k: number) => String(k).replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]);
      for (const l of [0, 1, 2]) expect(tasksOf("sequences", l).filter((t) => t.id.includes(":geo:"))).toHaveLength(0);
      for (const l of [3, 4]) {
        expect(arith(l)).toHaveLength(0);
        const geos = tasksOf("sequences", l).filter((t) => t.id.includes(":geo:"));
        expect(geos.length).toBeGreaterThan(100);
        for (const t of geos) {
          const [a, r, n] = /^Row 1 of the cairn has (\d+) stones, and each row after has (\d+) times as many as the one before\. How many stones are in row (\d+)\?$/.exec(t.prompt)!.slice(1).map(Number);
          expect(a, t.id).toBeLessThanOrEqual(SEQ_START_MAX[l]);
          expect(r, t.id).toBeLessThanOrEqual(SEQ_RATIO_MAX);
          expect(n, t.id).toBeLessThanOrEqual(SEQ_TERM_MAX[l]);
          expect(num(t.answer!), t.id).toBe(a * r ** (n - 1));
          expect(num(t.answer!), t.id).toBeLessThanOrEqual(SEQ_TERM_VALUE_MAX);
          expect(t.bridge, t.id).toBe(`${a} × ${r}${sup(n - 1)} = ${a * r ** (n - 1)}`);
        }
      }
    });

    it("halving rows join at level 4: row n has the start divided by 2^(n - 1)", () => {
      const sup = (k: number) => String(k).replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]);
      expect(tasksOf("sequences", 3).filter((t) => t.id.includes(":half:"))).toHaveLength(0);
      const halves = tasksOf("sequences", 4).filter((t) => t.id.includes(":half:"));
      expect(halves.length).toBeGreaterThan(30);
      for (const t of halves) {
        const [a, n] = /^Row 1 of the cairn has (\d+) stones, and each row after has half as many as the one before\. How many stones are in row (\d+)\?$/.exec(t.prompt)!.slice(1).map(Number);
        expect(a % 2 ** (n - 1), t.id).toBe(0);
        expect(num(t.answer!), t.id).toBe(a / 2 ** (n - 1));
        expect(num(t.answer!), t.id).toBeGreaterThanOrEqual(2);
        expect(t.bridge, t.id).toBe(`${a} ÷ 2${sup(n - 1)} = ${a / 2 ** (n - 1)}`);
      }
    });
  });

  describe("unit-circle", () => {
    const parse = (t: MeasureTask) => {
      const m = /^A (cart|water) wheel of radius (\d+) feet turns through (?:(\d+)°|(\d*)π(?:\/(\d+))?)\. (How far does it roll|How far does a paddle travel)\? Use 3\.14 for π\.$/.exec(t.prompt)!;
      const r = +m[2];
      const fraction: [number, number] = m[3] ? [+m[3], 180] : [m[4] === "" ? 1 : +m[4], m[5] ? +m[5] : 1];
      return { wheel: m[1], r, degrees: !!m[3], fraction, ask: m[6] };
    };

    it("the arc is radius * angle with pi as 3.14, exact in hundredths, tolerance a hundredth", () => {
      for (const l of LEVELS) {
        for (const t of tasksOf("unit-circle", l)) {
          const { r, fraction: [p, q], degrees } = parse(t);
          const theta = degrees ? (p / q) : p / q; // a fraction of pi either way: degrees p/180
          const k = r * theta;
          expect(Number.isInteger(k), t.id).toBe(true);
          expect(num(t.answer!) * 100, t.id).toBeCloseTo(314 * k, 6);
          expect(r, t.id).toBeGreaterThanOrEqual(2);
          expect(r, t.id).toBeLessThanOrEqual(12);
          expect(t.tolerance).toBe("0.01");
          expect(t.step).toBe("0.01");
          expect(t.bridge.endsWith(`= ${t.answer}`), t.id).toBe(true);
          if (degrees) expect(t.bridge, t.id).toBe(`${r} × 3.14 × ${p} ÷ 180 = ${t.answer}`);
          else {
            const g = (n: number, m: number): number => (m === 0 ? n : g(m, n % m));
            expect(g(p, q), t.id).toBe(1);
            expect(t.bridge, t.id).toBe(`${r}${p > 1 ? ` × ${p}` : ""} × 3.14${q > 1 ? ` ÷ ${q}` : ""} = ${t.answer}`);
          }
        }
      }
    });

    it("reaches round the circle as the choice ladder does: degrees only below level 3, radians from level 3", () => {
      const degreeSet = (l: number) => new Set(tasksOf("unit-circle", l).filter((t) => parse(t).degrees).map((t) => parse(t).fraction[0]));
      const biggest = (l: number) => Math.max(...degreeSet(l));
      expect(biggest(0)).toBeLessThanOrEqual(90);
      expect(biggest(1)).toBeLessThanOrEqual(180);
      expect(biggest(2)).toBeGreaterThan(180);
      expect(UNIT_CIRCLE_REACH.length).toBe(5);
      for (const l of [0, 1, 2]) expect(tasksOf("unit-circle", l).filter((t) => !parse(t).degrees)).toHaveLength(0);
      for (const l of [3, 4]) {
        expect(tasksOf("unit-circle", l).filter((t) => !parse(t).degrees).length).toBeGreaterThan(40);
        expect(tasksOf("unit-circle", l).filter((t) => parse(t).degrees).length).toBeGreaterThan(40);
      }
    });

    it("the textbook reading: a cart wheel of radius 2 turning through pi/2 rolls 3.14 feet", () => {
      const hit = Array.from({ length: 3000 }, (_, i) => make("unit-circle", 4, i + 1)).find((t) => t.prompt.startsWith("A cart wheel of radius 2 feet turns through π/2."));
      expect(hit?.answer).toBe("3.14");
      expect(hit?.bridge).toBe("2 × 3.14 ÷ 2 = 3.14");
    });
  });
});
