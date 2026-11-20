// @vitest-environment node
/**
 * The catalog for the grade 4-8 locks (F3): `logic-g45` and `logic-g68`, 4x4 number cages and logic
 * grids (3x3, and 4x4 once logic-g68 climbs past level 0), levels 0-4 x 500 seeds (`src/test/lock-catalog.ts`). Every cage and logic grid has
 * exactly one answer, counted by the test solver.
 */
import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { LEVELS, SEEDS, describeCatalog, drawLock, expectCage, expectLogic, expectSound, openSquares, type Of } from "@/test/lock-catalog";
import { checkTask } from "../lock";
import type { LockTask } from "../types";
import { LOCKS, lockFor } from ".";
import { G58_LOCKS, fallbackCage, fallbackLogic } from "./g58";
import { solutions } from "./solver";

const cages = (tasks: LockTask[]) => tasks.filter((t): t is Of<"cage4"> => t.puzzle === "cage4");
const grids = (tasks: LockTask[]) => tasks.filter((t): t is Of<"logic3"> | Of<"logic4"> => t.puzzle === "logic3" || t.puzzle === "logic4");
const isCount = (t: Of<"logic3"> | Of<"logic4">) => t.clues.filter((c) => c.type === "is").length;
const at = (skillId: string, level: number) => SEEDS.map((seed) => drawLock(skillId, level, seed));
const opsOf = (tasks: LockTask[]) => new Set(cages(tasks).flatMap((t) => t.cages.map((c) => c.op)));

/** The operations each level may use: + only at first, then ×, then − and ÷. */
const G45_OPS = [["=", "+"], ["=", "+"], ["=", "+", "×"], ["=", "+", "×", "-"], ["=", "+", "×", "-", "÷"]];
const G68_OPS = [["=", "+", "×"], ["=", "+", "×", "-"], ["=", "+", "×", "-", "÷"], ["=", "+", "×", "-", "÷"], ["=", "+", "×", "-", "÷"]];

/**
 * The logic grid at each level: its size and the "is" clue counts it may keep. A minimal 3x3 set is
 * either 1 "is" + 1 "not" (2 clues) or 3 "not"s; a minimal 4x4 set is 2 "is" + 1 "not", 1 "is" + 3
 * "not"s, or 6 "not"s. logic-g45 keeps the gentle start; logic-g68 starts at 3 clues and steps up.
 */
const G45_LOGIC: readonly (readonly [3 | 4, readonly number[]])[] = [[3, [1]], [3, [1]], [3, [1, 0]], [3, [0]], [3, [0]]];
const G68_LOGIC: readonly (readonly [3 | 4, readonly number[]])[] = [[3, [0]], [4, [2]], [4, [1]], [4, [1, 0]], [4, [0]]];

describe("the grade 4-8 lock registry", () => {
  it("registers logic-g45 and logic-g68", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      expect(lockFor(s)).toBe(G58_LOCKS[s]);
      expect(LOCKS[s]).toBe(G58_LOCKS[s]);
    }
  });
});

for (const [skillId, ops, logic] of [["logic-g45", G45_OPS, G45_LOGIC], ["logic-g68", G68_OPS, G68_LOGIC]] as const) {
  describeCatalog(skillId, (level) => ["cage4", logic[level][0] === 3 ? "logic3" : "logic4"], (level, tasks) => {
    it("cage4: exactly one answer (solver), cages that tile the board, most of it left to work out", () => {
      for (const t of cages(tasks)) expectCage(t);
    });

    it("cage4: uses only this level's operations, and the newest one shows up", () => {
      const seen = opsOf(tasks);
      expect([...seen].filter((op) => !ops[level].includes(op))).toEqual([]);
      expect(seen.has(ops[level][ops[level].length - 1] as never)).toBe(true);
    });

    it("logic grids: exactly one answer, a minimal clue set, at least one elimination, at most n − 2 'is' clues", () => {
      for (const t of grids(tasks)) expectLogic(t);
    });

    it("logic grids: this level's size and 'is' clue counts, each of them used", () => {
      const [n, counts] = logic[level];
      const seen = new Set<number>();
      for (const t of grids(tasks)) {
        expect(t.puzzle, t.id).toBe(n === 3 ? "logic3" : "logic4");
        expect(counts, t.id).toContain(isCount(t));
        seen.add(isCount(t));
      }
      expect([...seen].sort()).toEqual([...counts].sort());
    });
  });
}

