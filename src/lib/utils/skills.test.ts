import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, AREA_SCHOOL, AREA_LABELS, BAND_GRADES, type SkillArea } from "./skills";
import { GENERATORS } from "./drill-generators";
import { GRADES, bandForGrade, type Grade } from "./grade-levels";

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
      .toEqual(["add-100", "add-20", "area-perimeter", "frac-unit", "round-nearest", "sub-20"]);
    expect(skillsFor("language", "K")).toEqual([]);
    expect(findSkill("mul-facts")?.label).toBe("Multiplication facts");
    expect(findSkill("nope")).toBeNull();
    expect(skillForPool("vocab-g68")?.id).toBe("vocab-g68");
  });
});

describe("no skill's grade set is a partial band", () => {
  /**
   * NOT an equivalence proof, despite how it reads. Both sides of the comparison below
   * read `s.grades`, so a skill moved wholesale from one band to another passes here —
   * the oracle moves with it. What this DOES pin is that no skill's grade set is a
   * partial band: any edit that splits a band (giving a skill grades 6 and 7 but not 8,
   * or lending it one grade from the band next door) shows up here immediately.
   *
   * Equivalence with the old band behaviour is pinned by the inline snapshot below,
   * which was captured against the pre-refactor code and committed in `e546924` before
   * a line of `skills.ts` changed. If that snapshot ever fails, do not reach for `-u`:
   * this test passing alongside it means nothing about whether content moved.
   */
  /**
   * Math is excluded, and this is the task that excluded it. From grade K and grade 1
   * onwards the math table is keyed to single grades, so the band oracle below is no
   * longer true of math — and an oracle asserting something false is worse than no
   * oracle. The three areas that must NOT move during the math work keep it. Task 13
   * deletes this block along with the last band reference.
   */
  const BAND_AREAS: SkillArea[] = ["reading", "language", "science"];

  it.each(BAND_AREAS.flatMap((area) => GRADES.map((g) => [area, g] as [SkillArea, Grade])))(
    "%s at grade %s is served by whole bands, not part of one",
    (area, grade) => {
      const expected = SKILLS.filter(
        (s) => s.area === area && s.grades.some((sg) => bandForGrade(sg) === bandForGrade(grade))
      );
      // Not a subset check: the exact set, so a skill gained or lost is caught.
      expect(skillsFor(area, grade).map((s) => s.id).sort()).toEqual(expected.map((s) => s.id).sort());
    }
  );

  it("expands each band to exactly the grades bandForGrade assigns it", () => {
    // Every band, not just the ones BAND_GRADES happens to list: iterating the literal
    // alone would quietly pass if a band were dropped from it entirely.
    expect(Object.keys(BAND_GRADES).sort()).toEqual(["g23", "g45", "g68", "g912", "k1"]);
    for (const [band, grades] of Object.entries(BAND_GRADES)) {
      expect(GRADES.filter((g) => bandForGrade(g) === band)).toEqual([...grades]);
    }
    // And between them the bands cover the whole ladder, so no grade is left unreachable.
    expect(Object.values(BAND_GRADES).flatMap((g) => [...g]).sort()).toEqual([...GRADES].sort());
  });

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
