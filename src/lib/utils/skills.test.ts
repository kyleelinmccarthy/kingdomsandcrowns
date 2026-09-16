import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, AREA_SCHOOL, AREA_LABELS, type SkillArea } from "./skills";
import { GENERATORS } from "./drill-generators";
import { GRADES } from "./grade-levels";

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
      .toEqual(["area-perimeter", "div-facts", "frac-unit", "mul-facts", "round-nearest"]);
    expect(skillsFor("language", "K")).toEqual([]);
    expect(findSkill("mul-facts")?.label).toBe("Multiplication facts");
    expect(findSkill("nope")).toBeNull();
    expect(skillForPool("vocab-g68")?.id).toBe("vocab-g68");
  });
});

describe("the subjects that must not move while math is rewritten", () => {
  /**
   * Math is deliberately excluded. Every grade's math is rewritten over the next nine tasks, so a
   * snapshot covering it would be updated nine times and would stop being evidence of anything.
   * Math is pinned instead by the skill map (which the table must match, asserted separately), by
   * the universal generator property test, and by a per-grade minimum.
   *
   * These three areas, by contrast, must not move AT ALL during the math work. This snapshot is
   * what makes "the math changes touched nothing else" a fact rather than a hope — so if it fails
   * in a later task, that task reached somewhere it should not have. Do not update it; find out why.
   */
  const PINNED_AREAS: SkillArea[] = ["reading", "language", "science"];

  it("pins today's grade-to-skill-ids map so the refactor cannot move anyone", () => {
    const map = Object.fromEntries(
      PINNED_AREAS.map((area) => [area, Object.fromEntries(GRADES.map((g) => [g, skillsFor(area, g).map((s) => s.id)]))])
    );
    expect(map).toMatchInlineSnapshot(`
      {
        "language": {
          "1": [],
          "10": [
            "vocab-g912",
          ],
          "11": [
            "vocab-g912",
          ],
          "12": [
            "vocab-g912",
          ],
          "2": [
            "spell-g23",
          ],
          "3": [
            "spell-g23",
          ],
          "4": [
            "spell-g45",
            "vocab-g45",
          ],
          "5": [
            "spell-g45",
            "vocab-g45",
          ],
          "6": [
            "vocab-g68",
          ],
          "7": [
            "vocab-g68",
          ],
          "8": [
            "vocab-g68",
          ],
          "9": [
            "vocab-g912",
          ],
          "K": [],
        },
        "reading": {
          "1": [
            "sight-k1",
          ],
          "10": [],
          "11": [],
          "12": [],
          "2": [
            "sight-g23",
          ],
          "3": [
            "sight-g23",
          ],
          "4": [],
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
          "1": [
            "science-k1",
          ],
          "10": [
            "science-g912",
          ],
          "11": [
            "science-g912",
          ],
          "12": [
            "science-g912",
          ],
          "2": [
            "science-g23",
          ],
          "3": [
            "science-g23",
          ],
          "4": [
            "science-g45",
          ],
          "5": [
            "science-g45",
          ],
          "6": [
            "science-g68",
          ],
          "7": [
            "science-g68",
          ],
          "8": [
            "science-g68",
          ],
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
 * The skill map is the curriculum's source of truth, and it is a document a parent can edit.
 * This reads it directly so the table cannot drift from it — if someone moves a skill to a
 * different grade in the map and not in the code, this fails and names the skill.
 */
function mapRows(): { grade: string; skillId: string }[] {
  const md = fs.readFileSync(path.join(process.cwd(), "docs/content/math-skill-map.md"), "utf8");
  const rows: { grade: string; skillId: string }[] = [];
  let grade: string | null = null;
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // A grade cell looks like "**K**" or "**9** *(Algebra I)*"; a continuation row leaves it empty.
    const g = /\*\*([K0-9]+)\*\*/.exec(cells[1] ?? "");
    if (g) grade = g[1];
    const id = /^`([a-z0-9-]+)`$/.exec(cells[2] ?? "");
    if (id && grade) rows.push({ grade, skillId: id[1] });
  }
  return rows;
}

describe("the math skill table follows the skill map", () => {
  it("finds every row in the map, so the comparison below is not vacuous", () => {
    expect(mapRows().length).toBe(64);
  });

  it("serves exactly the map's skills at every grade", () => {
    const expected = new Map<string, string[]>();
    for (const { grade, skillId } of mapRows()) {
      expected.set(grade, [...(expected.get(grade) ?? []), skillId].sort());
    }
    for (const grade of GRADES) {
      expect(skillsFor("math", grade).map((s) => s.id).sort(), `grade ${grade}`)
        .toEqual(expected.get(grade) ?? []);
    }
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

  it("retires fractions-compare rather than deleting it, so its mastery rows still resolve", () => {
    expect(findSkill("fractions-compare")?.grades).toEqual([]);
    for (const grade of GRADES) expect(skillsFor("math", grade).map((s) => s.id)).not.toContain("fractions-compare");
  });
});
