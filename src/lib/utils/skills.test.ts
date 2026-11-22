import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, schoolLines, choiceDrawable, AREA_SCHOOL, AREA_LABELS, LOGIC_SKILL_IDS, type SkillArea } from "./skills";
import { GENERATORS } from "./drill-generators";
import { lockFor } from "@/lib/tasks/locks";
import { GRADES, gradeIndex } from "./grade-levels";
import { chooseSkills } from "./deed-engine";
import type { Deed } from "./deeds";
import { mapRows } from "@/test/skill-map";

describe("SKILLS", () => {
  it("has unique ids and resolvable sources", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SKILLS) {
      if (s.source.kind === "generator") expect(GENERATORS[s.source.generatorId]).toBeTypeOf("function");
      else if (s.source.kind === "lock") expect(s.area, `${s.id} is a lock skill outside logic`).toBe("logic");
      // A trail skill has no pool file to find: its clues live in `src/content/trails/` (H4), and only reading plays them.
      else if (s.source.kind === "trail") expect(s.area, `${s.id} is a trail skill outside reading`).toBe("reading");
      // A rune skill has no pool file either: its words live in `src/content/runes/` (I4), and only language plays them (R-I7).
      else if (s.source.kind === "rune") expect(s.area, `${s.id} is a rune skill outside language`).toBe("language");
      else expect(fs.existsSync(path.join(__dirname, "../../content/drills", `${s.source.poolId}.json`))).toBe(true);
    }
  });
  it("calls the strand Language Arts everywhere a person reads it", () => {
    expect(AREA_LABELS.language.label).toBe("Language Arts");
  });
  it("maps every area to a school", () => {
    expect(AREA_SCHOOL).toEqual({ reading: "element", language: "element", math: "form", science: "modifier", logic: "none" });
  });
  it("finds skills by area and grade, and pools by id", () => {
    expect(skillsFor("math", "3").map((s) => s.id).sort())
      .toEqual(["add-1000", "area-perimeter", "div-facts", "frac-unit", "mul-facts", "round-nearest", "sub-1000"]);
    expect(skillsFor("language", "K").map((s) => s.id)).toEqual(["lang-gk"]);
    expect(findSkill("mul-facts")?.label).toBe("Multiplication facts");
    expect(findSkill("nope")).toBeNull();
    expect(skillForPool("vocab-g68")?.id).toBe("vocab-g68");
  });
});

describe("which grade each strand is actually served at", () => {
  /**
   * Math is deliberately excluded. Every grade's math was rewritten over nine tasks, so a
   * snapshot covering it would have been updated nine times and would stop being evidence of
   * anything. Math is pinned instead by the skill map (which the table must match, asserted
   * separately), by the universal generator property test, and by a per-grade minimum.
   *
   * **This snapshot changed once, deliberately, in the task that keyed these three strands to
   * grades**, and the diff was read line by line: every line was a REMOVAL, a band collapsing
   * onto the one grade `ela-science-skill-map.md` assigns it. No grade gained a skill.
   *
   * Through the whole math rewrite it said "do not update it; find out why", and that was
   * right then: the three strands had to stay exactly still while math moved. The rule it
   * carries now is narrower but the same in spirit — a task that AUTHORS a pool adds that one
   * grade's id and nothing else, so anything else in the diff is that task reaching somewhere
   * it should not have. Read every line before accepting it; never run `-u` on a red run to
   * see what happens.
   */
  const PINNED_AREAS: SkillArea[] = ["reading", "language", "science"];

  it("pins the grade-to-skill-ids map, so no strand moves without a diff saying so", () => {
    const map = Object.fromEntries(
      PINNED_AREAS.map((area) => [area, Object.fromEntries(GRADES.map((g) => [g, skillsFor(area, g).map((s) => s.id)]))])
    );
    expect(map).toMatchInlineSnapshot(`
      {
        "language": {
          "1": [
            "lang-g1",
            "spell-g1",
          ],
          "10": [],
          "11": [],
          "12": [],
          "2": [
            "spell-g23",
          ],
          "3": [
            "lang-g3",
          ],
          "4": [
            "spell-g45",
          ],
          "5": [
            "vocab-g45",
          ],
          "6": [
            "vocab-g68",
          ],
          "7": [],
          "8": [],
          "9": [
            "vocab-g912",
          ],
          "K": [
            "lang-gk",
          ],
        },
        "reading": {
          "1": [
            "read-g1",
          ],
          "10": [],
          "11": [],
          "12": [],
          "2": [
            "sight-g23",
          ],
          "3": [
            "read-g3",
          ],
          "4": [
            "read-g4",
          ],
          "5": [],
          "6": [
            "read-g6",
          ],
          "7": [],
          "8": [],
          "9": [
            "read-g9",
          ],
          "K": [
            "sight-k1",
          ],
        },
        "science": {
          "1": [],
          "10": [],
          "11": [],
          "12": [],
          "2": [
            "science-g23",
          ],
          "3": [],
          "4": [
            "science-g45",
          ],
          "5": [],
          "6": [
            "science-g68",
          ],
          "7": [],
          "8": [],
          "9": [
            "science-g912",
          ],
          "K": [
            "science-k1",
          ],
        },
      }
    `);
  });
});

