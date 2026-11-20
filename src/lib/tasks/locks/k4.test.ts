/**
 * The catalog harness for the K-4 locks: `logic-k1` (pattern, sort1) and `logic-g23` (shapes3,
 * balance, sort2), levels 0-4, 500 seeds each. A band that registers a skill in `LOCKS` is added to
 * `SKILLS_UNDER_TEST` and gets every check here. Solvers are brute force (`solver.ts`).
 */
import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { checkTask } from "../lock";
import { checkLock, type LockResponse } from "../lock-rules";
import { TASK_CODECS } from "../codecs";
import type { LockTask } from "../types";
import { LOCKS, lockFor } from ".";
import { expectNoAnswerInView } from "@/test/lock-catalog";
import { SHAPE_VOCAB, COLOR_VOCAB, tokenCode, tokenKey, valueLabel } from "./shapes";
import { solutions, sortAnswer } from "./solver";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
const SKILLS_UNDER_TEST = ["logic-k1", "logic-g23"];
const PUZZLES: Record<string, string[]> = { "logic-k1": ["pattern", "sort1"], "logic-g23": ["shapes3", "balance", "sort2"] };

const draw = (skillId: string, level: number, seed: number): LockTask => {
  const t = LOCKS[skillId](level, seededRng(seed), skillId);
  if (!t) throw new Error(`${skillId} gave no task at level ${level}, seed ${seed}`);
  return t;
};

const blanksOf = (t: Extract<LockTask, { puzzle: "pattern" }>) => t.sequence.filter((s) => s === null).length;
const givensOf = (t: Extract<LockTask, { puzzle: "shapes3" }>) => t.givens.filter((g) => g !== 0).length;
const empty = (t: LockTask): LockResponse => ({ puzzle: t.puzzle, cells: t.solution.cells.map(() => 0) }) as LockResponse;
/** The solution with every cell that is not a given blanked: what a child hands in having done nothing. */
const untouched = (t: LockTask): LockResponse =>
  t.puzzle === "shapes3" ? { puzzle: "shapes3", cells: [...t.givens] } : empty(t);

describe("the K-4 lock registry", () => {
  it("registers logic-k1 and logic-g23, and lockFor reads own keys only", () => {
    for (const s of SKILLS_UNDER_TEST) expect(lockFor(s)).toBe(LOCKS[s]);
    expect(lockFor("toString")).toBeUndefined();
  });
});

