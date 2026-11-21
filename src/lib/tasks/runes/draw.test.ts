// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { effectKey, fallbackTiles, runeKey, shuffleTiles, type RuneEntry, type RunePool } from "@/lib/content/rune-pools";
import { RUNE_EFFECT_IDS, type RuneEffect } from "@/lib/realm/rune-objects";
import { seededRng, type Rng } from "@/lib/utils/drill-generators";
import type { ContentBand } from "@/lib/utils/content-bands";
import { findSkill, type Skill } from "@/lib/utils/skills";
import { cloneRunePool } from "@/test/rune-pool-fixture";
import { simulateRuneWeek } from "@/test/rune-week";
import { TASK_DRAWERS, TASK_RUN_DRAWERS, drawerFor, runDrawerFor } from "../draw";
import { TASK_KINDS, toClientTask } from "../registry";
import { RUNE_GENERIC_WHY } from "../rune-copy";
import { hasSpelledRun } from "../rune-tiles";
import type { RuneTask } from "../types";
import { drawRuneFor, drawRuneWords } from "./draw";
import { __setRunePoolsForTest, loadRunePools, runePoolFor, runeTaskOf } from "./index";
import { RUNE_POOL_FILES } from "./rune-pool-files";

const none: ReadonlySet<string> = new Set();
const SKILL_OF: Record<ContentBand, string> = { k1: "spell-g1", g23: "spell-g23", g45: "vocab-g45", g68: "vocab-g68", g912: "vocab-g912" };
const skillAt = (band: ContentBand): Skill => findSkill(SKILL_OF[band])!;
/** Whether a pool that ships (`RUNE_POOL_FILES`, I5) credits the skill. */
const ships = (skillId: string): boolean => RUNE_POOL_FILES.some((f) => (f as { skillIds: string[] }).skillIds.includes(skillId));

afterEach(() => __setRunePoolsForTest(null));

function use(band: ContentBand = "k1"): RunePool {
  const pool = cloneRunePool(band);
  __setRunePoolsForTest([pool]);
  return pool;
}

/** Each task's entry, by its `entry` key. */
const entryOf = (pool: RunePool, task: RuneTask): RuneEntry => pool.entries.find((e) => runeKey(pool.poolId, e.id) === task.entry)!;