describe("the rune-only rows (R-I7)", () => {
  it("adds spelling at grade 1 as a rune-only row, after lang-g1", () => {
    expect(findSkill("spell-g1")).toEqual({
      id: "spell-g1", label: "Spelling", area: "language", grades: ["1"], source: { kind: "rune" },
    });
    expect(skillsFor("language", "1").map((s) => s.id)).toEqual(["lang-g1", "spell-g1"]);
    expect(SKILLS.findIndex((s) => s.id === "spell-g1")).toBe(SKILLS.findIndex((s) => s.id === "lang-g1") + 1);
  });

  it("is the only rune source, and it is never multiple choice", () => {
    expect(SKILLS.filter((s) => s.source.kind === "rune").map((s) => s.id)).toEqual(["spell-g1"]);
    expect(choiceDrawable(findSkill("spell-g1")!)).toBe(false);
    // The existing language rows are untouched.
    for (const id of ["lang-gk", "lang-g1", "lang-g3", "spell-g23", "spell-g45", "vocab-g45", "vocab-g68", "vocab-g912"]) {
      expect(choiceDrawable(findSkill(id)!), id).toBe(true);
    }
  });
});

describe("the trail skills (R-H8)", () => {
  it("adds reading at six and nine as trail-only rows, labelled from the ELA map", () => {
    expect(findSkill("read-g6")).toEqual({
      id: "read-g6", label: "Author's purpose and point of view", area: "reading", grades: ["6"], source: { kind: "trail" },
    });
    expect(findSkill("read-g9")).toEqual({
      id: "read-g9", label: "Tone and word choice", area: "reading", grades: ["9"], source: { kind: "trail" },
    });
    expect(skillsFor("reading", "6").map((s) => s.id)).toEqual(["read-g6"]);
    expect(skillsFor("reading", "9").map((s) => s.id)).toEqual(["read-g9"]);
  });

  it("is played only as reading, and nothing else uses the trail source", () => {
    expect(SKILLS.filter((s) => s.source.kind === "trail").map((s) => s.id)).toEqual(["read-g6", "read-g9"]);
  });

  it("choiceDrawable is true for a generator or pool skill, false for a lock or trail skill", () => {
    for (const id of ["read-g4", "add-10", "sight-k1", "vocab-g68"]) expect(choiceDrawable(findSkill(id)!), id).toBe(true);
    for (const id of ["read-g6", "read-g9", "logic-g45", "logic-k1"]) expect(choiceDrawable(findSkill(id)!), id).toBe(false);
  });

  it("every skill is choice-drawable unless it is a lock, trail or rune skill", () => {
    for (const s of SKILLS) expect(choiceDrawable(s), s.id).toBe(s.source.kind === "generator" || s.source.kind === "pool");
  });

  it("the climb inventory: chooseSkills (unfiltered) now finds read-g6 at 6 to 8 and read-g9 at 9 to 12, never a climb", () => {
    const reading = { area: "reading" } as Deed;
    for (const g of ["6", "7", "8"] as const) expect(chooseSkills(reading, g).map((s) => s.id), `grade ${g}`).toEqual(["read-g6"]);
    for (const g of ["9", "10", "11", "12"] as const) expect(chooseSkills(reading, g).map((s) => s.id), `grade ${g}`).toEqual(["read-g9"]);
  });
});

