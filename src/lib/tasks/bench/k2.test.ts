import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { BENCH } from ".";
import { measureKind } from "../measure";
import type { MeasureTask } from "../types";

const K2 = ["add-10", "sub-10", "add-20", "sub-20", "add-100", "sub-100"];
const make = (skillId: string, level: number, seed: number): MeasureTask => BENCH[skillId](level, seededRng(seed), skillId)!;
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const maxOf = (xs: number[]) => Math.max(...xs);

describe("K-2 bench (R-C3)", () => {
  it("registers the six K-2 skills", () => {
    for (const s of K2) expect(BENCH[s], s).toBeTypeOf("function");
  });

  it("add-* assembles: 4-5 pieces, and the stored two addends make the mark", () => {
    for (const s of ["add-10", "add-20", "add-100"]) {
      for (const seed of seeds) {
        const t = make(s, 4, seed);
        expect(t.mode).toBe("assemble");
        expect(t.pieces!.length).toBeGreaterThanOrEqual(4);
        expect(t.pieces!.length).toBeLessThanOrEqual(5);
        expect(t.solution).toHaveLength(2);
        const [a, b] = t.solution!.map((k) => Number(t.pieces![k].value)).sort((x, y) => x - y);
        expect(a + b).toBe(Number(t.target!.value));
        expect(t.bridge).toBe(`${a} + ${b} = ${t.target!.value}`);
      }
    }
  });

  it("add-* pieces are whole, positive, never the mark's own length, and no two alike", () => {
    for (const s of ["add-10", "add-20", "add-100"]) {
      for (const level of [0, 1, 2, 3, 4]) {
        for (const seed of seeds) {
          const t = make(s, level, seed);
          const vals = t.pieces!.map((p) => Number(p.value));
          expect(vals.every((v) => Number.isInteger(v) && v >= 1)).toBe(true);
          expect(vals).not.toContain(Number(t.target!.value));
          expect(new Set(vals).size).toBe(vals.length);
        }
      }
    }
  });

  it("level 0 add-10 is not one task shuffled: marks 3-5, with decoys longer than the mark (RC-f)", () => {
    const tasks = seeds.map((seed) => make("add-10", 0, seed));
    expect([...new Set(tasks.map((t) => t.target!.value))].sort()).toEqual(["3", "4", "5"]);
    const sets = new Set(tasks.map((t) => `${t.target!.value}|${t.pieces!.map((p) => p.value).sort().join(",")}`));
    expect(sets.size).toBeGreaterThanOrEqual(10);
    expect(tasks.some((t) => t.pieces!.some((p) => Number(p.value) > Number(t.target!.value)))).toBe(true);
    for (const t of tasks) expect(t.pieces!.length).toBeGreaterThanOrEqual(4);
  });

  it("sub-* cuts: a - b is the answer, the ruler is the beam, the stepper counts by one", () => {
    for (const s of ["sub-10", "sub-20", "sub-100"]) {
      for (const seed of seeds) {
        const t = make(s, 3, seed);
        expect(t.mode).toBe("cut");
        const [a, b] = /has a beam (\d+) .*?Cut off (\d+)/.exec(t.prompt)!.slice(1).map(Number);
        expect(a).toBeGreaterThan(b);
        expect(t.answer).toBe(String(a - b));
        expect(t.maxLength).toBe(String(a));
        expect(t.step).toBe("1");
        expect(t.bridge).toBe(`${a} − ${b} = ${a - b}`);
      }
    }
  });

  it("units: blocks for K-1, feet for grade 2", () => {
    for (const s of ["add-10", "sub-10", "add-20", "sub-20"]) expect(make(s, 2, 7).unit).toBe("blocks");
    for (const s of ["add-100", "sub-100"]) expect(make(s, 2, 7).unit).toBe("feet");
  });

  it("pins a concrete assemble reading (add-10, level 4, seed 3)", () => {
    expect(make("add-10", 4, 3)).toMatchInlineSnapshot(`
      {
        "bridge": "1 + 8 = 9",
        "explain": "1 block and 8 blocks make 9 blocks: 1 + 8 = 9.",
        "id": "add-10:asm:9=8,3,12,1",
        "kind": "measure",
        "mode": "assemble",
        "pieces": [
          {
            "label": "8 blocks",
            "value": "8",
          },
          {
            "label": "3 blocks",
            "value": "3",
          },
          {
            "label": "12 blocks",
            "value": "12",
          },
          {
            "label": "1 block",
            "value": "1",
          },
        ],
        "prompt": "The well-digger needs a beam 9 blocks long. Pick the pieces that make it.",
        "readAloud": "The well-digger needs a beam nine blocks long. Pick the pieces that make it.",
        "skillId": "add-10",
        "solution": [
          0,
          3,
        ],
        "target": {
          "label": "9 blocks",
          "value": "9",
        },
        "unit": "blocks",
      }
    `);
  });

  it("pins a concrete cut reading (sub-20, level 2, seed 5)", () => {
    expect(make("sub-20", 2, 5)).toMatchInlineSnapshot(`
      {
        "answer": "4",
        "bridge": "11 − 7 = 4",
        "explain": "Take 7 from 11 and 4 is left: 11 − 7 = 4.",
        "id": "sub-20:cut:11-7",
        "kind": "measure",
        "maxLength": "11",
        "mode": "cut",
        "prompt": "The baker has a beam 11 blocks long. Cut off 7 blocks. How long is the piece that's left?",
        "readAloud": "The baker has a beam eleven blocks long. Cut off seven blocks. How long is the piece that's left?",
        "skillId": "sub-20",
        "step": "1",
        "unit": "blocks",
      }
    `);
  });

  it("grades a stored cut by value, and says which way a miss is off", () => {
    const t = make("sub-100", 4, 11);
    expect(measureKind.isCorrect(t, t.answer!)).toBe(true);
    expect(measureKind.isCorrect(t, String(Number(t.answer) + 1))).toBe(false);
    expect(measureKind.feedback(t, String(Number(t.answer) + 1))).toBe("too_long");
    expect(measureKind.feedback(t, String(Number(t.answer) - 1))).toBe("too_short");
  });

  it("says 'block' for a length of 1, never '1 blocks'", () => {
    const texts = seeds.flatMap((seed) =>
      [make("sub-10", 0, seed), make("add-10", 1, seed)].flatMap((t) => [t.prompt, t.explain ?? "", ...(t.pieces ?? []).map((p) => p.label), t.target?.label ?? ""]),
    );
    for (const x of texts) expect(x).not.toMatch(/\b1 (blocks|feet)\b/);
    expect(texts.some((x) => /\b1 block\b/.test(x))).toBe(true);
  });

  describe("levels scale with the existing ADD_MAX / SUB_MAX tables", () => {
    const CEILING: Record<string, number[]> = {
      "add-10": [5, 6, 8, 9, 10], "add-20": [10, 12, 15, 18, 20], "add-100": [20, 40, 60, 80, 100],
      "sub-10": [5, 6, 8, 9, 10], "sub-20": [10, 12, 15, 18, 20], "sub-100": [20, 40, 60, 80, 100],
    };
    it.each([0, 1, 2, 3, 4])("level %i stays within its ceiling and reaches near it", (level) => {
      for (const [s, ceilings] of Object.entries(CEILING)) {
        const tops = seeds.map((seed) => {
          const t = make(s, level, seed);
          return Number(s.startsWith("add") ? t.target!.value : t.maxLength);
        });
        expect(maxOf(tops), s).toBeLessThanOrEqual(ceilings[level]);
        expect(maxOf(tops), s).toBeGreaterThan(ceilings[level] * 0.8);
      }
    });

    it("clamps out-of-range levels", () => {
      expect(make("add-20", 9, 4)).toEqual(make("add-20", 4, 4));
      expect(make("sub-20", -3, 4)).toEqual(make("sub-20", 0, 4));
    });
  });
});
