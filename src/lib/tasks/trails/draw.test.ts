// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { ANCHOR_IDS } from "@/lib/realm/anchors";
import { trailKey, type TrailPool } from "@/lib/content/trail-pools";
import { seededRng } from "@/lib/utils/drill-generators";
import { findSkill } from "@/lib/utils/skills";
import { cloneTrailPool } from "@/test/trail-pool-fixture";
import { simulateTrailWeek } from "@/test/trail-week";
import { TASK_DRAWERS, TASK_RUN_DRAWERS, drawerFor, runDrawerFor } from "../draw";
import { TASK_KINDS, toClientTask } from "../registry";
import { TRAIL_GENERIC_WHY } from "../trail-copy";
import type { TrailTask } from "../types";
import { drawFromPool, drawTrailClues } from "./draw";
import { __setTrailPoolsForTest, loadTrailPools, trailPoolFor, trailTaskOf } from "./index";
import { TRAIL_POOL_FILES } from "./trail-pool-files";

const skill = findSkill("read-g3")!;
const none = new Set<string>();
/** Whether a pool that ships (`TRAIL_POOL_FILES`, H5) credits the skill. */
const ships = (skillId: string): boolean => TRAIL_POOL_FILES.some((f) => (f as { skillId: string }).skillId === skillId);

afterEach(() => __setTrailPoolsForTest(null));

/** Where each task came from, by its id: its trail and its place in it. */
function origin(pool: TrailPool): Map<string, { trailId: string; index: number }> {
  const out = new Map<string, { trailId: string; index: number }>();
  for (const trail of pool.trails) trail.clues.forEach((_, i) => out.set(trailTaskOf(pool, trail, i).id, { trailId: trail.id, index: i }));
  return out;
}

function use(band: "g23" | "g45" | "k1" = "g23"): TrailPool {
  const pool = cloneTrailPool(band);
  __setTrailPoolsForTest([pool]);
  return pool;
}

const keysOf = (tasks: readonly TrailTask[]): string[] => [...new Set(tasks.map((t) => t.trail))];

describe("the trail pools a skill reads (R-H12)", () => {
  it("is empty while no pool is loaded: no pool credits any skill, so nothing presents a trail", () => {
    __setTrailPoolsForTest([]);
    expect(trailPoolFor("read-g3")).toBeUndefined();
    expect(TASK_KINDS.trail.presents("read-g3")).toBe(false);
    expect(drawTrailClues(skill, 2, 4, seededRng(1), none, none)).toEqual([]);
    expect(TASK_DRAWERS.trail(skill, 2, seededRng(1))).toBeNull();
  });

  it("makes TASK_KINDS.trail.presents real: true only while a pool credits the skill (F-7)", () => {
    use("g23");
    expect(trailPoolFor("read-g3")?.poolId).toBe("trail-g23");
    expect(TASK_KINDS.trail.presents("read-g3")).toBe(true);
    expect(TASK_KINDS.trail.presents("read-g4")).toBe(false);
    expect(TASK_KINDS.trail.presents("read-g1")).toBe(false);
    for (const bad of ["toString", "__proto__", "constructor", "hasOwnProperty", ""]) expect(TASK_KINDS.trail.presents(bad), bad).toBe(false);
    __setTrailPoolsForTest([]);
    expect(TASK_KINDS.trail.presents("read-g3")).toBe(false);
    __setTrailPoolsForTest([cloneTrailPool("g45")]);
    expect(TASK_KINDS.trail.presents("read-g3")).toBe(false);
    expect(TASK_KINDS.trail.presents("read-g4")).toBe(true);
    // null restores the pools that ship, and only they present.
    __setTrailPoolsForTest(null);
    for (const id of ["read-g1", "read-g3", "read-g4", "read-g6", "read-g9"]) expect(TASK_KINDS.trail.presents(id), id).toBe(ships(id));
  });

  it("registers the run drawer and the one-task drawer for the trail kind", () => {
    expect(runDrawerFor("trail")).toBe(drawTrailClues);
    expect(TASK_RUN_DRAWERS.trail).toBe(drawTrailClues);
    expect(drawerFor("trail")).toBe(TASK_DRAWERS.trail);
    use("g23");
    const one = TASK_DRAWERS.trail(skill, 2, seededRng(5));
    expect(one).toMatchObject({ kind: "trail", skillId: "read-g3" });
    expect(one).toEqual(drawTrailClues(skill, 2, 1, seededRng(5), none, none)[0]);
  });

  it("loads only pools that validate: it throws under test, and skips (logging) outside it", () => {
    const bad = cloneTrailPool("g23");
    bad.trails[0].clues[0].answer = "landmark:nowhere";
    expect(() => loadTrailPools([bad])).toThrow(/does not validate/);
    expect(() => __setTrailPoolsForTest([bad])).toThrow(/does not validate/);
    const log: unknown[] = [];
    const real = console.error;
    console.error = (...a: unknown[]) => void log.push(a);
    try {
      expect(loadTrailPools([bad, cloneTrailPool("g45")], false).map((p) => p.poolId)).toEqual(["trail-g45"]);
    } finally {
      console.error = real;
    }
    expect(log).toHaveLength(1);
    expect(() => loadTrailPools([cloneTrailPool("g23"), cloneTrailPool("g23")])).toThrow(/twice/);
  });
});

