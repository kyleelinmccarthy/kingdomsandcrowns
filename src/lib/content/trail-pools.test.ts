// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ANCHOR_IDS } from "@/lib/realm/anchors";
import { CONTENT_BANDS, type ContentBand } from "@/lib/utils/content-bands";
import { bandTopGrade, gradeIndex } from "@/lib/utils/grade-levels";
import { findSkill } from "@/lib/utils/skills";
import { cloneTrailPool, fixtureClue, fixtureTrailPool } from "@/test/trail-pool-fixture";
import { mapRows } from "@/test/skill-map";
import { NON_DRILL_SHEET_PREFIXES } from "./blind-pass";
import { SORT_POOL_PREFIX } from "./sort-pools";
import {
  MIN_CLUES,
  MIN_TRAILS,
  MIN_TRAILS_PER_LEVEL,
  TRAIL_POOL_PREFIX,
  TRAIL_POOL_RULES as R,
  TRAIL_SKILLS,
  clueCode,
  formatTrailProblems,
  opaqueClueId,
  trailKey,
  validateTrailPool,
  type TrailPool,
} from "./trail-pools";

const rulesOf = (pool: unknown): string[] => [...new Set(validateTrailPool(pool).map((p) => p.rule))];
/** The pool at `band`, with `edit` applied to a copy of its first trail's first clue. */
function withClue(band: ContentBand, edit: (clue: TrailPool["trails"][number]["clues"][number], pool: TrailPool) => void): TrailPool {
  const pool = cloneTrailPool(band);
  edit(pool.trails[0].clues[0], pool);
  return pool;
}

