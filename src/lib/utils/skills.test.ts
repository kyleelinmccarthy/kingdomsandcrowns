import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, AREA_SCHOOL, AREA_LABELS, type SkillArea } from "./skills";
import { GENERATORS } from "./drill-generators";
import { GRADES } from "./grade-levels";

const AREAS: SkillArea[] = ["math", "reading", "language", "science"];

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
    expect(skillsFor("math", "3").map((s) => s.id).sort()).toEqual(["add-100", "add-20", "sub-20"]);
    expect(skillsFor("language", "K")).toEqual([]);
    expect(findSkill("mul-facts")?.label).toBe("Multiplication facts");
    expect(findSkill("nope")).toBeNull();
    expect(skillForPool("vocab-g68")?.id).toBe("vocab-g68");
  });
});

describe("skillsFor is unchanged by the move from bands to grades", () => {
  it("pins today's grade-to-skill-ids map so the refactor cannot move anyone", () => {
    const map = Object.fromEntries(
      AREAS.map((area) => [area, Object.fromEntries(GRADES.map((g) => [g, skillsFor(area, g).map((s) => s.id)]))])
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
        "math": {
          "1": [
            "add-10",
            "sub-10",
          ],
          "10": [
            "percent-of",
            "one-step-eq",
          ],
          "11": [
            "percent-of",
            "one-step-eq",
          ],
          "12": [
            "percent-of",
            "one-step-eq",
          ],
          "2": [
            "add-20",
            "sub-20",
            "add-100",
          ],
          "3": [
            "add-20",
            "sub-20",
            "add-100",
          ],
          "4": [
            "mul-facts",
            "div-facts",
            "place-value",
          ],
          "5": [
            "mul-facts",
            "div-facts",
            "place-value",
          ],
          "6": [
            "fractions-compare",
            "integer-ops",
          ],
          "7": [
            "fractions-compare",
            "integer-ops",
          ],
          "8": [
            "fractions-compare",
            "integer-ops",
          ],
          "9": [
            "percent-of",
            "one-step-eq",
          ],
          "K": [
            "add-10",
            "sub-10",
          ],
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
