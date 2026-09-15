import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsFor, findSkill, skillForPool, AREA_SCHOOL, AREA_LABELS } from "./skills";
import { GENERATORS } from "./drill-generators";

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
