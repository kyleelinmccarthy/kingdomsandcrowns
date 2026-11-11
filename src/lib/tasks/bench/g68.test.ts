import { describe, expect, it } from "vitest";
import { PERCENT_BASE_MAX, seededRng } from "@/lib/utils/drill-generators";
import {
  CIRCLE_RADIUS_MAX, LINEAR_CONST_MAX, PROP_COUNT_MAX, PROP_UNIT_MAX, PYTHAGOREAN_TRIPLES, RATE_TOTAL_MAX, TRIPLE_HYP_MAX,
} from "@/lib/utils/generators/middle";
import { BENCH } from ".";
import { measureKind } from "../measure";
import { parseAnswer, type Rational } from "../parse-answer";
import type { MeasureTask } from "../types";

const G68 = ["ratio-rate", "percent-of", "proportion", "circle-measure", "pythagorean", "linear-eq"];
const make = (skillId: string, level: number, seed: number): MeasureTask => BENCH[skillId](level, seededRng(seed), skillId)!;
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const LEVELS = [0, 1, 2, 3, 4];
const tasksOf = (skillId: string, level: number) => seeds.map((seed) => make(skillId, level, seed));
const rat = (s: string): Rational => parseAnswer(s)!;
const num = (s: string) => { const r = rat(s); return Number(r.n) / Number(r.d); };
const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