/**
 * A skill map is the curriculum's source of truth, and it is a document a parent can edit.
 * These tests read one directly (through the shared parser in `src/test/skill-map.ts`, F-12) so the
 * table cannot drift from it: if someone moves a skill to a different grade in a map and not in the
 * code, they fail and name the skill.
 */
const mathMapRows = () => mapRows("math-skill-map.md");
const elaMapRows = () => mapRows("ela-science-skill-map.md");
const logicMapRows = () => mapRows("logic-skill-map.md");

describe("the math skill table follows the skill map", () => {
  it("finds every row in the map, so the comparison below is not vacuous", () => {
    expect(mathMapRows().length).toBe(68);
  });

  it("serves exactly the map's skills at every grade", () => {
    const expected = new Map<string, string[]>();
    for (const { grade, skillId } of mathMapRows()) {
      expected.set(grade, [...(expected.get(grade) ?? []), skillId].sort());
    }
    for (const grade of GRADES) {
      expect(skillsFor("math", grade).map((s) => s.id).sort(), `grade ${grade}`)
        .toEqual(expected.get(grade) ?? []);
    }
  });
});

/** The three strands `ela-science-skill-map.md` governs. Math has its own map, above. */
const AUTHORED_AREAS = ["reading", "language", "science"] as const;