describe.each(SKILLS_UNDER_TEST)("%s", (skillId) => {
  describe.each(LEVELS)("level %i", (level) => {
    const tasks = SEEDS.map((seed) => draw(skillId, level, seed));

    it("is deterministic: the same seed gives the same task", () => {
      for (const seed of SEEDS) expect(draw(skillId, level, seed)).toEqual(tasks[seed - 1]);
    });

    it("gives well-formed lock tasks for its own skill and its own puzzles", () => {
      for (const t of tasks) {
        expect(t.kind).toBe("lock");
        expect(t.skillId).toBe(skillId);
        expect(PUZZLES[skillId]).toContain(t.puzzle);
        expect(t.id.startsWith(`${skillId}:`)).toBe(true);
        expect(t.prompt.length).toBeGreaterThan(0);
        expect(t.prompt.length).toBeLessThan(60);
        expect(`${t.prompt} ${t.explain ?? ""}`).not.toMatch(/behind|ahead/i);
      }
    });

    it("an id is one puzzle: equal ids are equal tasks, and the ids vary (at least 5 distinct)", () => {
      const seen = new Map<string, string>();
      for (const t of tasks) {
        const json = JSON.stringify(t);
        expect(seen.get(t.id) ?? json, t.id).toBe(json);
        seen.set(t.id, json);
      }
      expect(seen.size).toBeGreaterThanOrEqual(5);
      for (const p of PUZZLES[skillId]) {
        const ofKind = new Set(tasks.filter((t) => t.puzzle === p).map((t) => t.id));
        expect(ofKind.size, `${p} ids`).toBeGreaterThanOrEqual(5);
      }
    });

    it("the stored solution passes the full check, and survives the codec", () => {
      for (const t of tasks) {
        expect(checkTask(t, t.solution), t.id).toMatchObject({ ok: true, broken: [], empty: 0 });
        expect(TASK_CODECS.lock.decode(TASK_CODECS.lock.encode(t.solution))).toEqual(t.solution);
      }
    });

    it("the browser's copy (id, prompt, view) never carries the answer", () => {
      for (const t of tasks) expectNoAnswerInView(t);
    });

    it("pattern: the id is built from what the child sees, the sequence (blanks as _) and the tray", () => {
      for (const t of tasks) {
        if (t.puzzle !== "pattern") continue;
        expect(t.id).toBe(`${skillId}:pat:${t.sequence.map((s) => (s ? tokenCode(s) : "_")).join(",")}:${t.tray.map(tokenCode).join(",")}`);
      }
    });

    it("is never pre-solved: an untouched board is not right, and needs the child", () => {
      for (const t of tasks) {
        expect(t.solution.cells.length).toBeGreaterThan(0);
        expect(checkTask(t, untouched(t)).ok, t.id).toBe(false);
        expect(checkTask(t, untouched(t)).empty, t.id).toBeGreaterThan(0);
      }
    });

    it("pattern: one blank answer under the shortest-repeat rule, and the tray holds it", () => {
      for (const t of tasks) {
        if (t.puzzle !== "pattern") continue;
        const found = solutions(t);
        expect(found, t.id).toEqual([t.solution]);
        // The tray: 3-4 distinct shapes, and the answer is in it.
        expect(t.tray.length).toBeGreaterThanOrEqual(3);
        expect(t.tray.length).toBeLessThanOrEqual(4);
        expect(new Set(t.tray.map(tokenKey)).size).toBe(t.tray.length);
        const shown = t.sequence.filter((s) => s !== null).length;
        expect(shown).toBeGreaterThanOrEqual(4);
        expect(shown).toBeLessThanOrEqual(6);
        // The view alone (what the face sees) agrees with the full check.
        expect(checkLock(t, t.solution).ok).toBe(true);
      }
    });

    it("pattern: steps up with the level (one blank to level 2, two from level 3)", () => {
      for (const t of tasks) if (t.puzzle === "pattern") expect(blanksOf(t), t.id).toBe(level >= 3 ? 2 : 1);
    });

    it("shapes3: exactly one solution, found by brute force; givens by level", () => {
      for (const t of tasks) {
        if (t.puzzle !== "shapes3") continue;
        expect(solutions(t), t.id).toEqual([t.solution]);
        expect(givensOf(t), t.id).toBe([5, 4, 4, 3, 3][level]);
        expect(t.symbols).toHaveLength(3);
        expect(new Set(t.symbols.map(tokenKey)).size).toBe(3);
        // An independent Latin check of the stored board.
        const rows = [0, 1, 2].map((r) => t.solution.cells.slice(r * 3, r * 3 + 3));
        for (const line of [...rows, ...[0, 1, 2].map((c) => rows.map((r) => r[c]))]) expect([...line].sort()).toEqual([1, 2, 3]);
      }
    });

    it("balance: accepts every subset that sums to the target, and nothing else", () => {
      for (const t of tasks) {
        if (t.puzzle !== "balance") continue;
        const found = solutions(t);
        expect(found.length, t.id).toBeGreaterThanOrEqual(1);
        expect(found.map((r) => r.cells)).toContainEqual(t.solution.cells);
        const sum = (cells: number[]) => cells.reduce((a, x, i) => a + (x ? t.weights[i] : 0), 0);
        for (let mask = 1; mask < 1 << t.weights.length; mask++) {
          const cells = t.weights.map((_, i) => (mask >> i) & 1);
          expect(checkTask(t, { puzzle: "balance", cells }).ok, `${t.id} ${cells}`).toBe(sum(cells) === t.target);
        }
        // Small whole stones, 4-6 of them, all different.
        expect(t.weights.length).toBeGreaterThanOrEqual(4);
        expect(t.weights.length).toBeLessThanOrEqual(6);
        expect(new Set(t.weights).size).toBe(t.weights.length);
        expect(Math.min(...t.weights)).toBeGreaterThanOrEqual(1);
        expect(Math.max(...t.weights)).toBeLessThanOrEqual(10);
        // Not trivial: no single stone does it, and not everything on the pan; a near-miss pair tempts.
        expect(t.weights).not.toContain(t.target);
        expect(t.target).toBeLessThan(t.weights.reduce((a, b) => a + b, 0));
        const tempting = t.weights.flatMap((a, i) => t.weights.slice(i + 1).map((b) => a + b)).filter((s) => Math.abs(s - t.target) === 1);
        expect(tempting.length, t.id).toBeGreaterThanOrEqual(1);
      }
    });

    it("sorts: the bins follow the stated rule, and the one right answer is accepted while any single slip is refused", () => {
      for (const t of tasks) {
        if (t.puzzle !== "sort1" && t.puzzle !== "sort2") continue;
        const answer = sortAnswer(t);
        expect(answer.cells.every((c) => c >= 1 && c <= (t.puzzle === "sort1" ? 2 : 4)), t.id).toBe(true);
        expect(checkTask(t, answer), t.id).toMatchObject({ ok: true });
        expect(t.solution).toEqual(answer);
        t.fits.forEach((f, i) => expect(f, `${t.id} item ${i}`).toEqual([answer.cells[i] - 1]));
        const bins = t.puzzle === "sort1" ? 2 : 4;
        t.items.forEach((_, i) => {
          for (let b = 1; b <= bins; b++) {
            if (b === answer.cells[i]) continue;
            const slip = { puzzle: t.puzzle, cells: answer.cells.map((c, j) => (j === i ? b : c)) } as LockResponse;
            expect(checkTask(t, slip).ok, `${t.id} item ${i}`).toBe(false);
          }
        });
        // Every bin has something in it, so the sort is a real one.
        for (let b = 1; b <= bins; b++) expect(answer.cells.filter((c) => c === b).length, `${t.id} bin ${b}`).toBeGreaterThanOrEqual(1);
        const n = t.items.length;
        expect(n).toBeGreaterThanOrEqual(6);
        expect(n).toBeLessThanOrEqual(8);
      }
    });
  });
});