describe("validateTrailPool", () => {
  it.each(CONTENT_BANDS)("passes the fixture pool at %s", (band) => {
    expect(validateTrailPool(fixtureTrailPool(band)), formatTrailProblems(validateTrailPool(fixtureTrailPool(band)))).toEqual([]);
  });

  it("holds the numbers of R-H11 and R-H12", () => {
    expect([MIN_TRAILS, MIN_CLUES, MIN_TRAILS_PER_LEVEL]).toEqual([45, 100, 9]);
    expect(TRAIL_POOL_PREFIX).toBe("trail-");
    expect(TRAIL_SKILLS).toEqual({ k1: "read-g1", g23: "read-g3", g45: "read-g4", g68: "read-g6", g912: "read-g9" });
    for (const skillId of Object.values(TRAIL_SKILLS)) expect(findSkill(skillId), skillId).toBeDefined();
  });

  describe("shape", () => {
    it("refuses a non-object, extra keys, a missing key and a wrong type", () => {
      expect(rulesOf(null)).toEqual([R.shape]);
      expect(rulesOf("pool")).toEqual([R.shape]);
      expect(rulesOf([])).toEqual([R.shape]);
      const a = cloneTrailPool() as Record<string, unknown>;
      a.extra = 1;
      expect(rulesOf(a)).toContain(R.shape);
      const b = cloneTrailPool() as Record<string, unknown>;
      delete b.skillId;
      expect(rulesOf(b)).toContain(R.shape);
      const c = cloneTrailPool();
      (c.trails[0].clues[0] as { text: unknown }).text = 7;
      expect(rulesOf(c)).toContain(R.shape);
      const d = cloneTrailPool();
      (d.trails[0].clues[0] as Record<string, unknown>).hint = "x";
      expect(rulesOf(d)).toContain(R.shape);
      const e = cloneTrailPool();
      (e.trails[0] as { level: unknown }).level = 5;
      expect(rulesOf(e)).toContain(R.shape);
      const f = cloneTrailPool();
      (f.trails[0].clues[0] as { parts: unknown }).parts = [["landmark:mill"], 3];
      expect(rulesOf(f)).toContain(R.shape);
    });

    it("refuses an empty redirect, and an empty or non-string redirects value (H2's review)", () => {
      for (const bad of ["", "   "]) {
        expect(rulesOf(withClue("g23", (c) => (c.redirect = bad)))).toContain(R.shape);
        expect(rulesOf(withClue("g23", (c) => (c.redirects = { "landmark:well": bad })))).toContain(R.shape);
      }
      expect(rulesOf(withClue("g23", (c) => (c.redirects = { "landmark:well": 3 as unknown as string })))).toContain(R.shape);
    });
  });

  describe("identity", () => {
    it("wants poolId trail-<band> and the band's skill", () => {
      const a = cloneTrailPool("g23");
      a.poolId = "trail-g45";
      expect(rulesOf(a)).toContain(R.poolId);
      const b = cloneTrailPool("g23");
      b.skillId = "read-g4";
      expect(rulesOf(b)).toContain(R.skill);
      const c = cloneTrailPool("g23");
      (c as { band: string }).band = "g99";
      expect(rulesOf(c)).toContain(R.shape);
    });

    it("wants trail ids of lower-case letters, digits and dashes, 3 to 40 long, each used once", () => {
      for (const id of ["ab", "UPPER-case", "has space", "x".repeat(41), "under_score"]) {
        const pool = cloneTrailPool();
        pool.trails[0].id = id;
        expect(rulesOf(pool), id).toContain(R.trailId);
      }
      const dup = cloneTrailPool();
      dup.trails[1].id = dup.trails[0].id;
      expect(rulesOf(dup)).toContain(R.duplicateTrail);
    });

    it("refuses two clues of the same text differing only in case or spacing, and a code collision", () => {
      const pool = cloneTrailPool("g23");
      pool.trails[1].clues[0].text = pool.trails[0].clues[0].text.toUpperCase().replace(/ /g, "  ");
      expect(rulesOf(pool)).toContain(R.duplicateText);
    });

    it("knows two clue ids that coincide", () => {
      const a = opaqueClueId("trail-g23", "fx-01-trail", 0);
      expect(a).toMatch(/^[0-9a-f]{8}$/);
      expect(opaqueClueId("trail-g23", "fx-01-trail", 1)).not.toBe(a);
      expect(opaqueClueId("trail-g23", "fx-02-trail", 0)).not.toBe(a);
      expect(opaqueClueId("trail-g23", "fx-01-trail", 0)).toBe(a);
    });
  });

  describe("size (F-11)", () => {
    it("wants at least 45 trails", () => {
      const pool = cloneTrailPool();
      pool.trails = pool.trails.slice(0, 44);
      expect(rulesOf(pool)).toContain(R.poolSize);
      const ok = cloneTrailPool();
      ok.trails = ok.trails.slice(0, 45);
      expect(validateTrailPool(ok).filter((p) => p.rule === R.poolSize)).toEqual([]);
    });

    it("wants at least 100 clues", () => {
      const pool = cloneTrailPool("g23");
      // 50 trails of two clues is exactly 100; one trail short of that is 99.
      pool.trails = pool.trails.map((t) => ({ ...t, clues: t.clues.slice(0, 2) }));
      expect(validateTrailPool(pool).filter((p) => p.rule === R.poolSize)).toEqual([]);
      pool.trails[0].clues = pool.trails[0].clues.slice(0, 1);
      expect(rulesOf(pool)).toContain(R.trailLength);
      expect(rulesOf(pool)).toContain(R.poolSize);
    });

    it("wants at least 9 trails at every level", () => {
      const pool = cloneTrailPool();
      // Level 0 had 10 trails: move two to level 1, leaving 8.
      pool.trails.filter((t) => t.level === 0).slice(0, 2).forEach((t) => (t.level = 1));
      expect(validateTrailPool(pool)).toEqual([expect.objectContaining({ rule: R.levelSize, detail: expect.stringContaining("level 0") })]);
    });

    it("wants 2 to 4 clues a trail (k1: 2 to 3), and no place twice in one trail", () => {
      const a = cloneTrailPool("g23");
      a.trails[1].clues.push(fixtureClue("g23", "landmark:mill", 9001), fixtureClue("g23", "landmark:bridge", 9002));
      expect(rulesOf(a)).toContain(R.trailLength);
      const k1 = cloneTrailPool("k1");
      k1.trails[1].clues.push(fixtureClue("k1", "landmark:market", 9003));
      expect(k1.trails[1].clues).toHaveLength(4);
      expect(rulesOf(k1)).toContain(R.trailLength);
      const g23 = cloneTrailPool("g23");
      g23.trails[0].clues.push(fixtureClue("g23", "landmark:market", 9004));
      g23.trails[0].clues.push(fixtureClue("g23", "landmark:market", 9005));
      expect(rulesOf(g23)).toContain(R.repeatAnchor);
    });
  });

  describe("anchors", () => {
    it("refuses an unknown answer, a bad redirects key and a bad parts entry", () => {
      expect(rulesOf(withClue("g23", (c) => (c.answer = "landmark:longwater")))).toContain(R.anchor);
      expect(rulesOf(withClue("g23", (c) => (c.answer = "toString")))).toContain(R.anchor);
      expect(rulesOf(withClue("g23", (c) => (c.redirects = { "landmark:nowhere": "Not there." })))).toContain(R.anchor);
      expect(rulesOf(withClue("g68", (c) => (c.parts = [[c.answer, "landmark:nowhere"], [c.answer, "landmark:well"]])))).toContain(R.anchor);
    });

    it("refuses a redirects key that is the answer", () => {
      const pool = withClue("g23", (c) => (c.redirects = { [c.answer]: "Yes, here." }));
      expect(rulesOf(pool)).toContain(R.redirectKey);
    });

    it("accepts every anchor as an answer", () => {
      for (const id of ANCHOR_IDS) expect(rulesOf(withClue("k1", (c) => (c.answer = id))), id).not.toContain(R.anchor);
    });
  });

  describe("lengths", () => {
    // One long word: it trips the length rule alone (a single word is under the readability and k1 word limits).
    const longText = (n: number) => "a".repeat(n);
    it.each([
      ["k1", 80],
      ["g23", 180],
      ["g45", 240],
      ["g68", 300],
      ["g912", 320],
    ] as const)("caps clue text at %s: %i characters", (band, cap) => {
      const fits = withClue(band, (c) => (c.text = longText(cap)));
      expect(validateTrailPool(fits).filter((p) => p.rule === R.clueLength)).toEqual([]);
      const over = withClue(band, (c) => (c.text = longText(cap + 1)));
      expect(validateTrailPool(over).map((p) => p.rule)).toContain(R.clueLength);
    });

    it("caps k1 clue text at 12 words", () => {
      expect(rulesOf(withClue("k1", (c) => (c.text = "Go to the mill by the big red barn on the hill.")))).not.toContain(R.clueLength);
      expect(rulesOf(withClue("k1", (c) => (c.text = "Go to the mill by the big red barn on the green hill today ok.")))).toContain(R.clueLength);
    });

    it("caps a redirect at 140 characters and why at 200", () => {
      expect(rulesOf(withClue("g45", (c) => (c.redirect = "r".repeat(141))))).toContain(R.redirectLength);
      expect(rulesOf(withClue("g45", (c) => (c.redirect = "r".repeat(140))))).not.toContain(R.redirectLength);
      expect(rulesOf(withClue("g45", (c) => (c.why = "w".repeat(201))))).toContain(R.whyLength);
      expect(rulesOf(withClue("g45", (c) => (c.why = "w".repeat(200))))).not.toContain(R.whyLength);
    });

    it("holds a long clue to its band's reading ceiling (bandTopGrade plus 2) from 12 words", () => {
      expect([bandTopGrade("k1"), bandTopGrade("g23"), bandTopGrade("g45"), bandTopGrade("g68"), bandTopGrade("g912")]).toEqual(["1", "3", "5", "8", "12"]);
      const hard = "Notwithstanding considerable circumstantial extraordinarily complicated administrative responsibilities, individuals experiencing unprecedented organizational difficulties necessarily deliberate.";
      expect(rulesOf(withClue("g23", (c) => (c.text = hard)))).toContain(R.readability);
      // A short clue is exempt however long its words.
      expect(rulesOf(withClue("g23", (c) => (c.text = "Extraordinarily complicated administrative responsibilities.")))).not.toContain(R.readability);
      expect(gradeIndex(bandTopGrade("g23")) + 2).toBe(5);
    });
  });

  describe("never naming the answer", () => {
    it("a g23 clue 'Go to the mill.' fails, and a k1 one passes", () => {
      const g23 = withClue("g23", (c) => {
        c.answer = "landmark:mill";
        c.text = "Go to the mill.";
      });
      expect(validateTrailPool(g23)).toEqual([expect.objectContaining({ rule: R.namesAnswer })]);
      const k1 = withClue("k1", (c) => {
        c.answer = "landmark:mill";
        c.text = "Go to the mill.";
        c.readAloud = "Go to the mill.";
      });
      expect(validateTrailPool(k1)).toEqual([]);
    });

    it("applies to readAloud from g23 up", () => {
      const pool = withClue("g23", (c) => {
        c.answer = "landmark:mill";
        c.readAloud = "Walk to the Mill.";
      });
      expect(rulesOf(pool)).toContain(R.namesAnswer);
    });

    it("matches whole words only, case-insensitively, and every name of the place", () => {
      const ok = withClue("g23", (c) => {
        c.answer = "landmark:mill";
        c.text = "Trail step 1: go where the millstone and the milling are, a place of grain.";
      });
      expect(rulesOf(ok)).not.toContain(R.namesAnswer);
      expect(rulesOf(withClue("g23", (c) => { c.answer = "landmark:watchtower"; c.text = "Trail step 1: go to the WATCH TOWER to see far."; }))).toContain(R.namesAnswer);
      expect(rulesOf(withClue("g23", (c) => { c.answer = "landmark:watchtower"; c.text = "Trail step 1: go to the Watchtower to see far."; }))).toContain(R.namesAnswer);
      expect(rulesOf(withClue("g23", (c) => { c.answer = "object:beehives"; c.text = "Trail step 1: go where a HIVE hums."; }))).toContain(R.namesAnswer);
    });

    it("a redirect never names the answer, at k1 too (F-23)", () => {
      const generic = withClue("k1", (c) => {
        c.answer = "landmark:mill";
        c.text = "Go to the mill.";
        c.readAloud = "Go to the mill.";
        c.redirect = "Not the mill.";
      });
      expect(validateTrailPool(generic)).toEqual([expect.objectContaining({ rule: R.redirectNamesAnswer })]);
      const keyed = withClue("k1", (c) => {
        c.answer = "landmark:mill";
        c.text = "Go to the mill.";
        c.readAloud = "Go to the mill.";
        c.redirects = { "landmark:well": "The mill is the one." };
      });
      expect(validateTrailPool(keyed)).toEqual([expect.objectContaining({ rule: R.redirectNamesAnswer })]);
      const fine = withClue("k1", (c) => {
        c.answer = "landmark:mill";
        c.text = "Go to the mill.";
        c.readAloud = "Go to the mill.";
        c.redirects = { "landmark:well": "That is where water is drawn." };
      });
      expect(validateTrailPool(fine)).toEqual([]);
    });
  });

  describe("one place only (F-6)", () => {
    const trough = (c: TrailPool["trails"][0]["clues"][0]) => {
      c.answer = "object:water-trough";
      c.text = "Trail step 1: find where the animals drink water.";
    };

    it("a clue using a confusable pair's shared word must carry parts that rule the partner out", () => {
      const bare = withClue("g45", trough);
      expect(validateTrailPool(bare)).toEqual([expect.objectContaining({ rule: R.confusable })]);
      const ruled = withClue("g45", (c) => {
        trough(c);
        c.parts = [
          ["object:water-trough", "landmark:well"],
          ["object:water-trough", "object:hay-cart"],
        ];
      });
      expect(validateTrailPool(ruled)).toEqual([]);
    });

    it("parts that never list the partner do not count (the intersection rule proves nothing)", () => {
      const parts = withClue("g45", (c) => {
        trough(c);
        c.parts = [
          ["object:water-trough", "landmark:market"],
          ["object:water-trough", "object:hay-cart"],
        ];
      });
      expect(rulesOf(parts)).toEqual([R.confusable]);
    });

    it("applies at every band, to either place of a pair, in text or readAloud", () => {
      for (const band of CONTENT_BANDS) {
        expect(rulesOf(withClue(band, (c) => { c.answer = "landmark:garden"; c.text = "Trail step 1: find where flowers grow."; })), band).toContain(R.confusable);
      }
      expect(rulesOf(withClue("g45", (c) => { c.answer = "landmark:library"; c.text = "Trail step 1: find a quiet place."; c.readAloud = "Find the place with scrolls."; }))).toContain(R.confusable);
      expect(rulesOf(withClue("g45", (c) => { c.answer = "landmark:puzzle-tower"; c.text = "Trail step 1: find the tower of puzzles."; }))).toContain(R.confusable);
    });

    it("lets a k1 clue say a place by its own name even when the name holds a shared word", () => {
      const own = withClue("k1", (c) => {
        c.answer = "object:water-trough";
        c.text = "Go to the water trough.";
        c.readAloud = "Go to the water trough.";
      });
      expect(validateTrailPool(own)).toEqual([]);
      const tower = withClue("k1", (c) => {
        c.answer = "landmark:puzzle-tower";
        c.text = "Go to the Puzzle Tower.";
        c.readAloud = "Go to the puzzle tower.";
      });
      expect(validateTrailPool(tower)).toEqual([]);
      // The shared word anywhere else in the clue still counts, and so does the partner's own name.
      const wellName = withClue("k1", (c) => {
        c.answer = "landmark:well";
        c.text = "Go to the water trough.";
        c.readAloud = "Go to the water trough.";
      });
      expect(rulesOf(wellName)).toContain(R.confusable);
      const spare = withClue("k1", (c) => {
        c.answer = "object:water-trough";
        c.text = "Go to the water trough for water.";
        c.readAloud = "Go to the water trough for water.";
      });
      expect(rulesOf(spare)).toContain(R.confusable);
    });

    it.each([
      ["object:water-trough", "Go to the trough, not the well."],
      ["landmark:garden", "Go to the garden near the beehives."],
      ["object:beehives", "Go to the beehives near the garden."],
      ["landmark:library", "Go to the library, not the notice board."],
      ["object:notice-board", "Go to the board by the library."],
      ["landmark:watchtower", "Go to the watchtower, not the Puzzle Tower."],
      ["landmark:puzzle-tower", "Go to the Puzzle Tower, not the watchtower."],
      ["landmark:well", "Go to the well, not the wells or the water trough."],
    ] as const)("a k1 clue that names the partner fails: %s, %s", (answer, text) => {
      const pool = withClue("k1", (c) => {
        c.answer = answer;
        c.text = text;
        c.readAloud = text;
      });
      // (Some also trip a shared word, and the library answer repeats the fixture trail's second place: only the rule is read.)
      expect(rulesOf(pool)).toContain(R.confusable);
    });

    it("says which: the partner's name, with no shared word in play", () => {
      const pool = withClue("k1", (c) => {
        c.answer = "landmark:garden";
        c.text = "Go to the garden near the beehives.";
        c.readAloud = c.text;
      });
      expect(validateTrailPool(pool)).toEqual([expect.objectContaining({ rule: R.confusable, detail: expect.stringContaining('names object:beehives ("beehive")') })]);
    });

    it("lets a part that rules the partner out carry a clue that names it", () => {
      const ok = withClue("k1", (c) => {
        c.answer = "landmark:garden";
        c.text = "Go to the garden near the beehives.";
        c.readAloud = c.text;
        c.parts = [["landmark:garden", "object:beehives"], ["landmark:garden", "landmark:market"]];
      });
      expect(validateTrailPool(ok)).toEqual([]);
      // Parts that never list the partner, or that keep it in the intersection, do not.
      const no = withClue("k1", (c) => {
        c.answer = "landmark:garden";
        c.text = "Go to the garden near the beehives.";
        c.readAloud = c.text;
        c.parts = [["landmark:garden", "landmark:market"], ["landmark:garden", "landmark:mill"]];
      });
      expect(rulesOf(no)).toEqual([R.confusable]);
    });

    it("matches simple plurals, either way: wells, mills, buckets, hive, towers, gates", () => {
      expect(rulesOf(withClue("g23", (c) => { c.answer = "landmark:well"; c.text = "Trail step 1: find the wells of the village."; }))).toContain(R.namesAnswer);
      expect(rulesOf(withClue("g23", (c) => { c.answer = "landmark:mill"; c.text = "Trail step 1: find the mills of the village."; }))).toContain(R.namesAnswer);
      expect(rulesOf(withClue("g23", (c) => { c.answer = "landmark:castle-gate"; c.text = "Trail step 1: find the gate of the king."; }))).toContain(R.namesAnswer);
      expect(rulesOf(withClue("g23", (c) => { c.answer = "object:beehives"; c.text = "Trail step 1: find a hive of striped workers."; }))).toContain(R.namesAnswer);
      expect(rulesOf(withClue("g45", (c) => { c.answer = "landmark:well"; c.text = "Trail step 1: find where buckets are filled."; c.why = "x"; }))).toContain(R.confusable);
      expect(rulesOf(withClue("g45", (c) => { c.answer = "landmark:watchtower"; c.text = "Trail step 1: find where the towers stand."; c.why = "x"; }))).toContain(R.confusable);
      // A stem is not cut below four letters: "news" does not make "new" a shared word.
      expect(rulesOf(withClue("g45", (c) => { c.answer = "landmark:library"; c.text = "Trail step 1: find a place with a new look."; c.why = "x"; }))).not.toContain(R.confusable);
    });

    it("leaves alone a clue whose answer is neither place of the pair", () => {
      expect(rulesOf(withClue("g45", (c) => { c.answer = "landmark:mill"; c.text = "Trail step 1: find where the water turns a wheel."; }))).toEqual([]);
    });
  });

  describe("by band", () => {
    it("k1: every clue has readAloud", () => {
      expect(rulesOf(withClue("k1", (c) => delete c.readAloud))).toContain(R.readAloud);
    });

    it("g45 and up: every clue has why", () => {
      for (const band of ["g45", "g68", "g912"] as const) expect(rulesOf(withClue(band, (c) => delete c.why)), band).toContain(R.why);
      expect(rulesOf(withClue("g23", (c) => delete c.why))).toEqual([]);
    });

    it("g68 and up: every clue has at least 2 parts, each with at least 2 places, meeting at exactly the answer", () => {
      for (const band of ["g68", "g912"] as const) expect(rulesOf(withClue(band, (c) => delete c.parts)), band).toContain(R.parts);
      const ok = withClue("g68", (c) => {
        c.answer = "landmark:mill";
        c.parts = [["landmark:mill", "landmark:well"], ["landmark:mill", "landmark:garden"]];
      });
      expect(rulesOf(ok)).toEqual([]);
      const narrow = withClue("g68", (c) => {
        c.answer = "landmark:mill";
        c.parts = [["landmark:mill"], ["landmark:mill", "landmark:garden"]];
      });
      expect(rulesOf(narrow)).toContain(R.partTooNarrow);
      const one = withClue("g68", (c) => {
        c.answer = "landmark:mill";
        c.parts = [["landmark:mill", "landmark:well"]];
      });
      expect(rulesOf(one)).toContain(R.parts);
      const wide = withClue("g68", (c) => {
        c.answer = "landmark:mill";
        c.parts = [["landmark:mill", "landmark:well"], ["landmark:mill", "landmark:well", "landmark:garden"]];
      });
      expect(rulesOf(wide)).toContain(R.partsIntersect);
      const missing = withClue("g68", (c) => {
        c.answer = "landmark:mill";
        c.parts = [["landmark:bridge", "landmark:well"], ["landmark:bridge", "landmark:garden"]];
      });
      expect(rulesOf(missing)).toContain(R.partsIntersect);
    });

    it("parts at g45, where they are optional, are held to the same rule", () => {
      expect(rulesOf(withClue("g45", (c) => (c.parts = [[c.answer]])))).toEqual(expect.arrayContaining([R.partTooNarrow]));
    });
  });

  describe("words (F-16)", () => {
    it("lets 'gradual' and 'upgrade' through, and stops 'a grade' and 'kindergarten'", () => {
      expect(rulesOf(withClue("g23", (c) => (c.text = "Trail step 1: a gradual climb to the place where grain becomes flour."))), "gradual").toEqual([]);
      expect(rulesOf(withClue("g23", (c) => (c.text = "Trail step 1: the upgrade to the place where grain becomes flour."))), "upgrade").toEqual([]);
      expect(rulesOf(withClue("g23", (c) => (c.text = "Trail step 1: a grade of the place where grain becomes flour.")))).toContain(R.childWords);
      expect(rulesOf(withClue("g23", (c) => (c.text = "Trail step 1: kindergarten place where grain becomes flour.")))).toContain(R.childWords);
      expect(rulesOf(withClue("g23", (c) => (c.text = "Trail step 1: Grades of the place where grain becomes flour.")))).toContain(R.childWords);
    });

    it("keeps behind and ahead out of every field a child can read", () => {
      for (const word of ["behind", "ahead", "Ahead"]) {
        expect(rulesOf(withClue("g23", (c) => (c.text = `Trail step 1: the place ${word} where grain becomes flour.`))), word).toContain(R.childWords);
        expect(rulesOf(withClue("g23", (c) => (c.redirect = `Look ${word} you.`))), word).toContain(R.childWords);
        expect(rulesOf(withClue("g45", (c) => (c.why = `Because ${word}.`))), word).toContain(R.childWords);
        expect(rulesOf(withClue("g23", (c) => (c.redirects = { "landmark:well": `Not ${word}.` }))), word).toContain(R.childWords);
      }
      expect(rulesOf(withClue("k1", (c) => (c.readAloud = "Go to the mill, ahead.")))).toContain(R.childWords);
    });

    it("refuses markup, backticks and control characters in any text field", () => {
      for (const bad of ["a <b> tag", "a `tick`", "a\nbreak", "a\u0007bell"]) {
        expect(rulesOf(withClue("g23", (c) => (c.text = `Trail step 1: ${bad} where grain becomes flour.`))), bad).toContain(R.characters);
        expect(rulesOf(withClue("g23", (c) => (c.redirect = bad))), bad).toContain(R.characters);
        expect(rulesOf(withClue("g45", (c) => (c.why = bad))), bad).toContain(R.characters);
      }
    });
  });
});