describe("the rune pools a skill reads (R-I6)", () => {
  it("is empty while no pool is loaded: nothing presents a rune, and nothing is drawn", () => {
    __setRunePoolsForTest([]);
    expect(runePoolFor("spell-g1")).toBeUndefined();
    expect(TASK_KINDS.rune.presents("spell-g1")).toBe(false);
    expect(drawRuneWords(skillAt("k1"), 2, 3, seededRng(1), none, none)).toEqual([]);
    expect(TASK_DRAWERS.rune(skillAt("k1"), 2, seededRng(1))).toBeNull();
    expect(drawRuneFor(skillAt("k1"), 2, "light", seededRng(1), none)).toBeNull();
  });

  it("makes TASK_KINDS.rune.presents real: true only for a skill a loaded pool credits (F-7)", () => {
    use("k1");
    expect(runePoolFor("spell-g1")?.poolId).toBe("rune-k1");
    expect(runePoolFor("lang-gk")?.poolId).toBe("rune-k1");
    expect(TASK_KINDS.rune.presents("spell-g1")).toBe(true);
    expect(TASK_KINDS.rune.presents("lang-gk")).toBe(true);
    expect(TASK_KINDS.rune.presents("spell-g23")).toBe(false);
    for (const bad of ["toString", "__proto__", "constructor", "hasOwnProperty", ""]) expect(TASK_KINDS.rune.presents(bad), bad).toBe(false);
    __setRunePoolsForTest([]);
    expect(TASK_KINDS.rune.presents("spell-g1")).toBe(false);
    __setRunePoolsForTest([cloneRunePool("g45")]);
    expect(TASK_KINDS.rune.presents("spell-g1")).toBe(false);
    expect(TASK_KINDS.rune.presents("spell-g45")).toBe(true);
    expect(TASK_KINDS.rune.presents("vocab-g45")).toBe(true);
    // null restores the pools that ship, and only they present.
    __setRunePoolsForTest(null);
    for (const ids of ["lang-gk", "spell-g1", "spell-g23", "lang-g3", "spell-g45", "vocab-g45", "vocab-g68", "vocab-g912"]) expect(TASK_KINDS.rune.presents(ids), ids).toBe(ships(ids));
  });

  it("registers the run drawer and the one-task drawer for the rune kind", () => {
    expect(runDrawerFor("rune")).toBe(drawRuneWords);
    expect(TASK_RUN_DRAWERS.rune).toBe(drawRuneWords);
    expect(drawerFor("rune")).toBe(TASK_DRAWERS.rune);
    use("k1");
    const one = TASK_DRAWERS.rune(skillAt("k1"), 2, seededRng(5));
    expect(one).toMatchObject({ kind: "rune", skillId: "spell-g1" });
    expect(one).toEqual(drawRuneWords(skillAt("k1"), 2, 1, seededRng(5), none, none)[0]);
  });

  it("loads only pools that validate: it throws under test, and skips (logging) outside it", () => {
    const bad = cloneRunePool("k1");
    bad.entries[0].tiles = ["m", "e", "n"];
    expect(() => loadRunePools([bad])).toThrow(/does not validate/);
    expect(() => __setRunePoolsForTest([bad])).toThrow(/does not validate/);
    const log: unknown[] = [];
    const real = console.error;
    console.error = (...a: unknown[]) => void log.push(a);
    try {
      expect(loadRunePools([bad, cloneRunePool("g45")], false).map((p) => p.poolId)).toEqual(["rune-g45"]);
    } finally {
      console.error = real;
    }
    expect(log).toHaveLength(1);
    expect(() => loadRunePools([cloneRunePool("k1"), cloneRunePool("k1")])).toThrow(/twice/);
  });

  it("ships no pool yet (I5 adds them)", () => {
    expect(Array.isArray(RUNE_POOL_FILES)).toBe(true);
  });
});

describe("runeTaskOf: one entry as a task", () => {
  it("is opaque in its id, keeps the words and hint on the server, and has no object until a run binds one", () => {
    const pool = use("k1");
    const entry = pool.entries[7];
    const task = runeTaskOf(pool, entry, "lang-gk", seededRng(3));
    expect(task).toMatchObject({
      kind: "rune",
      skillId: "lang-gk",
      prompt: entry.prompt,
      readAloud: entry.readAloud,
      effect: entry.effect,
      object: null,
      listen: true,
      words: entry.words,
      hint: entry.hint,
      entry: runeKey(pool.poolId, entry.id),
      explain: RUNE_GENERIC_WHY.k1,
    });
    expect(task.id).toMatch(/^lang-gk:rune:[0-9a-f]{8}$/);
    expect([...task.tiles].sort()).toEqual([...entry.tiles].sort());
    // A copy: changing the task leaves the pool alone.
    task.words.push("x");
    expect(entry.words).toHaveLength(1);
  });
});