describe("grade 6-8 bench (R-C3)", () => {
  it("registers the six grade 6-8 skills, all cuts", () => {
    for (const s of G68) {
      expect(BENCH[s], s).toBeTypeOf("function");
      for (const l of LEVELS) for (const t of tasksOf(s, l)) expect(t.mode, t.id).toBe("cut");
    }
  });

  it("clamps out-of-range levels", () => {
    for (const s of G68) {
      expect(make(s, 9, 4)).toEqual(make(s, 4, 4));
      expect(make(s, -3, 4)).toEqual(make(s, 0, 4));
    }
  });

  describe("ratio-rate", () => {
    const mixes = (l: number) => tasksOf("ratio-rate", l).filter((t) => t.id.includes(":mix:"));
    const rates = (l: number) => tasksOf("ratio-rate", l).filter((t) => t.id.includes(":rate:"));

    it("draws both readings", () => {
      for (const l of LEVELS) {
        expect(mixes(l).length).toBeGreaterThan(40);
        expect(rates(l).length).toBeGreaterThan(40);
      }
    });

    it("a mix scales the lime by the sand: n sand at a to b gives n / a * b", () => {
      for (const l of LEVELS) {
        for (const t of mixes(l)) {
          const [a, b, n] = /takes (\d+) buckets of \w+ to every (\d+) of \w+\. For (\d+)/.exec(t.prompt)?.slice(1).map(Number)
            ?? /(\d+) pots of red to every (\d+) of white\. For (\d+)/.exec(t.prompt)!.slice(1).map(Number);
          expect(n % a, t.id).toBe(0);
          expect(t.answer, t.id).toBe(String((n / a) * b));
          expect(a).not.toBe(b);
          expect(t.bridge, t.id).toBe(b === 1 ? `${n} ÷ ${a} = ${n / a}` : `${n} ÷ ${a} × ${b} = ${(n / a) * b}`);
          if (l === 0) expect(b).toBe(1);
        }
      }
    });

    it("a unit rate divides exactly, within the choice ladder's distance", () => {
      for (const l of LEVELS) {
        for (const t of rates(l)) {
          const [d, h] = /(\d+) feet of [\w -]+ in (\d+) hours/.exec(t.prompt)!.slice(1).map(Number);
          expect(d, t.id).toBeLessThanOrEqual(RATE_TOTAL_MAX[l]);
          expect(h, t.id).toBeGreaterThanOrEqual(2);
          expect(t.answer).toBe(String(d / h));
          expect(Number.isInteger(d / h)).toBe(true);
          expect(t.bridge).toBe(`${d} ÷ ${h} = ${d / h}`);
        }
      }
    });
  });

  describe("percent-of", () => {
    it("takes p percent of a whole, within the choice ladder's base", () => {
      for (const l of LEVELS) {
        for (const t of tasksOf("percent-of", l)) {
          const [p, n] = /(\d+)%[^.]*?(\d+)/.exec(t.prompt)?.slice(1).map(Number) ?? /Trim (\d+)% off an? (\d+)-foot/.exec(t.prompt)!.slice(1).map(Number);
          expect(n, t.id).toBeLessThanOrEqual(PERCENT_BASE_MAX[l]);
          expect((p * n) % 100, t.id).toBe(0);
          expect(t.answer, t.id).toBe(String((p * n) / 100));
          expect(t.bridge, t.id).toBe(`${p}% × ${n} = ${(p * n) / 100}`);
          expect(t.maxLength, t.id).toBe(String(n));
          if (l === 0) expect([10, 50]).toContain(p);
          else expect(p % 5).toBe(0);
        }
      }
    });

    it("asks for the piece trimmed off, in feet, when the whole is a beam", () => {
      const beams = LEVELS.flatMap((l) => tasksOf("percent-of", l)).filter((t) => t.unit === "feet");
      expect(beams.length).toBeGreaterThan(100);
      for (const t of beams) {
        expect(t.prompt).toMatch(/^Trim \d+% off an? \d+-foot beam\./);
        expect(t.prompt).toMatch(/trimmed off\?$/);
        expect(nums(t.prompt)[1]).toBeLessThanOrEqual(60);
      }
    });
  });

  describe("proportion", () => {
    it("a scale plan: inches on the plan times feet to the inch, within the choice ladder", () => {
      for (const l of LEVELS) {
        const plans = tasksOf("proportion", l).filter((t) => t.id.includes(":plan:"));
        expect(plans.length).toBeGreaterThan(40);
        for (const t of plans) {
          const [k, w] = /1 inch stands for (\d+) feet\. .*? ([\d.]+) inches on the plan/.exec(t.prompt)!.slice(1).map(Number);
          expect(k, t.id).toBeGreaterThanOrEqual(2);
          expect(k, t.id).toBeLessThanOrEqual(PROP_UNIT_MAX[l]);
          expect(w, t.id).toBeLessThanOrEqual(PROP_COUNT_MAX[l]);
          expect(w * k, t.id).toBe(num(t.answer!));
          expect(Number.isInteger(w * k)).toBe(true);
          expect(t.bridge, t.id).toBe(`${/ ([\d.]+) inches/.exec(t.prompt)![1]} × ${k} = ${t.answer}`);
          if (l < 2) expect(Number.isInteger(w), t.id).toBe(true);
        }
      }
    });

    it("half-inches on the plan appear from level 2, with an even scale so the answer stays whole", () => {
      const halves = (l: number) => tasksOf("proportion", l).filter((t) => /\d\.5 inches/.test(t.prompt));
      expect(halves(0)).toHaveLength(0);
      expect(halves(1)).toHaveLength(0);
      for (const l of [2, 3, 4]) {
        expect(halves(l).length).toBeGreaterThan(5);
        for (const t of halves(l)) expect(Number(/stands for (\d+) feet/.exec(t.prompt)![1]) % 2).toBe(0);
      }
    });

    it("a weight reading scales n1 to n2 by the unit weight, never at equal counts", () => {
      for (const l of LEVELS) {
        const weighs = tasksOf("proportion", l).filter((t) => t.id.includes(":weigh:"));
        expect(weighs.length).toBeGreaterThan(40);
        for (const t of weighs) {
          const [n1, given, n2] = /^(\d+) [\w ]+ weigh (\d+) pounds\. How many pounds do (\d+)/.exec(t.prompt)!.slice(1).map(Number);
          expect(n1).not.toBe(n2);
          expect(given % n1).toBe(0);
          const unit = given / n1;
          expect(unit).toBeGreaterThanOrEqual(2);
          expect(unit).toBeLessThanOrEqual(PROP_UNIT_MAX[l]);
          expect(t.answer).toBe(String(unit * n2));
          expect(t.bridge).toBe(`${given} ÷ ${n1} × ${n2} = ${unit * n2}`);
        }
      }
    });
  });

  describe("circle-measure", () => {
    it("states pi as 3.14 and takes a tolerance of a hundredth", () => {
      for (const l of LEVELS) {
        for (const t of tasksOf("circle-measure", l)) {
          expect(t.prompt, t.id).toContain("Use 3.14 for pi.");
          expect(t.tolerance).toBe("0.01");
          expect(t.step).toBe("0.01");
        }
      }
    });

    it("circumference is 2 * 3.14 * r, area 3.14 * r * r, exact in hundredths, within the choice ladder's radius", () => {
      for (const l of LEVELS) {
        const all = tasksOf("circle-measure", l);
        for (const t of all) {
          const area = t.unit === "square feet";
          const given = Number(/\b(?:radius of|is) (\d+) feet/.exec(t.prompt)?.[1] ?? /(\d+) feet across/.exec(t.prompt)![1]);
          const byDiameter = /across/.test(t.prompt);
          const r = byDiameter ? given / 2 : given;
          expect(Number.isInteger(r), t.id).toBe(true);
          expect(r, t.id).toBeLessThanOrEqual(CIRCLE_RADIUS_MAX[l]);
          expect(r, t.id).toBeGreaterThanOrEqual(2);
          const exact = area ? 314 * r * r : 628 * r; // hundredths
          expect(num(t.answer!) * 100, t.id).toBeCloseTo(exact, 6);
          if (area) expect(t.bridge, t.id).toBe(`3.14 × ${r} × ${r} = ${t.answer}`);
          else expect(t.bridge, t.id).toBe(byDiameter ? `3.14 × ${2 * r} = ${t.answer}` : `2 × 3.14 × ${r} = ${t.answer}`);
        }
        const areas = all.filter((t) => t.unit === "square feet").length;
        if (l === 0) expect(areas, "level 0 asks for the area only").toBe(all.length);
        else {
          expect(areas).toBeGreaterThan(40);
          expect(all.length - areas).toBeGreaterThan(40);
        }
      }
    });

    it("takes the right answer, and a value within a hundredth, but not one further out", () => {
      const t = make("circle-measure", 2, 7);
      expect(measureKind.isCorrect(t, t.answer!)).toBe(true);
      expect(measureKind.isCorrect(t, String(num(t.answer!) + 0.01))).toBe(true);
      expect(measureKind.isCorrect(t, String(num(t.answer!) + 0.1))).toBe(false);
    });
  });

  describe("pythagorean", () => {
    const triples = new Set(PYTHAGOREAN_TRIPLES.flatMap(([a, b, c]) => [1, 2, 3].map((s) => `${a * s},${b * s},${c * s}`)));
    const hyps = (l: number) => tasksOf("pythagorean", l).filter((t) => t.id.includes(":brace:"));
    const legs = (l: number) => tasksOf("pythagorean", l).filter((t) => t.id.includes(":leg:"));

    it("a brace across a wall a by b is the hypotenuse of a whole triple, within the choice ladder", () => {
      for (const l of LEVELS) {
        expect(hyps(l).length).toBeGreaterThan(40);
        for (const t of hyps(l)) {
          const [a, b] = /(\d+) feet by (\d+) feet/.exec(t.prompt)!.slice(1).map(Number);
          const c = num(t.answer!);
          expect(a * a + b * b, t.id).toBe(c * c);
          expect(c, t.id).toBeLessThanOrEqual(TRIPLE_HYP_MAX[l]);
          expect(triples.has([a, b, c].sort((x, y) => x - y).join(",")), t.id).toBe(true);
          expect(t.bridge, t.id).toBe(`√(${a}² + ${b}²) = ${c}`);
        }
      }
    });

    it("finding a leg joins at level 2", () => {
      expect(legs(0)).toHaveLength(0);
      expect(legs(1)).toHaveLength(0);
      for (const l of [2, 3, 4]) {
        expect(legs(l).length).toBeGreaterThan(40);
        expect(hyps(l).length).toBeGreaterThan(40);
        for (const t of legs(l)) {
          const [c, a] = /(\d+)-foot brace.*? (\d+) feet wide/.exec(t.prompt)!.slice(1).map(Number);
          const b = num(t.answer!);
          expect(a * a + b * b, t.id).toBe(c * c);
          expect(t.bridge, t.id).toBe(`√(${c}² − ${a}²) = ${b}`);
          expect(t.maxLength).toBe(String(c));
        }
      }
    });

    it("the ladder's triples only: level 0 stays within a hypotenuse of 17", () => {
      for (const t of hyps(0)) expect(num(t.answer!)).toBeLessThanOrEqual(17);
    });
  });

  describe("linear-eq", () => {
    const kind = (l: number, k: string) => tasksOf("linear-eq", l).filter((t) => t.id.includes(`:${k}:`));

    it("level 0-1 only cut a rope into a short piece and one longer by d", () => {
      for (const l of [0, 1]) {
        expect(kind(l, "diff")).toHaveLength(200);
        for (const t of kind(l, "diff")) {
          const [total, d] = /^An? (\d+)-foot \w+ is cut into two pieces; one is (\d+) (?:foot|feet) longer/.exec(t.prompt)!.slice(1).map(Number);
          const x = num(t.answer!);
          expect(2 * x + d, t.id).toBe(total);
          expect(Number.isInteger(x), t.id).toBe(true);
          expect(d).toBeLessThanOrEqual(LINEAR_CONST_MAX[l]);
          expect(t.bridge, t.id).toBe(`x + (x + ${d}) = ${total}, x = ${x}`);
          expect(t.maxLength).toBe(String(total));
        }
      }
    });

    it("'times as long' joins at level 2, three pieces at level 3", () => {
      expect(kind(1, "times")).toHaveLength(0);
      expect(kind(2, "three")).toHaveLength(0);
      for (const l of [2, 3, 4]) {
        expect(kind(l, "times").length).toBeGreaterThan(20);
        for (const t of kind(l, "times")) {
          const [total, k] = /^An? (\d+)-foot \w+ is cut in two; the longer piece is (\d+) times/.exec(t.prompt)!.slice(1).map(Number);
          expect(total).toBe((k + 1) * num(t.answer!));
          expect(t.bridge).toBe(`x + ${k}x = ${total}, x = ${t.answer}`);
        }
      }
      for (const l of [3, 4]) {
        expect(kind(l, "three").length).toBeGreaterThan(20);
        for (const t of kind(l, "three")) {
          const [total, a, b] = /^An? (\d+)-foot \w+ is cut into three pieces\. .*? (\d+) (?:foot|feet) longer than the first, the third (\d+) (?:foot|feet) longer/.exec(t.prompt)!.slice(1).map(Number);
          expect(a).not.toBe(b);
          expect(total).toBe(3 * num(t.answer!) + a + b);
          expect(t.bridge).toBe(`x + (x + ${a}) + (x + ${b}) = ${total}, x = ${t.answer}`);
        }
      }
    });

    it("half-foot answers appear from level 3 only, with a half-foot step", () => {
      const halves = (l: number) => tasksOf("linear-eq", l).filter((t) => t.answer!.endsWith(".5"));
      for (const l of [0, 1, 2]) expect(halves(l)).toHaveLength(0);
      for (const l of [3, 4]) {
        expect(halves(l).length).toBeGreaterThan(5);
        for (const t of halves(l)) expect(t.step).toBe("0.5");
      }
    });

    it("says 'foot' for one and 'feet' for more", () => {
      const all = LEVELS.flatMap((l) => tasksOf("linear-eq", l));
      expect(all.some((t) => /\b1 foot longer/.test(t.prompt))).toBe(true);
      for (const t of all) expect(t.prompt).not.toMatch(/\b1 feet\b/);
    });
  });
});