describe("the ELA and science skill tables follow the skill map", () => {
  it("finds every row in the map, so the comparisons below are not vacuous", () => {
    const rows = elaMapRows();
    // 40 rows, 12 of them carried forward, is what the plan that fills this map was written
    // against, plus `spell-g1` (R-I7): the spec named it (§2a, §4.7) and the owner approved the
    // row, so that plan is the ruling this count was waiting for. If either number moves again,
    // the map changed under the plan and the difference needs a ruling from a person — not a
    // number quietly adjusted here to match.
    expect(rows.length, "the ELA and science map is no longer 40 rows").toBe(40);
    expect(
      rows.filter((r) => r.status.includes("carried forward")).length,
      "the ELA and science map no longer carries 12 skills forward",
    ).toBe(12);
    // Every row must have been found under a strand heading, or a strand could go unchecked.
    expect(rows.filter((r) => r.strand === null).map((r) => r.skillId)).toEqual([]);
  });

  /**
   * **The content progress bar for this plan.** These are the map's rows that no pool has been
   * written for yet (27 when the plan began; the map's `spell-g1` row is played as runes and is
   * not one of them). **It must reach `[]` by the end of this plan.** Each later task that writes a
   * pool deletes its line here; the test below fails until the line goes, and it also fails
   * if a line is deleted without the pool actually arriving, so the list cannot be fudged in
   * either direction. When it is empty, the comparison below is the map, unfiltered.
   */
  const POOLS_NOT_YET_WRITTEN = [
    "read-g5",
    "read-g7", "read-g8", "read-g10", "read-g11", "read-g12",
    "lang-g7", "lang-g8", "lang-g10", "lang-g11", "lang-g12",
    "science-g1", "science-g3", "science-g5", "science-g7",
    "science-g8", "science-g10", "science-g11", "science-g12",
  ];

  it("has a skill for every map row except the pools not yet written", () => {
    const missing = elaMapRows().filter((r) => findSkill(r.skillId) === null).map((r) => r.skillId);
    expect(missing.sort(), "the unwritten-pool list is not the real one").toEqual([...POOLS_NOT_YET_WRITTEN].sort());
  });

  it("says in the map that the trail-only rows are played as reading trails, with no multiple-choice pool", () => {
    const status = (id: string) => elaMapRows().find((r) => r.skillId === id)?.status;
    expect(status("read-g6")).toBe("new — played as reading trails; no multiple-choice pool yet");
    expect(status("read-g9")).toBe("new — played as reading trails; no multiple-choice pool yet");
    // Every other row keeps the status it had.
    expect(elaMapRows().filter((r) => r.status.includes("trails")).map((r) => r.skillId)).toEqual(["read-g6", "read-g9"]);
  });

  it("says in the map that spell-g1 is played as rune spellcraft, with no multiple-choice pool", () => {
    const row = elaMapRows().find((r) => r.skillId === "spell-g1");
    expect(row).toEqual({ grade: "1", skillId: "spell-g1", strand: "language", status: "new — played as rune spellcraft; no multiple-choice pool yet" });
  });

  it("serves exactly the ELA and science map's skills at every grade", () => {
    const expected = new Map<string, string[]>();
    for (const { grade, skillId, strand } of elaMapRows()) {
      if (POOLS_NOT_YET_WRITTEN.includes(skillId)) continue;
      const key = `${strand}:${grade}`;
      expected.set(key, [...(expected.get(key) ?? []), skillId].sort());
    }
    for (const area of AUTHORED_AREAS) {
      for (const grade of GRADES) {
        expect(skillsFor(area, grade).map((s) => s.id).sort(), `${area} grade ${grade}`)
          .toEqual(expected.get(`${area}:${grade}`) ?? []);
      }
    }
  });

  /**
   * The twelve pools that existed before this map. `skill_mastery` is keyed by skill id, so
   * losing or renaming one silently resets every child's practice history on it. They keep
   * their ids, their items and their sources; only the grade they are offered at moves.
   */
  const CARRIED_FORWARD = [
    "sight-k1", "sight-g23",
    "spell-g23", "spell-g45", "vocab-g45", "vocab-g68", "vocab-g912",
    "science-k1", "science-g23", "science-g45", "science-g68", "science-g912",
  ];

  it("keeps every carried-forward pool id, each now at exactly one grade", () => {
    expect(elaMapRows().filter((r) => r.status.includes("carried forward")).map((r) => r.skillId).sort())
      .toEqual([...CARRIED_FORWARD].sort());
    for (const id of CARRIED_FORWARD) {
      const skill = findSkill(id);
      expect(skill, `skill ${id} was removed`).not.toBeNull();
      expect(skill!.grades, `skill ${id} is offered at more than one grade`).toHaveLength(1);
      expect(skill!.source.kind, `skill ${id} lost its pool`).toBe("pool");
    }
  });

  it("offers each authored skill at exactly one grade", () => {
    const spread = SKILLS.filter((s) => s.area !== "math" && s.grades.length !== 1);
    expect(spread.map((s) => s.id), "a strand skill spanning grades means the map was not applied").toEqual([]);
  });
});

/**
 * **The honest progress bar for this plan.**
 *
 * `chooseSkills` walks `nearestGrades`, which is easier-first by design — but a grade with
 * nothing at or below it runs off the bottom of the ladder and walks UP, handing a child a
 * harder grade's work rather than an empty quest. The fallback is not being changed here: an
 * empty quest is worse than a hard one. What is changing is that the cost is counted.
 *
 * **`EXPECTED_CLIMBS` has reached `[]`.** Every entry was a real child being handed work from a
 * year they had not reached: both were Language Arts, a five-year-old and a six-year-old on a
 * side quest getting grade-2 spelling because nothing easier existed. Authoring `lang-gk` and
 * `lang-g1` gave those two grades their own pools, so the upward walk no longer happens
 * anywhere. The literal stays `[]`: a new climb is a defect, not a line to add here.
 *
 * Falling DOWN is not on this list and is not a defect: with reading authored no higher than
 * grade 4 today, a grade-9 hero gets grade-4 reading. That is the walk doing what it says.
 *
 * `deed-engine.test.ts` keeps the same inventory across all four areas, phrased from the deed
 * side; if you empty one, empty the other.
 */
