import { describe, expect, it } from "vitest";
import { bandSkill } from "./band-skill";
import { GRADES } from "./grade-levels";
import { findSkill } from "./skills";

describe("bandSkill", () => {
  it("finds the skill an accepting rule takes, and the grade it was found at", () => {
    expect(bandSkill("reading", "K", (s) => s.id === "read-g1")).toMatchObject({ skill: { id: "read-g1" }, grade: "1" });
    expect(bandSkill("reading", "3", () => true)).toMatchObject({ skill: { id: "read-g3" }, grade: "3" });
  });

  it("returns the grade the skill was found at, which names the run's band", () => {
    expect(bandSkill("reading", "2", (s) => s.id === "read-g3")?.grade).toBe("3");
  });

  it("stays inside the hero's band: grade 3 is outside grade 4's band", () => {
    expect(bandSkill("reading", "4", (s) => s.id === "read-g3")).toBeNull();
    expect(bandSkill("reading", "1", (s) => s.id === "read-g4")).toBeNull();
  });

  it("gives null when nothing is accepted, never a throw", () => {
    for (const g of GRADES) expect(bandSkill("reading", g, () => false), g).toBeNull();
  });

  it("walks nearestGrades, so an easier grade of the band is found first", () => {
    // Grade 5 is in 4-5's band; only grade 4 has a reading skill there.
    expect(bandSkill("reading", "5", () => true)?.skill.id).toBe("read-g4");
  });

  it("reaches the trail skills by their own grades", () => {
    expect(bandSkill("reading", "7", (s) => s.id === "read-g6")?.skill).toBe(findSkill("read-g6"));
    expect(bandSkill("reading", "10", (s) => s.id === "read-g9")?.skill).toBe(findSkill("read-g9"));
  });
});
