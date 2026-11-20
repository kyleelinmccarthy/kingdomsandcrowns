// @vitest-environment node
/**
 * The catalog for the grade 9-12 locks (F3): `logic-g912`, 5x5 number cages, 5x5 nonograms and 4x4
 * logic grids, levels 0-4 x 500 seeds (`src/test/lock-catalog.ts`). Every one has exactly one answer,
 * counted by the test solver.
 */
import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { LOGIC_SKILL_IDS } from "@/lib/utils/skills";
import { LEVELS, SEEDS, describeCatalog, drawLock, expectCage, expectLogic, expectNono, expectSound, type Of } from "@/test/lock-catalog";
import { checkTask } from "../lock";
import type { LockTask } from "../types";
import { LOCKS, lockFor } from ".";
import { fallbackCage, fallbackLogic } from "./g58";
import { G912_LOCKS, fallbackNono } from "./g912";
import { solutions } from "./solver";

const SKILL = "logic-g912";
const at = (level: number) => SEEDS.map((seed) => drawLock(SKILL, level, seed));
const only = <P extends LockTask["puzzle"]>(p: P, tasks: LockTask[]) => tasks.filter((t): t is Of<P> => t.puzzle === p);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The operations each level may use: `+ ×` first, then `−`, then `÷`. */
const G912_OPS = [["=", "+", "×"], ["=", "+", "×", "-"], ["=", "+", "×", "-", "÷"], ["=", "+", "×", "-", "÷"], ["=", "+", "×", "-", "÷"]];

describe("the grade 9-12 lock registry", () => {
  it("registers logic-g912", () => {
    expect(lockFor(SKILL)).toBe(G912_LOCKS[SKILL]);
    expect(LOCKS[SKILL]).toBe(G912_LOCKS[SKILL]);
  });

  it("LOCKS covers every logic skill", () => {
    expect(LOGIC_SKILL_IDS).toEqual(["logic-k1", "logic-g23", "logic-g45", "logic-g68", "logic-g912"]);
    for (const id of LOGIC_SKILL_IDS) expect(lockFor(id), id).toBeTypeOf("function");
  });
});

describeCatalog(SKILL, ["cage5", "nono5", "logic4"], (level, tasks) => {
  it("cage5: exactly one answer (solver), cages that tile the board, most of it left to work out", () => {
    for (const t of only("cage5", tasks)) expectCage(t);
  });

  it("cage5: uses only this level's operations, and the newest one shows up", () => {
    const seen = new Set(only("cage5", tasks).flatMap((t) => t.cages.map((c) => c.op)));
    const ops = G912_OPS[level];
    expect([...seen].filter((op) => !ops.includes(op))).toEqual([]);
    expect(seen.has(ops[ops.length - 1] as never)).toBe(true);
  });

  it("nono5: exactly one answer (solver), clues that are the picture's runs, 8 to 24 squares filled", () => {
    for (const t of only("nono5", tasks)) expectNono(t);
  });

  it("logic4: exactly one answer, a minimal clue set, at least one elimination, at most two 'is' clues", () => {
    for (const t of only("logic4", tasks)) expectLogic(t);
  });
});

describe("level steering", () => {
  it("all three puzzles appear at every level", () => {
    for (const level of LEVELS) expect(new Set(at(level).map((t) => t.puzzle)), `level ${level}`).toEqual(new Set(["cage5", "nono5", "logic4"]));
  });

  it("logic grids lean on eliminations as the level climbs (fewer 'is' clues)", () => {
    const isShare = (level: number) => mean(only("logic4", at(level)).map((t) => t.clues.filter((c) => c.type === "is").length));
    expect(isShare(0)).toBeGreaterThan(isShare(4));
  });

  it("a level outside 0-4 (or not a number) is clamped, never thrown on", () => {
    for (const level of [-3, 9, 2.7, NaN]) expect(LOCKS[SKILL](level, seededRng(1), SKILL)).not.toBeNull();
  });
});

describe("the test solver sees a second answer when there is one", () => {
  it("a nonogram whose clues fit two pictures has two answers, each graded right", () => {
    // Two squares on a diagonal: either diagonal fits rows [1],[1] and columns [1],[1].
    const t = { ...fallbackNono(SKILL), rows: [[1], [1], [], [], []], cols: [[1], [1], [], [], []] } as LockTask;
    const found = solutions(t);
    expect(found).toHaveLength(2);
    for (const r of found) expect(checkTask(t, r).ok).toBe(true);
  });
});

describe("the safe fallbacks (bounded generation)", () => {
  const fallbacks = () => [fallbackCage(5, SKILL), fallbackNono(SKILL), fallbackLogic(4, SKILL)];

  it("the fallback cage, nonogram and logic grid pass every check a generated one does", () => {
    const [cage, nono, grid] = fallbacks();
    for (const t of [cage, nono, grid]) {
      expectSound(t);
      expect(t.skillId).toBe(SKILL);
    }
    if (cage.puzzle !== "cage5" || nono.puzzle !== "nono5" || grid.puzzle !== "logic4") throw new Error("wrong fallback puzzle");
    expectCage(cage);
    expectNono(nono);
    expectLogic(grid);
    expect(new Set(cage.cages.map((c) => c.op))).toEqual(new Set(["=", "+"]));
  });

  it("the generator almost never needs them (under 1% of draws)", () => {
    const ids = new Set(fallbacks().map((t) => t.id));
    for (const level of LEVELS) expect(at(level).filter((t) => ids.has(t.id)).length, `level ${level}`).toBeLessThan(SEEDS.length / 100);
  });
});