describe("drawRuneWords", () => {
  it("is deterministic per seed", () => {
    use();
    for (const seed of [1, 2, 3, 99]) {
      expect(drawRuneWords(skillAt("k1"), 2, 3, seededRng(seed), none, none)).toEqual(drawRuneWords(skillAt("k1"), 2, 3, seededRng(seed), none, none));
    }
    expect(drawRuneWords(skillAt("k1"), 2, 3, seededRng(1), none, none)).not.toEqual(drawRuneWords(skillAt("k1"), 2, 3, seededRng(2), none, none));
  });

  it("draws three words of three different effects whenever three effects have candidates", () => {
    use();
    for (let seed = 1; seed <= 60; seed++) {
      const tasks = drawRuneWords(skillAt("k1"), seed % 5, 3, seededRng(seed), none, none);
      expect(tasks).toHaveLength(3);
      expect(new Set(tasks.map((t) => t.effect)).size, `seed ${seed}`).toBe(3);
    }
    // With only two effects left, the third slot cycles back to the first effect.
    const pool = use();
    const ex = new Set(pool.entries.filter((e) => !["mend", "water"].includes(e.effect)).map((e) => runeTaskOf(pool, e, "spell-g1", seededRng(1)).id));
    const two = drawRuneWords(skillAt("k1"), 2, 3, seededRng(4), ex, none);
    expect(two).toHaveLength(3);
    expect(new Set(two.map((t) => t.effect))).toEqual(new Set(["mend", "water"]));
  });

  it("takes an effect whose effectKey is in avoid last (R-I22's pass-over)", () => {
    use();
    const passOver = new Set([effectKey("mend"), effectKey("light"), effectKey("water")]);
    for (let seed = 1; seed <= 40; seed++) {
      const tasks = drawRuneWords(skillAt("k1"), 2, 2, seededRng(seed), none, passOver);
      expect(new Set(tasks.map((t) => t.effect)), `seed ${seed}`).toEqual(new Set(["open", "grow"]));
      const three = drawRuneWords(skillAt("k1"), 2, 3, seededRng(seed), none, passOver);
      expect(three.slice(0, 2).map((t) => t.effect).sort()).toEqual(["grow", "open"]);
      expect(["mend", "light", "water"]).toContain(three[2].effect);
    }
  });

  it("drops an excluded entry", () => {
    const pool = use();
    const victim = pool.entries[11];
    const exclude = new Set([runeTaskOf(pool, victim, "spell-g1", seededRng(1)).id]);
    for (let seed = 1; seed <= 80; seed++) {
      for (const task of drawRuneWords(skillAt("k1"), victim.level, 5, seededRng(seed), exclude, none)) expect(task.entry, `seed ${seed}`).not.toBe(runeKey(pool.poolId, victim.id));
    }
  });

  it("prefers entries within one level of the hero's, then the rest", () => {
    const pool = use();
    for (let seed = 1; seed <= 30; seed++) {
      const level = seed % 5;
      for (const task of drawRuneWords(skillAt("k1"), level, 3, seededRng(seed), none, none)) expect(Math.abs(entryOf(pool, task).level - level), `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it("uses avoided entries only once every other entry of the effect is used", () => {
    const pool = use();
    // Every light entry but one is avoided: light's one fresh entry comes first, then avoided ones.
    const light = pool.entries.filter((e) => e.effect === "light");
    const avoid = new Set(light.slice(1).map((e) => runeKey(pool.poolId, e.id)));
    for (let seed = 1; seed <= 30; seed++) {
      const got = drawRuneWords(skillAt("k1"), 0, 25, seededRng(seed), none, avoid).filter((t) => t.effect === "light");
      expect(got[0].entry, `seed ${seed}`).toBe(runeKey(pool.poolId, light[0].id));
      for (const t of got.slice(1)) expect(avoid.has(t.entry)).toBe(true);
    }
    // Across the pool: a run draws no avoided entry while fresh ones are left.
    const half = new Set(pool.entries.filter((_, i) => i % 2 === 0).map((e) => runeKey(pool.poolId, e.id)));
    for (let seed = 1; seed <= 30; seed++) {
      for (const t of drawRuneWords(skillAt("k1"), seed % 5, 3, seededRng(seed), none, half)) expect(half.has(t.entry), `seed ${seed}`).toBe(false);
    }
  });

  it("returns every entry there is, each once, when count passes the pool, and none for count 0", () => {
    const pool = use();
    const all = drawRuneWords(skillAt("k1"), 2, 200, seededRng(3), none, none);
    expect(all).toHaveLength(pool.entries.length);
    expect(new Set(all.map((t) => t.entry)).size).toBe(pool.entries.length);
    expect(drawRuneWords(skillAt("k1"), 2, 0, seededRng(1), none, none)).toEqual([]);
    expect(drawRuneWords(skillAt("k1"), 2, -2, seededRng(1), none, none)).toEqual([]);
  });

  it("never shows a tray that spells its word, over 1,000 seeds (R-I17)", () => {
    for (const band of ["k1", "g45"] as const) {
      use(band);
      for (let seed = 1; seed <= 1000; seed++) {
        for (const task of drawRuneWords(skillAt(band), seed % 5, 3, seededRng(seed), none, none)) expect(hasSpelledRun(task.tiles, task.words), `${band} seed ${seed}`).toBe(false);
      }
    }
  });

  it("shows the entry's own tiles, reordered", () => {
    const pool = use("g23");
    for (let seed = 1; seed <= 30; seed++) {
      for (const task of drawRuneWords(skillAt("g23"), seed % 5, 3, seededRng(seed), none, none)) expect([...task.tiles].sort()).toEqual([...entryOf(pool, task).tiles].sort());
    }
  });

  it("gives opaque ids: no word, no entry id, no effect name", () => {
    for (const band of ["k1", "g45"] as const) {
      const pool = use(band);
      const ids = pool.entries.map((e) => runeTaskOf(pool, e, SKILL_OF[band], seededRng(1)).id);
      expect(new Set(ids).size).toBe(pool.entries.length);
      pool.entries.forEach((e, i) => {
        const opaque = ids[i].split(":rune:")[1];
        expect(opaque).toMatch(/^[0-9a-f]{8}$/);
        for (const w of e.words) expect(ids[i]).not.toContain(w);
        expect(ids[i]).not.toContain(e.id);
        for (const effect of RUNE_EFFECT_IDS) expect(ids[i]).not.toContain(effect);
      });
    }
  });

  it("explains a miss with the entry's why, else the band's generic line", () => {
    const g45 = use("g45");
    for (const task of drawRuneWords(skillAt("g45"), 2, 3, seededRng(2), none, none)) expect(task.explain).toBe(entryOf(g45, task).why);
    use("k1");
    for (const task of drawRuneWords(skillAt("k1"), 2, 3, seededRng(2), none, none)) expect(task.explain).toBe(RUNE_GENERIC_WHY.k1);
  });

  it("marks a dictation listen at k1 and g23 only", () => {
    for (const band of ["k1", "g23", "g45", "g68", "g912"] as const) {
      use(band);
      for (const task of drawRuneWords(skillAt(band), 2, 3, seededRng(1), none, none)) expect(task.listen, band).toBe(band === "k1" || band === "g23");
    }
  });

  it("sends the browser nothing of the word from g45 up: the client JSON holds no word, entry or hint", () => {
    const pool = use("g68");
    for (let seed = 1; seed <= 40; seed++) {
      for (const task of drawRuneWords(skillAt("g68"), seed % 5, 3, seededRng(seed), none, none)) {
        const json = JSON.stringify(toClientTask(task));
        for (const w of task.words) expect(json).not.toContain(w);
        expect(json).not.toContain(task.entry);
        expect(json).not.toContain(task.hint);
        expect(json).not.toContain(entryOf(pool, task).id);
      }
    }
  });
});

describe("shuffleTiles (RI-a / S16)", () => {
  it("always ends: a tray that spells its word in every order falls back to A-Z after 8 shuffles and its rotations", () => {
    // A tile that is the word spells it wherever it stands.
    const tiles = ["zz", "ab", "c", "d"];
    let calls = 0;
    const spy: Rng = (() => {
      const real = seededRng(7);
      return () => {
        calls += 1;
        return real();
      };
    })();
    expect(shuffleTiles(tiles, ["ab"], spy)).toEqual(fallbackTiles(tiles));
    // 8 shuffles of 4 tiles draw 3 numbers each; the rotations draw none.
    expect(calls).toBe(8 * (tiles.length - 1));
  });

  it("returns the first clean shuffle, and leaves the input alone", () => {
    const tiles = ["m", "e", "nd", "a", "i"];
    const shown = shuffleTiles(tiles, ["mend"], seededRng(1));
    expect(hasSpelledRun(shown, ["mend"])).toBe(false);
    expect([...shown].sort()).toEqual([...tiles].sort());
    expect(tiles).toEqual(["m", "e", "nd", "a", "i"]);
  });

  it("rotates the last shuffle when every shuffle spells the word, before falling back", () => {
    // An rng just under 1 makes every shuffle the identity, which spells "ab"; one place along does not.
    const high: Rng = () => 0.999999;
    expect(shuffleTiles(["a", "b", "c", "d"], ["ab"], high)).toEqual(["b", "c", "d", "a"]);
    // Every pair is a word, so every order and every rotation spells one: the fallback is what is left.
    expect(shuffleTiles(["c", "b", "a"], ["ab", "ba", "bc", "cb", "ca", "ac"], seededRng(1))).toEqual(["a", "b", "c"]);
  });
});

describe("the reviewer's probes (I4 fix round 1): a tray never shows the word inside a longer run", () => {
  /** True when some run of adjacent tiles reads the word and then more letters (or exactly the word). */
  const shows = (tiles: readonly string[], word: string): boolean =>
    tiles.some((_, i) => tiles.slice(i).reduce<string[]>((runs, t) => [...runs, (runs[runs.length - 1] ?? "") + t], []).some((run) => run.startsWith(word)));

  it.each([
    ["restore", ["re", "stor", "e", "ed", "un", "pre"]],
    ["mend", ["m", "e", "nd", "nds", "a", "i"]],
    ["irrigate", ["ir", "rig", "at", "e", "ed", "de", "sub"]],
  ] as const)("%s: 1,000 seeded trays show no run starting with it", (word, tiles) => {
    for (let seed = 1; seed <= 1000; seed++) expect(shows(shuffleTiles(tiles, [word], seededRng(seed)), word), `seed ${seed}`).toBe(false);
  });
});

describe("drawRuneFor: one word of one effect", () => {
  it("gives a light entry, near and fresh first", () => {
    const pool = use();
    for (let seed = 1; seed <= 20; seed++) {
      const task = drawRuneFor(skillAt("k1"), 1, "light", seededRng(seed), none)!;
      expect(task.effect).toBe("light");
      expect(Math.abs(entryOf(pool, task).level - 1)).toBeLessThanOrEqual(1);
    }
    const fresh = pool.entries.find((e) => e.effect === "light" && e.level === 4)!;
    const avoid = new Set(pool.entries.filter((e) => e.effect === "light" && e !== fresh).map((e) => runeKey(pool.poolId, e.id)));
    expect(drawRuneFor(skillAt("k1"), 0, "light", seededRng(1), avoid)!.entry).toBe(runeKey(pool.poolId, fresh.id));
  });

  it("is null from an empty pool, and null for a skill no pool credits", () => {
    __setRunePoolsForTest([]);
    expect(drawRuneFor(skillAt("k1"), 1, "light", seededRng(1), none)).toBeNull();
    use("k1");
    expect(drawRuneFor(skillAt("g45"), 1, "light", seededRng(1), none)).toBeNull();
  });
});

describe("a week without repeats (R-I19, RI-a / S18)", () => {
  it("21 runs of 3 (63 of 80 entries) never meet an entry twice, at every level, seeds 1-20", () => {
    for (const band of ["k1", "g68"] as const) {
      const pool = cloneRunePool(band);
      for (let level = 0; level <= 4; level++) {
        for (let seed = 1; seed <= 20; seed++) {
          const week = simulateRuneWeek(pool, level, seed);
          expect(week).toHaveLength(21);
          const keys = week.flat();
          expect(keys).toHaveLength(63);
          expect(new Set(keys).size, `${band} level ${level} seed ${seed}`).toBe(63);
        }
      }
    }
  });

  it("spreads every run over three effects", () => {
    const pool = cloneRunePool("k1");
    const effectOf = new Map(pool.entries.map((e) => [runeKey(pool.poolId, e.id), e.effect as RuneEffect]));
    for (const run of simulateRuneWeek(pool, 2, 5)) expect(new Set(run.map((k) => effectOf.get(k))).size).toBe(3);
  });
});