const EXPECTED_CLIMBS: string[] = [];

describe("the fallback ladder", () => {
  it("never walks UP to find content, except where the map says a grade is still empty", () => {
    const climbs: string[] = [];
    for (const area of AUTHORED_AREAS) {
      for (const grade of GRADES) {
        const served = chooseSkills({ area } as Deed, grade);
        expect(served.length, `${area} grade ${grade} is handed an empty quest`).toBeGreaterThan(0);
        for (const s of served) {
          const servedAt = s.grades[0];
          if (servedAt && gradeIndex(servedAt) > gradeIndex(grade)) climbs.push(`${area} grade ${grade} climbs to ${servedAt}`);
        }
      }
    }
    expect([...new Set(climbs)].sort()).toEqual(EXPECTED_CLIMBS);
  });
});

describe("the invariants the map comparison cannot state", () => {
  it("gives every grade its own math, so no child falls back for math", () => {
    for (const grade of GRADES) expect(skillsFor("math", grade).length, `grade ${grade}`).toBeGreaterThanOrEqual(3);
  });

  it("keeps every skill id that has ever existed", () => {
    // The ids that existed before this plan. Losing one silently orphans mastery rows.
    const before = ["add-10", "sub-10", "add-20", "sub-20", "add-100", "mul-facts", "div-facts",
      "place-value", "fractions-compare", "integer-ops", "percent-of", "one-step-eq"];
    for (const id of before) expect(findSkill(id), `skill ${id} was removed`).not.toBeNull();
  });

  it("offers each math skill at exactly one grade", () => {
    const spread = SKILLS.filter((s) => s.area === "math" && s.grades.length > 1);
    expect(spread.map((s) => s.id), "a math skill spanning grades means the map was not applied").toEqual([]);
  });

  /**
   * The bands each carried-forward skill sat in before this plan, written out here rather than
   * read from anywhere: `content-bands.ts` still has the bands, but nothing still records which
   * skill was in which, and the point of this check is to compare against what actually was.
   */
  const BEFORE_THIS_PLAN: Record<string, string[]> = {
    "add-10": ["K", "1"], "sub-10": ["K", "1"],
    "add-20": ["2", "3"], "sub-20": ["2", "3"], "add-100": ["2", "3"],
    "mul-facts": ["4", "5"], "div-facts": ["4", "5"], "place-value": ["4", "5"],
    "fractions-compare": ["6", "7", "8"], "integer-ops": ["6", "7", "8"],
    "percent-of": ["9", "10", "11", "12"], "one-step-eq": ["9", "10", "11", "12"],
  };

  /**
   * The map's prose said three skills changed which grade they are offered at. **Eleven did** —
   * every carried-forward skill still offered — and the eight it left out include a grade-1
   * child moving from addition within 10 to within 20 and a grade-3 child picking up the
   * multiplication facts. None of those moves is wrong; the map being wrong about them is, and
   * a map that under-reports is worse than no map, because it is the thing a parent reads.
   *
   * This reads the section back so the prose cannot drift again: the skills it lists and the
   * grades it claims for them have to be exactly the skills whose grade moved and the grades
   * the code actually serves. `fractions-compare` is excluded because it moved to nowhere and
   * has a paragraph of its own.
   */
  it("says in the map exactly which carried-forward skills changed grade, and to what", () => {
    const md = fs.readFileSync(path.join(process.cwd(), "docs/content/math-skill-map.md"), "utf8");
    const section = md.split(/^## /m).find((part) => part.startsWith("Every skill carried forward"));
    expect(section, "the map no longer has a section on skills that changed grade").toBeDefined();

    const claimed = new Map<string, string>();
    for (const line of section!.split("\n")) {
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length < 5 || !cells[1].startsWith("`")) continue;
      const grade = /^([K0-9]+)/.exec(cells[3]);
      expect(grade, `the map claims an unreadable grade: ${line}`).not.toBeNull();
      for (const id of cells[1].split(",").map((c) => c.trim().replace(/`/g, ""))) claimed.set(id, grade![1]);
    }

    const moved = Object.keys(BEFORE_THIS_PLAN).filter(
      (id) => id !== "fractions-compare" && String(findSkill(id)?.grades) !== String(BEFORE_THIS_PLAN[id]),
    );
    expect([...claimed.keys()].sort(), "the map's list of skills that changed grade is not the real one").toEqual(moved.sort());
    for (const [id, grade] of claimed) {
      expect(findSkill(id)?.grades, `the map says ${id} is offered at grade ${grade}`).toEqual([grade]);
    }
  });

  it("retires fractions-compare rather than deleting it, so its mastery rows still resolve", () => {
    expect(findSkill("fractions-compare")?.grades).toEqual([]);
    for (const grade of GRADES) expect(skillsFor("math", grade).map((s) => s.id)).not.toContain("fractions-compare");
  });
});

describe("the logic area", () => {
  it("has one row per band, each at the band's lowest grade and played on a lock", () => {
    const rows = SKILLS.filter((s) => s.area === "logic");
    expect(rows.map((s) => [s.id, s.grades, s.label])).toEqual([
      ["logic-k1", ["K"], "Patterns and sorting"],
      ["logic-g23", ["2"], "Shape grids and balances"],
      ["logic-g45", ["4"], "Number cages"],
      ["logic-g68", ["6"], "Cages and logic grids"],
      ["logic-g912", ["9"], "Cages, nonograms and logic"],
    ]);
    for (const s of rows) expect(s.source, s.id).toEqual({ kind: "lock" });
    expect([...LOGIC_SKILL_IDS]).toEqual(rows.map((s) => s.id));
  });

  it("is labelled Logic, and no other area is played on a lock", () => {
    expect(AREA_LABELS.logic).toEqual({ label: "Logic", color: "#0ea5e9" });
    expect(SKILLS.filter((s) => s.source.kind === "lock").map((s) => s.area)).toEqual(Array(5).fill("logic"));
  });

  it("resolves the other grades to the nearest band, easier first", () => {
    const at = (g: string) => chooseSkills({ area: "logic" } as Deed, g as never).map((s) => s.id);
    expect(at("K")).toEqual(["logic-k1"]);
    expect(at("1")).toEqual(["logic-k1"]);
    expect(at("3")).toEqual(["logic-g23"]);
    expect(at("5")).toEqual(["logic-g45"]);
    expect(at("8")).toEqual(["logic-g68"]);
    expect(at("12")).toEqual(["logic-g912"]);
  });

  it("belongs to no spell school", () => {
    expect(schoolLines().flatMap((l) => l.areas)).not.toContain("logic");
  });

  it("follows docs/content/logic-skill-map.md, row for row", () => {
    const rows = logicMapRows();
    expect(rows.length, "the logic map is not 5 rows").toBe(5);
    expect(rows.filter((r) => r.strand !== "logic").map((r) => r.skillId)).toEqual([]);
    expect(rows.map((r) => [r.grade, r.skillId])).toEqual(
      SKILLS.filter((s) => s.area === "logic").map((s) => [s.grades[0], s.id]),
    );
  });

  it("has a lock generator for every logic skill", () => {
    for (const id of LOGIC_SKILL_IDS) expect(lockFor(id), id).toBeTypeOf("function");
    expect(LOGIC_SKILL_IDS.filter((id) => !lockFor(id))).toEqual([]);
  });
});