describe("drawTrailClues", () => {
  it("is deterministic per seed", () => {
    use();
    for (const seed of [1, 2, 3, 99]) {
      expect(drawTrailClues(skill, 2, 4, seededRng(seed), none, none)).toEqual(drawTrailClues(skill, 2, 4, seededRng(seed), none, none));
    }
    expect(drawTrailClues(skill, 2, 4, seededRng(1), none, none)).not.toEqual(drawTrailClues(skill, 2, 4, seededRng(2), none, none));
  });

  it("takes whole trails, in order: clue indices ascending, a trail's clues together", () => {
    const pool = use();
    const where = origin(pool);
    for (let seed = 1; seed <= 40; seed++) {
      const tasks = drawTrailClues(skill, seed % 5, 4, seededRng(seed), none, none);
      const trails: string[] = [];
      let last = -1;
      for (const t of tasks) {
        const o = where.get(t.id)!;
        if (trails[trails.length - 1] !== o.trailId) {
          expect(trails, `trail ${o.trailId} came back in pieces (seed ${seed})`).not.toContain(o.trailId);
          trails.push(o.trailId);
          last = -1;
        }
        expect(o.index, `seed ${seed}`).toBeGreaterThan(last);
        last = o.index;
      }
    }
  });

  it("starts every trail it draws at its first clue, and cuts only the last one", () => {
    const pool = use();
    const where = origin(pool);
    const sizes = new Map(pool.trails.map((t) => [t.id, t.clues.length]));
    let cuts = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const tasks = drawTrailClues(skill, seed % 5, 4, seededRng(seed), none, none);
      const byTrail = new Map<string, number[]>();
      for (const t of tasks) byTrail.set(where.get(t.id)!.trailId, [...(byTrail.get(where.get(t.id)!.trailId) ?? []), where.get(t.id)!.index]);
      const entries = [...byTrail.entries()];
      entries.forEach(([id, indices], n) => {
        expect(indices).toEqual(indices.map((_, i) => i));
        if (indices.length < sizes.get(id)!) {
          cuts += 1;
          expect(n, "only the last trail is cut").toBe(entries.length - 1);
        }
      });
    }
    expect(cuts).toBeGreaterThan(0);
  });

  it("never gives more than count, and fills exactly to count (a cut trail fills the rest)", () => {
    use();
    for (let count = 1; count <= 9; count++) {
      for (let seed = 1; seed <= 12; seed++) {
        const tasks = drawTrailClues(skill, seed % 5, count, seededRng(seed * 7 + count), none, none);
        expect(tasks, `count ${count}`).toHaveLength(count);
      }
    }
    expect(drawTrailClues(skill, 2, 0, seededRng(1), none, none)).toEqual([]);
    expect(drawTrailClues(skill, 2, -3, seededRng(1), none, none)).toEqual([]);
  });

  it("uses at most 2 trails in a run of 4", () => {
    use();
    for (let seed = 1; seed <= 60; seed++) {
      expect(keysOf(drawTrailClues(skill, seed % 5, 4, seededRng(seed), none, none)).length).toBeLessThanOrEqual(2);
    }
  });

  it("returns every clue there is when the pool holds fewer than count", () => {
    const pool = use();
    const total = pool.trails.reduce((n, t) => n + t.clues.length, 0);
    const all = drawTrailClues(skill, 2, total + 20, seededRng(3), none, none);
    expect(all).toHaveLength(total);
    expect(new Set(all.map((t) => t.id)).size).toBe(total);
  });

  it("prefers trails within one level of the hero's, then the rest", () => {
    const pool = use();
    const levelOf = new Map(pool.trails.map((t) => [trailKey(pool.poolId, t.id), t.level]));
    for (let seed = 1; seed <= 30; seed++) {
      const level = seed % 5;
      const keys = keysOf(drawTrailClues(skill, level, 4, seededRng(seed), none, none));
      expect(Math.abs(levelOf.get(keys[0])! - level), `seed ${seed}`).toBeLessThanOrEqual(1);
    }
    // With every near trail excluded, the far ones are what is left.
    const ex = new Set<string>();
    for (const t of pool.trails) if (Math.abs(t.level - 0) <= 1) ex.add(trailTaskOf(pool, t, 0).id);
    const far = drawTrailClues(skill, 0, 4, seededRng(1), ex, none);
    expect(far).toHaveLength(4);
    for (const key of keysOf(far)) expect(levelOf.get(key)!).toBeGreaterThanOrEqual(2);
  });

  it("drops a whole trail when any of its clue ids is excluded", () => {
    const pool = use();
    const victim = pool.trails[7];
    const exclude = new Set([trailTaskOf(pool, victim, 1).id]);
    for (let seed = 1; seed <= 80; seed++) {
      for (const task of drawTrailClues(skill, victim.level, 6, seededRng(seed), exclude, none)) {
        expect(task.trail, `seed ${seed}`).not.toBe(trailKey(pool.poolId, victim.id));
      }
    }
  });

  describe("avoid (R-H11)", () => {
    it("passes over avoided trails while any other is left", () => {
      const pool = use();
      const keys = pool.trails.map((t) => trailKey(pool.poolId, t.id));
      const avoid = new Set(keys.slice(0, 40));
      const rest = new Set(keys.slice(40));
      for (let seed = 1; seed <= 40; seed++) {
        const drawn = keysOf(drawTrailClues(skill, seed % 5, 4, seededRng(seed), none, avoid));
        for (const key of drawn) expect(rest.has(key), `seed ${seed}: ${key}`).toBe(true);
      }
    }, 20_000);

    it("uses them only after every other trail is used, even when the rest do not fit the count", () => {
      const pool = use();
      // Everything avoided but three trails of three clues: a draw of 2 fits none whole, and must cut one of them
      // rather than take an avoided trail of two.
      const open = pool.trails.filter((t) => t.clues.length === 3).slice(0, 3);
      const avoid = new Set(pool.trails.filter((t) => !open.includes(t)).map((t) => trailKey(pool.poolId, t.id)));
      for (let seed = 1; seed <= 40; seed++) {
        const tasks = drawTrailClues(skill, seed % 5, 2, seededRng(seed), none, avoid);
        expect(tasks).toHaveLength(2);
        expect(keysOf(tasks)).toHaveLength(1);
        expect(avoid.has(tasks[0].trail), `seed ${seed}`).toBe(false);
      }
    });

    it("takes the lone unavoided trail first, then fills from the avoided", () => {
      const pool = use();
      const lone = pool.trails[10];
      const avoid = new Set(pool.trails.filter((t) => t !== lone).map((t) => trailKey(pool.poolId, t.id)));
      const tasks = drawTrailClues(skill, 2, 6, seededRng(4), none, avoid);
      expect(tasks).toHaveLength(6);
      expect(tasks.slice(0, lone.clues.length).every((t) => t.trail === trailKey(pool.poolId, lone.id))).toBe(true);
      expect(tasks.slice(lone.clues.length).every((t) => avoid.has(t.trail))).toBe(true);
    });

    it("still draws a full run when every trail is avoided", () => {
      const pool = use();
      const avoid = new Set(pool.trails.map((t) => trailKey(pool.poolId, t.id)));
      expect(drawTrailClues(skill, 2, 4, seededRng(1), none, avoid)).toHaveLength(4);
    });
  });
});