describe("codes and keys", () => {
  it("trailKey is poolId/trailId", () => {
    expect(trailKey("trail-g23", "fx-01-trail")).toBe("trail-g23/fx-01-trail");
  });

  it("clueCode is 8 hex characters of the pool and the normalised text, and follows nothing else", () => {
    const code = clueCode("trail-g23", { text: "Go to the Mill." });
    expect(code).toMatch(/^[0-9a-f]{8}$/);
    expect(clueCode("trail-g23", { text: "  go to the   mill. " })).toBe(code);
    expect(clueCode("trail-g45", { text: "Go to the Mill." })).not.toBe(code);
    expect(clueCode("trail-g23", { text: "Go to the well." })).not.toBe(code);
  });

  it("clueCode is not the identity hash", () => {
    const clue = { text: "Go to the Mill." };
    expect(clueCode("trail-k1", clue)).not.toBe(opaqueClueId("trail-k1", "fx-01-trail", 0));
  });
});

describe("the skill map and the sheet prefixes", () => {
  it("parses to the five rows of TRAIL_SKILLS, in the shared mapRows", () => {
    const rows = mapRows("trail-skill-map.md");
    expect(rows.map((r) => r.skillId)).toEqual(Object.values(TRAIL_SKILLS));
    for (const row of rows) {
      expect(row.strand).toBe("reading");
      expect(row.grade).toBe(findSkill(row.skillId)!.grades[0]);
    }
  });

  it("names, for each band, the pool the map says", () => {
    const md = mapRows("trail-skill-map.md");
    expect(md).toHaveLength(5);
    CONTENT_BANDS.forEach((band, i) => expect(md[i].skillId).toBe(TRAIL_SKILLS[band]));
  });

  it("keeps every non-drill sheet prefix out of the drill gate (F-1)", () => {
    expect(NON_DRILL_SHEET_PREFIXES).toContain(SORT_POOL_PREFIX);
    expect(NON_DRILL_SHEET_PREFIXES).toContain(TRAIL_POOL_PREFIX);
  });
});
