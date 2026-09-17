import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, AREA_SCHOOL, AREA_LABELS, type SkillArea } from "./skills";
import { GENERATORS } from "./drill-generators";
import { GRADES, gradeIndex } from "./grade-levels";
import { chooseSkills } from "./deed-engine";
import type { Deed } from "./deeds";

describe("SKILLS", () => {
  it("has unique ids and resolvable sources", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SKILLS) {
      if (s.source.kind === "generator") expect(GENERATORS[s.source.generatorId]).toBeTypeOf("function");
      else expect(fs.existsSync(path.join(__dirname, "../../content/drills", `${s.source.poolId}.json`))).toBe(true);
    }
  });
  it("calls the strand Language Arts everywhere a person reads it", () => {
    expect(AREA_LABELS.language.label).toBe("Language Arts");
  });
  it("maps every area to a school", () => {
    expect(AREA_SCHOOL).toEqual({ reading: "element", language: "element", math: "form", science: "modifier" });
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
          "6": [],
          "7": [],
          "8": [],
          "9": [],
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

/**
 * A skill map is the curriculum's source of truth, and it is a document a parent can edit.
 * This reads one directly so the table cannot drift from it — if someone moves a skill to a
 * different grade in a map and not in the code, this fails and names the skill.
 *
 * ONE parser, for both maps. They differ in two cosmetic ways and in nothing that matters:
 * the math map bolds its grade cell and the ELA and science map leaves it plain, and the ELA
 * map splits its rows across a `## ` heading per strand where math has a single table. So a
 * row carries the strand it was found under, `null` for math. A second copy of this walk
 * would be a second thing to keep true.
 */
const MAP_STRANDS: Record<string, SkillArea> = {
  Reading: "reading",
  "Language Arts": "language",
  Science: "science",
};

type MapRow = { grade: string; skillId: string; strand: SkillArea | null; status: string };

function mapRows(file: string): MapRow[] {
  const md = fs.readFileSync(path.join(process.cwd(), "docs/content", file), "utf8");
  const rows: MapRow[] = [];
  let grade: string | null = null;
  let strand: SkillArea | null = null;
  for (const line of md.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      strand = MAP_STRANDS[heading[1].trim()] ?? null;
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // A grade cell is "**K**", "**9** *(Algebra I)*", "K" or "9 *(Biology)*"; a continuation
    // row in the math table leaves it empty and keeps the grade of the row above it.
    const g = /^\*{0,2}([K0-9]{1,2})\*{0,2}(?:\s|$)/.exec(cells[1] ?? "");
    if (g) grade = g[1];
    const id = /^`([a-z0-9-]+)`$/.exec(cells[2] ?? "");
    // The last cell of a row is Status in both maps, whether or not there is a Standard column.
    if (id && grade) rows.push({ grade, skillId: id[1], strand, status: cells[cells.length - 2] ?? "" });
  }
  return rows;
}

const mathMapRows = () => mapRows("math-skill-map.md");
const elaMapRows = () => mapRows("ela-science-skill-map.md");

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
    // 39 rows, 12 of them carried forward, is what the plan that fills this map was written
    // against. If either number moves, the map changed under the plan and the difference needs
    // a ruling from a person — not a number quietly adjusted here to match.
    expect(rows.length, "the ELA and science map is no longer 39 rows").toBe(39);
    expect(
      rows.filter((r) => r.status.includes("carried forward")).length,
      "the ELA and science map no longer carries 12 skills forward",
    ).toBe(12);
    // Every row must have been found under a strand heading, or a strand could go unchecked.
    expect(rows.filter((r) => r.strand === null).map((r) => r.skillId)).toEqual([]);
  });

  /**
   * **The content progress bar for this plan.** These are the map's 27 rows that no pool has
   * been written for yet — this task moves the existing twelve onto grades and authors
   * nothing. **It must reach `[]` by the end of this plan.** Each later task that writes a
   * pool deletes its line here; the test below fails until the line goes, and it also fails
   * if a line is deleted without the pool actually arriving, so the list cannot be fudged in
   * either direction. When it is empty, the comparison below is the map, unfiltered.
   */
  const POOLS_NOT_YET_WRITTEN = [
    "read-g5", "read-g6",
    "read-g7", "read-g8", "read-g9", "read-g10", "read-g11", "read-g12",
    "lang-g7", "lang-g8", "lang-g10", "lang-g11", "lang-g12",
    "science-g1", "science-g3", "science-g5", "science-g7",
    "science-g8", "science-g10", "science-g11", "science-g12",
  ];

  it("has a skill for every map row except the pools not yet written", () => {
    const missing = elaMapRows().filter((r) => findSkill(r.skillId) === null).map((r) => r.skillId);
    expect(missing.sort(), "the unwritten-pool list is not the real one").toEqual([...POOLS_NOT_YET_WRITTEN].sort());
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
