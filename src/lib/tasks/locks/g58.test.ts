// @vitest-environment node
/**
 * The catalog for the grade 4-8 locks (F3): `logic-g45` and `logic-g68`, 4x4 number cages and 3x3
 * logic grids, levels 0-4 x 500 seeds (`src/test/lock-catalog.ts`). Every cage and logic grid has
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
const grids = (tasks: LockTask[]) => tasks.filter((t): t is Of<"logic3"> => t.puzzle === "logic3");
const at = (skillId: string, level: number) => SEEDS.map((seed) => drawLock(skillId, level, seed));
const opsOf = (tasks: LockTask[]) => new Set(cages(tasks).flatMap((t) => t.cages.map((c) => c.op)));

/** The operations each level may use: + only at first, then ×, then − and ÷. */
const G45_OPS = [["=", "+"], ["=", "+"], ["=", "+", "×"], ["=", "+", "×", "-"], ["=", "+", "×", "-", "÷"]];
const G68_OPS = [["=", "+", "×"], ["=", "+", "×", "-"], ["=", "+", "×", "-", "÷"], ["=", "+", "×", "-", "÷"], ["=", "+", "×", "-", "÷"]];

describe("the grade 4-8 lock registry", () => {
  it("registers logic-g45 and logic-g68", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      expect(lockFor(s)).toBe(G58_LOCKS[s]);
      expect(LOCKS[s]).toBe(G58_LOCKS[s]);
    }
  });
});

for (const [skillId, ops] of [["logic-g45", G45_OPS], ["logic-g68", G68_OPS]] as const) {
  describeCatalog(skillId, ["cage4", "logic3"], (level, tasks) => {
    it("cage4: exactly one answer (solver), cages that tile the board, most of it left to work out", () => {
      for (const t of cages(tasks)) expectCage(t);
    });

    it("cage4: uses only this level's operations, and the newest one shows up", () => {
      const seen = opsOf(tasks);
      expect([...seen].filter((op) => !ops[level].includes(op))).toEqual([]);
      expect(seen.has(ops[level][ops[level].length - 1] as never)).toBe(true);
    });

    it("logic3: exactly one answer, a minimal clue set, at least one elimination, at most one 'is' clue", () => {
      for (const t of grids(tasks)) expectLogic(t);
    });
  });
}

describe("level steering", () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("both puzzles appear at every level of both skills", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      for (const level of LEVELS) expect(new Set(at(s, level).map((t) => t.puzzle)), `${s} ${level}`).toEqual(new Set(["cage4", "logic3"]));
    }
  });

  it("logic-g45 starts with more help (givens and single squares) than it ends with, and than logic-g68 gives", () => {
    const fixed = (s: string, level: number) => mean(cages(at(s, level)).map((t) => 16 - openSquares(t)));
    expect(fixed("logic-g45", 0)).toBeGreaterThan(fixed("logic-g45", 4));
    expect(fixed("logic-g45", 0)).toBeGreaterThan(fixed("logic-g68", 0));
    expect(cages(at("logic-g45", 0)).filter((t) => t.givens).length).toBeGreaterThan(SEEDS.length / 4);
  });

  it("logic grids lean on eliminations as the level climbs (fewer 'is' clues)", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      const isShare = (level: number) => mean(grids(at(s, level)).map((t) => t.clues.filter((c) => c.type === "is").length));
      expect(isShare(0)).toBeGreaterThan(isShare(4));
    }
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
      const grid = fallbackLogic(3, s);
      for (const t of [cage, grid]) {
        expectSound(t);
        expect(t.skillId).toBe(s);
      }
      if (cage.puzzle !== "cage4" || grid.puzzle !== "logic3") throw new Error("wrong fallback puzzle");
      expectCage(cage);
      expectLogic(grid);
      // `+` and single squares only, so the fallback suits every level, even logic-g45's first.
      expect(new Set(cage.cages.map((c) => c.op))).toEqual(new Set(["=", "+"]));
      expect(cage.givens).toBeUndefined();
    }
  });

  it("the generators almost never need them (under 1% of draws)", () => {
    for (const s of ["logic-g45", "logic-g68"]) {
      const ids = new Set([fallbackCage(4, s).id, fallbackLogic(3, s).id]);
      for (const level of LEVELS) expect(at(s, level).filter((t) => ids.has(t.id)).length, `${s} ${level}`).toBeLessThan(SEEDS.length / 100);
    }
  });
});