describe("a trail task (R-H5, F-20)", () => {
  it("has an opaque id: <skillId>:trail:<8 hex>, naming neither a place nor a trail", () => {
    const pool = use();
    for (const trail of pool.trails) {
      trail.clues.forEach((_, i) => {
        const task = trailTaskOf(pool, trail, i);
        expect(task.id).toMatch(/^read-g3:trail:[0-9a-f]{8}$/);
        for (const anchor of ANCHOR_IDS) expect(task.id).not.toContain(anchor.split(":")[1]);
        expect(task.id).not.toContain(trail.id);
        expect(task.id).not.toContain(pool.poolId);
      });
    }
  });

  it("is the clue's own words, with the key held server-side", () => {
    const pool = use("k1");
    __setTrailPoolsForTest([pool]);
    const trail = pool.trails[3];
    const clue = { ...trail.clues[1], redirects: { "landmark:well": "Not where water is drawn." } };
    trail.clues[1] = clue;
    const task = trailTaskOf(pool, trail, 1);
    expect(task).toMatchObject({
      kind: "trail",
      skillId: "read-g1",
      prompt: clue.text,
      readAloud: clue.readAloud,
      answer: clue.answer,
      redirect: clue.redirect,
      redirects: { "landmark:well": "Not where water is drawn." },
      trail: trailKey("trail-k1", trail.id),
    });
  });

  it("explains with the clue's why, else the band's generic line", () => {
    const g45 = cloneTrailPool("g45");
    const withWhy = trailTaskOf(g45, g45.trails[0], 0);
    expect(withWhy.explain).toBe(g45.trails[0].clues[0].why);
    expect(withWhy.explain).not.toBe(TRAIL_GENERIC_WHY.g45);
    for (const band of ["k1", "g23", "g45", "g68", "g912"] as const) {
      const pool = cloneTrailPool(band);
      delete pool.trails[0].clues[0].why;
      expect(trailTaskOf(pool, pool.trails[0], 0).explain, band).toBe(TRAIL_GENERIC_WHY[band]);
    }
    expect(TRAIL_GENERIC_WHY).toEqual({
      k1: "The clue names the place. Read each word slowly.",
      g23: "The clue is mostly about one place. That place is the answer.",
      g45: "Look for what the clue hints at, and the words that point to it.",
      g68: "Put the clue's facts together: only one place fits them all.",
      g912: "Read the clue's words closely: they say more than they seem to.",
    });
  });

  it("never reveals the answer, the trail or the key to the browser: every drawn task, every band", () => {
    for (const band of ["k1", "g23", "g45", "g68", "g912"] as const) {
      const pool = cloneTrailPool(band);
      __setTrailPoolsForTest([pool]);
      const s = findSkill(pool.skillId)!;
      for (let seed = 1; seed <= 8; seed++) {
        for (const task of drawTrailClues(s, seed % 5, 6, seededRng(seed), none, none)) {
          const client = toClientTask(task);
          expect(client.view).toEqual({});
          const json = JSON.stringify(client);
          // What goes over the wire: these keys and no others.
          expect(Object.keys(JSON.parse(json)).sort()).toEqual(["id", "kind", "prompt", "skillId", "view", ...(task.readAloud ? ["readAloud"] : [])].sort());
          const trailId = task.trail.split("/")[1];
          for (const secret of [task.answer, trailId, task.trail, task.explain!, task.redirect, '"answer"', '"redirect', '"explain"', '"trail":', '"why"', '"parts"']) {
            expect(json, `${band}: ${secret}`).not.toContain(secret);
          }
          // From g23 up the place is not named in anything the browser gets (k1 may say it: that is the reading).
          if (band !== "k1") {
            const names = task.answer.split(":")[1].replace(/-/g, " ");
            expect(json.toLowerCase(), `${band}: ${names}`).not.toContain(names.split(" ").pop()!.toLowerCase());
          }
        }
      }
    }
  });
});