describe("level steering", () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("cages and logic grids both appear at every level of both skills", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      for (const level of LEVELS) {
        const kinds = new Set(at(s, level).map((t) => t.puzzle));
        expect(kinds.has("cage4") && (kinds.has("logic3") || kinds.has("logic4")), `${s} ${level}`).toBe(true);
      }
    }
  });

  it("logic-g68's logic grids have at least 3 clues at every level, and more at the top than at the bottom", () => {
    const clues = (level: number) => grids(at("logic-g68", level)).map((t) => t.clues.length);
    for (const level of LEVELS) expect(Math.min(...clues(level)), `level ${level}`).toBeGreaterThanOrEqual(3);
    expect(mean(clues(4))).toBeGreaterThan(mean(clues(0)));
  });

  it("logic-g45 starts with more help (givens and single squares) than it ends with, and than logic-g68 gives", () => {
    const fixed = (s: string, level: number) => mean(cages(at(s, level)).map((t) => 16 - openSquares(t)));
    expect(fixed("logic-g45", 0)).toBeGreaterThan(fixed("logic-g45", 4));
    expect(fixed("logic-g45", 0)).toBeGreaterThan(fixed("logic-g68", 0));
    expect(cages(at("logic-g45", 0)).filter((t) => t.givens).length).toBeGreaterThan(SEEDS.length / 4);
  });

  it("logic-g45's logic grids lean on eliminations as the level climbs (fewer 'is' clues)", () => {
    const isShare = (level: number) => mean(grids(at("logic-g45", level)).map(isCount));
    expect(isShare(0)).toBeGreaterThan(isShare(4));
  });

  it("a level outside 0-4 (or not a number) is clamped, never thrown on", () => {
    for (const level of [-3, 9, 2.7, NaN]) for (const s of ["logic-g45", "logic-g68"]) expect(LOCKS[s](level, seededRng(1), s)).not.toBeNull();
  });
});

describe("the test solver sees a second answer when there is one", () => {
  it("a cage puzzle with its single squares taken away has several answers, each graded right", () => {
    const t = fallbackCage(4, "logic-g68");
    if (t.puzzle !== "cage4") throw new Error("not a cage");
    const loose = { ...t, cages: t.cages.filter((c) => c.op !== "=") };
    const found = solutions(loose);
    expect(found.length).toBeGreaterThan(1);
    for (const r of found) expect(checkTask(loose, r).ok).toBe(true);
  });
});

describe("the safe fallbacks (bounded generation)", () => {
  it("the fallback cage and logic grid pass every check a generated one does", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      const cage = fallbackCage(4, s);
      const grid3 = fallbackLogic(3, s);
      const grid4 = fallbackLogic(4, s);
      for (const t of [cage, grid3, grid4]) {
        expectSound(t);
        expect(t.skillId).toBe(s);
      }
      if (cage.puzzle !== "cage4" || grid3.puzzle !== "logic3" || grid4.puzzle !== "logic4") throw new Error("wrong fallback puzzle");
      expectCage(cage);
      expectLogic(grid3);
      expectLogic(grid4);
      // The 3x3 fallback has 3 clues, so it suits logic-g68's level 0 too.
      expect(grid3.clues.length).toBe(3);
      // `+` and single squares only, so the fallback suits every level, even logic-g45's first.
      expect(new Set(cage.cages.map((c) => c.op))).toEqual(new Set(["=", "+"]));
      expect(cage.givens).toBeUndefined();
    }
  });

  it("the generators almost never need them (under 1% of draws)", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      const ids = new Set([fallbackCage(4, s).id, fallbackLogic(3, s).id, fallbackLogic(4, s).id]);
      for (const level of LEVELS) expect(at(s, level).filter((t) => ids.has(t.id)).length, `${s} ${level}`).toBeLessThan(SEEDS.length / 100);
    }
  });
});

