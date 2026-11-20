// @vitest-environment node
/**
 * The sort-pool drawer (F6): a `sort` lock from one set of a pool that credits the skill. No pool ships
 * yet (F7), so these tests inject the fixture pool through `__setSortPoolsForTest`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { fixtureSortPool, FIXTURE_SKILL_ID } from "@/test/sort-pool-fixture";
import { expectNoAnswerInView, expectSound, LEVELS, SEEDS, untouched } from "@/test/lock-catalog";
import { toClientTask } from "../registry";
import { checkTask, lockKind } from "../lock";
import type { LockTask } from "../types";
import { LOCKS, lockFor } from ".";
import { __setSortPoolsForTest, loadSortPools, sortFor } from "./sort";

type SortTask = Extract<LockTask, { puzzle: "sort" }>;

afterEach(() => __setSortPoolsForTest(null));

const pool = fixtureSortPool();
const setOf = (t: SortTask) => pool.sets.find((s) => t.id.split(":")[3] === s.id)!;
const draw = (level: number, seed: number): SortTask => {
  const gen = sortFor(FIXTURE_SKILL_ID)!;
  const t = gen(level, seededRng(seed), FIXTURE_SKILL_ID);
  if (!t || t.puzzle !== "sort") throw new Error(`no sort at level ${level}, seed ${seed}`);
  return t;
};
const COUNT = [6, 6, 8, 8, 10];

describe("when no pool credits a skill", () => {
  it("has no drawer, so the skill is not presented as a lock", () => {
    expect(sortFor(FIXTURE_SKILL_ID)).toBeUndefined();
    expect(lockFor(FIXTURE_SKILL_ID)).toBeUndefined();
    expect(lockKind.presents(FIXTURE_SKILL_ID)).toBe(false);
  });

  it("ships no sort pools yet (F7 adds them): nothing is presented that is not a logic skill", () => {
    expect(lockKind.presents("science-k1")).toBe(false);
    expect(lockKind.presents("vocab-g45")).toBe(false);
  });
});

describe("with a pool injected", () => {
  it("presents exactly the skill the pool credits", () => {
    __setSortPoolsForTest([pool]);
    expect(lockKind.presents("science-g23")).toBe(true);
    expect(lockFor("science-g23")).toBe(sortFor("science-g23"));
    expect(lockKind.presents("science-g45")).toBe(false);
    expect(lockKind.presents("add-10")).toBe(false);
    expect(sortFor("toString")).toBeUndefined();
  });

  it("keeps the logic locks first: a skill with a generator in LOCKS never goes to the pools", () => {
    __setSortPoolsForTest([pool]);
    expect(lockFor("logic-k1")).toBe(LOCKS["logic-k1"]);
  });

  it("refuses a pool that fails validation (throws under test)", () => {
    const broken = JSON.parse(JSON.stringify(pool)) as typeof pool;
    broken.sets[0].items[0].label = "Living thing";
    expect(() => __setSortPoolsForTest([broken])).toThrow(/category-word-in-label/);
  });

  describe.each(LEVELS)("level %i, 500 seeds", (level) => {
    it("is deterministic: the same seed gives the same task, and an id is one puzzle", () => {
      __setSortPoolsForTest([pool]);
      const seen = new Map<string, string>();
      for (const seed of SEEDS) {
        const t = draw(level, seed);
        expect(draw(level, seed)).toEqual(t);
        const json = JSON.stringify(t);
        expect(seen.get(t.id) ?? json).toBe(json);
        seen.set(t.id, json);
      }
      expect(seen.size).toBeGreaterThanOrEqual(5);
    });

    it("draws 6, 8 or 10 items from ONE set, balanced between the bins at ±1, each item once", () => {
      __setSortPoolsForTest([pool]);
      const sets = new Set<string>();
      for (const seed of SEEDS) {
        const t = draw(level, seed);
        const set = setOf(t);
        sets.add(set.id);
        expect(t.items).toHaveLength(COUNT[level]);
        expect(new Set(t.items.map((i) => i.id)).size).toBe(t.items.length);
        const byId = new Map(set.items.map((i) => [i.id, i]));
        for (const item of t.items) {
          expect(byId.get(item.id), `${item.id} is in set ${set.id}`).toBeDefined();
          expect(byId.get(item.id)!.label).toBe(item.label);
        }
        const zeros = t.items.filter((i) => byId.get(i.id)!.category === 0).length;
        expect(Math.abs(zeros - COUNT[level] / 2), t.id).toBeLessThanOrEqual(1);
        expect(t.categories).toEqual(set.categories);
        expect(t.prompt).toBe(`Sort these: ${set.categories[0]} or ${set.categories[1]}?`);
      }
      expect(sets.size).toBe(2); // both sets get drawn
    });

    it("takes items within one level of the drawn level first, then fills from the others", () => {
      __setSortPoolsForTest([pool]);
      for (const seed of SEEDS.slice(0, 100)) {
        const t = draw(level, seed);
        const set = setOf(t);
        const byId = new Map(set.items.map((i) => [i.id, i]));
        for (const c of [0, 1] as const) {
          const chosen = t.items.map((i) => byId.get(i.id)!).filter((i) => i.category === c);
          const nearAvailable = set.items.filter((i) => i.category === c && Math.abs(i.level - level) <= 1).length;
          const nearChosen = chosen.filter((i) => Math.abs(i.level - level) <= 1).length;
          expect(nearChosen, `${t.id} bin ${c}`).toBe(Math.min(chosen.length, nearAvailable));
        }
      }
    });

    it("fits each item to its own bin, and the stored solution is the cells", () => {
      __setSortPoolsForTest([pool]);
      for (const seed of SEEDS) {
        const t = draw(level, seed);
        const byId = new Map(setOf(t).items.map((i) => [i.id, i]));
        expect(t.fits).toEqual(t.items.map((i) => [byId.get(i.id)!.category]));
        expect(t.solution).toEqual({ puzzle: "sort", cells: t.items.map((i) => byId.get(i.id)!.category + 1) });
        expectSound(t);
      }
    });

    it("never sends which item goes where: the id lists items but not their bins, the view has no fits", () => {
      __setSortPoolsForTest([pool]);
      for (const seed of SEEDS) {
        const t = draw(level, seed);
        expectNoAnswerInView(t);
        const sent = JSON.stringify(toClientTask(t));
        expect(sent).not.toMatch(/fits|category|solution|"cells"/);
        expect(t.id).toBe(`${FIXTURE_SKILL_ID}:sort:${pool.poolId}:${setOf(t).id}:${t.items.map((i) => i.id).join(",")}`);
      }
    });

    it("checkTask accepts the solution and refuses a swap, an empty board and a half board", () => {
      __setSortPoolsForTest([pool]);
      for (const seed of SEEDS.slice(0, 100)) {
        const t = draw(level, seed);
        expect(checkTask(t, t.solution)).toMatchObject({ ok: true, broken: [], empty: 0 });
        const cells = [...t.solution.cells];
        const i = cells.findIndex((c) => c === 1);
        const j = cells.findIndex((c) => c === 2);
        [cells[i], cells[j]] = [cells[j], cells[i]];
        const swapped = checkTask(t, { puzzle: "sort", cells });
        expect(swapped.ok, t.id).toBe(false);
        expect(swapped.broken.sort()).toEqual([`item:${i}`, `item:${j}`].sort());
        expect(checkTask(t, untouched(t)).ok).toBe(false);
        const half = t.solution.cells.map((c, k) => (k % 2 === 0 ? c : 0));
        expect(checkTask(t, { puzzle: "sort", cells: half })).toMatchObject({ ok: false });
      }
    });
  });

  it("the lock kind judges a drawn sort end to end: parseResponse, isCorrect, feedback", () => {
    __setSortPoolsForTest([pool]);
    const t = draw(2, 7);
    const wire = lockKind.encode(t.solution);
    const parsed = lockKind.parseResponse(wire, t);
    expect(parsed).toEqual(t.solution);
    expect(lockKind.isCorrect(t, parsed!)).toBe(true);
    const wrong = { puzzle: "sort" as const, cells: t.solution.cells.map((c) => 3 - c) };
    expect(lockKind.isCorrect(t, wrong)).toBe(false);
    expect(lockKind.feedback(t, wrong)).toBe("rule_broken");
  });

  it("draws from every pool that credits the skill", () => {
    const second = JSON.parse(JSON.stringify(pool)) as typeof pool;
    second.poolId = "sort-science-g23-b";
    __setSortPoolsForTest([pool, second]);
    const pools = new Set(SEEDS.map((seed) => draw(1, seed).id.split(":")[2]));
    expect(pools).toEqual(new Set(["sort-science-g23", "sort-science-g23-b"]));
  });

  it("an out-of-range or non-numeric level is level 0 or 4, never a crash", () => {
    __setSortPoolsForTest([pool]);
    const gen = sortFor(FIXTURE_SKILL_ID)!;
    expect(gen(99, seededRng(1), FIXTURE_SKILL_ID)).toMatchObject({ items: expect.any(Array) });
    expect((gen(99, seededRng(1), FIXTURE_SKILL_ID) as SortTask).items).toHaveLength(10);
    expect((gen(-3, seededRng(1), FIXTURE_SKILL_ID) as SortTask).items).toHaveLength(6);
    expect((gen(NaN, seededRng(1), FIXTURE_SKILL_ID) as SortTask).items).toHaveLength(6);
  });
});

describe("loadSortPools: a pool that fails validation is never loaded", () => {
  it("skips it and says so, when not strict", () => {
    const broken = JSON.parse(JSON.stringify(pool)) as typeof pool;
    broken.skillId = "no-such-skill";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadSortPools([pool, broken], false)).toEqual([pool]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(pool.poolId);
    log.mockRestore();
  });

  it("throws, when strict (as under test)", () => {
    expect(() => loadSortPools([{ nonsense: true }], true)).toThrow(/does not validate/);
    expect(() => loadSortPools([{ nonsense: true }])).toThrow(/does not validate/); // strict is the default under vitest
  });

  it("loads the pools the index lists (none yet)", async () => {
    const { SORT_POOL_FILES } = await import("./sort-pool-files");
    expect(loadSortPools(SORT_POOL_FILES).length).toBe(SORT_POOL_FILES.length);
  });
});