describe("drawFromPool", () => {
  it("draws from the pool it is given, whatever the registry holds", () => {
    const pool = cloneTrailPool("g45");
    expect(trailPoolFor("read-g4")).toBeUndefined();
    const tasks = drawFromPool(pool, 2, 4, seededRng(1), none, none);
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.skillId === "read-g4")).toBe(true);
  });
});

describe("a week without repeats (R-H11, F-11)", () => {
  const pool45 = (): TrailPool => {
    const pool = cloneTrailPool("g23");
    pool.trails = pool.trails.slice(0, 45);
    return pool;
  };

  it("holds the 45-trail fixture the bar is set against", () => {
    const pool = pool45();
    expect(pool.trails).toHaveLength(45);
    expect(pool.trails.reduce((n, t) => n + t.clues.length, 0)).toBeGreaterThanOrEqual(100);
    for (let level = 0; level < 5; level++) expect(pool.trails.filter((t) => t.level === level).length).toBeGreaterThanOrEqual(9);
  });

  it("meets no trail key twice in 21 runs of 4, at every level and for 20 seeds", () => {
    const pool = pool45();
    for (let level = 0; level <= 4; level++) {
      for (let seed = 1; seed <= 20; seed++) {
        const week = simulateTrailWeek(pool, level, seed, 4);
        expect(week).toHaveLength(21);
        const seen = new Set<string>();
        for (const run of week) {
          expect(run.length).toBeGreaterThan(0);
          expect(run.length).toBeLessThanOrEqual(2);
          for (const key of run) {
            expect(seen.has(key), `level ${level} seed ${seed}: ${key} came back`).toBe(false);
            seen.add(key);
          }
        }
      }
    }
  }, 60_000);

  it("is the trail keys of each run's draw, in order", () => {
    const pool = pool45();
    const week = simulateTrailWeek(pool, 2, 7, 4, 3);
    expect(week).toHaveLength(3);
    const rng = seededRng(7);
    const avoid = new Set<string>();
    for (const run of week) {
      const drawn = drawFromPool(pool, 2, 4, rng, none, avoid);
      expect(run).toEqual(keysOf(drawn));
      run.forEach((k) => avoid.add(k));
    }
  });
});