describe("the label tables, asserted literally (the oracle reuses them)", () => {
  it("names shapes, colours and sizes as the child reads them", () => {
    expect(SHAPE_VOCAB.map((v) => valueLabel("shape", v))).toEqual(["Circles", "Squares", "Triangles", "Stars", "Hearts"]);
    expect(COLOR_VOCAB.map((v) => valueLabel("color", v))).toEqual(["Red", "Blue", "Yellow", "Green"]);
    expect(["big", "small"].map((v) => valueLabel("size", v))).toEqual(["Big", "Small"]);
  });
});

describe("colour-blind-safe puzzles (RF-d): red and green never share a puzzle", () => {
  it("no pattern tray or sequence, no sort, no grid mixes red with green, at any seed or level", () => {
    for (const skillId of SKILLS_UNDER_TEST) for (const level of LEVELS) for (const seed of SEEDS) {
      const t = draw(skillId, level, seed);
      const shapes = t.puzzle === "pattern" ? [...t.sequence, ...t.tray] : t.puzzle === "shapes3" ? t.symbols : t.puzzle === "sort1" || t.puzzle === "sort2" ? t.items : [];
      const colors = new Set(shapes.flatMap((s) => (s ? [s.color] : [])));
      expect(colors.has("red") && colors.has("green"), t.id).toBe(false);
      if (t.puzzle === "sort1" || t.puzzle === "sort2") {
        const labels = [...(t.puzzle === "sort1" ? t.bins : [...t.rows, ...t.cols])];
        expect(labels.includes("Red") && labels.includes("Green"), t.id).toBe(false);
      }
    }
  });
});

describe("level steering", () => {
  const at = (skillId: string, level: number) => SEEDS.map((seed) => draw(skillId, level, seed));

  it("logic-k1 mixes both puzzles at every level; level 0 is colour sorts and AB patterns only", () => {
    for (const level of LEVELS) {
      const kinds = new Set(at("logic-k1", level).map((t) => t.puzzle));
      expect([...kinds].sort()).toEqual(["pattern", "sort1"]);
    }
    for (const t of at("logic-k1", 0)) {
      if (t.puzzle === "sort1") expect(["Red", "Blue", "Yellow", "Green"]).toContain(t.bins[0]);
      if (t.puzzle === "pattern") expect(t.sequence).toHaveLength(5);
    }
  });

  it("logic-g23 mixes all three puzzles at every level, and leans toward the grid as the level climbs", () => {
    const share = (level: number) => at("logic-g23", level).filter((t) => t.puzzle === "shapes3").length / SEEDS.length;
    for (const level of LEVELS) expect(new Set(at("logic-g23", level).map((t) => t.puzzle)).size).toBe(3);
    expect(share(4)).toBeGreaterThan(share(0));
  });

  it("a level outside 0-4 (or not a number) is clamped, never thrown on", () => {
    for (const level of [-3, 9, 2.7, NaN]) {
      for (const s of SKILLS_UNDER_TEST) expect(LOCKS[s](level, seededRng(1), s)).not.toBeNull();
    }
  });

  it("uses only the shared vocabulary", () => {
    const shapes = new Set<string>(SHAPE_VOCAB);
    const colors = new Set<string>(COLOR_VOCAB);
    for (const s of SKILLS_UNDER_TEST) {
      for (const level of LEVELS) {
        for (const t of at(s, level).slice(0, 100)) {
          const all = t.puzzle === "pattern" ? [...t.sequence.filter((x) => x !== null), ...t.tray] : t.puzzle === "shapes3" ? t.symbols : "items" in t ? t.items : [];
          for (const x of all) {
            if (x === null || !("shape" in x)) continue;
            expect(shapes.has(x.shape) && colors.has(x.color), t.id).toBe(true);
          }
        }
      }
    }
  });
});
