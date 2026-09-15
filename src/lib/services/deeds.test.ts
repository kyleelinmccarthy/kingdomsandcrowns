import { describe, it, expect } from "vitest";
import { buildKingdomOverview, gradeForDeed, gradesFor, heroLevels, ownGradeOf } from "./deeds";
import { findDeed } from "@/lib/utils/deeds";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { bandForHero, type ContentBand } from "@/lib/utils/content-bands";
import { bandForGrade, NO_OFFSETS } from "@/lib/utils/grade-levels";
import type { AgeMode } from "@/lib/utils/age-mode";

describe("buildKingdomOverview", () => {
  it("lists every building with progress, clamped, and tone-aware stories", () => {
    const gentle = buildKingdomOverview([{ buildingId: "well", deedsDone: 3 }, { buildingId: "bridge", deedsDone: 9 }], "gentle");
    expect(gentle.length).toBe(BUILDINGS.length);
    expect(gentle.find((b) => b.id === "well")).toMatchObject({ done: 3, total: 5, complete: false });
    expect(gentle.find((b) => b.id === "bridge")).toMatchObject({ done: 5, total: 5, complete: true });
    expect(gentle.find((b) => b.id === "mill")).toMatchObject({ done: 0, complete: false });
    const planks = gentle.find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    const monsters = buildKingdomOverview([], "monsters").find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    expect(planks.story).not.toBe(monsters.story);
    expect(monsters.story).toMatch(/Shadow blobs/);
  });
});

describe("ownGradeOf", () => {
  const today = new Date("2026-09-15T00:00:00Z");

  it("uses the grade a grown-up set, whatever else the hero has", () => {
    expect(ownGradeOf("6", 2010, "middle", today)).toBe("6");
    expect(ownGradeOf("K", 1990, "high", today)).toBe("K");
    expect(ownGradeOf("12", null, "elementary", today)).toBe("12");
  });

  it("refines the age mode with the birth year, inside the band the hero is already in", () => {
    expect(ownGradeOf(null, 2019, "elementary", today)).toBe("2"); // 2026 - 2019 - 5, still g23
    expect(ownGradeOf(null, 2013, "middle", today)).toBe("8"); // still g68
    expect(ownGradeOf(null, 2008, "high", today)).toBe("12"); // clamped at the top, still g912
  });

  it("never lets the age estimate move a hero out of the band their age mode put them in", () => {
    // `ageMode` is set at sign-up and never recomputed, so the estimate drifts past it
    // as a child ages. A deploy must not promote anyone: only a grown-up setting a
    // real grade does that. These are the ages the reviewer measured as regressions.
    expect(ownGradeOf(null, 2017, "elementary", today)).toBe("3"); // age 9 would estimate g45
    expect(ownGradeOf(null, 2016, "elementary", today)).toBe("3"); // age 10 would estimate g45
    expect(ownGradeOf(null, 2012, "middle", today)).toBe("6"); // age 14 would estimate g912
    expect(ownGradeOf(null, 2021, "elementary", today)).toBe("3"); // age 5 would estimate k1
  });

  it("does not trust a stored grade that is not on the ladder", () => {
    // `child.grade` is a plain nullable text column, so anything can be in it.
    expect(ownGradeOf("13", 2019, "elementary", today)).toBe("2");
    expect(ownGradeOf("", 2019, "elementary", today)).toBe("2");
    expect(ownGradeOf("kindergarten", null, "middle", today)).toBe("6");
  });

  it("keeps EVERY gradeless hero in the band they were already in, at any age", () => {
    // The whole invariant, not a sample: for every age mode and every plausible birth
    // year (including none), the band must be the one `bandForHero` gave before.
    const modes: AgeMode[] = ["elementary", "middle", "high"];
    for (const mode of modes) {
      for (const birthYear of [null, ...Array.from({ length: 22 }, (_, i) => 2004 + i)]) {
        const now: ContentBand = bandForGrade(ownGradeOf(null, birthYear, mode, today));
        expect(`${mode}/${birthYear}:${now}`).toBe(`${mode}/${birthYear}:${bandForHero(null, mode)}`);
      }
    }
  });

  it("keeps a hero with neither grade nor birth year in the band they were already in", () => {
    // The regression this guards: a hard-coded grade-3 fallback would demote a
    // middle-schooler from grades 6-8 work to grades 2-3 work, silently.
    const modes: AgeMode[] = ["elementary", "middle", "high"];
    for (const mode of modes) {
      const now: ContentBand = bandForGrade(ownGradeOf(null, null, mode, today));
      expect(`${mode}:${now}`).toBe(`${mode}:${bandForHero(null, mode)}`);
    }
    expect(ownGradeOf(null, null, "elementary", today)).toBe("3");
    expect(ownGradeOf(null, null, "middle", today)).toBe("6");
    expect(ownGradeOf(null, null, "high", today)).toBe("9");
  });
});

describe("gradesFor", () => {
  it("moves each strand by its OWN gap, never another strand's", () => {
    // Four distinct offsets, so a cross-wired strand cannot pass by coincidence.
    expect(gradesFor("3", { math: 1, reading: -1, language: 0, science: 2 })).toEqual({
      math: "4", reading: "2", language: "3", science: "5",
    });
  });

  it("leaves every strand at the hero's own grade when no grown-up has set a gap", () => {
    expect(gradesFor("6", NO_OFFSETS)).toEqual({ math: "6", reading: "6", language: "6", science: "6" });
  });

  it("is what reaches multiplication: +1 math at grade 3 asks the grades 4-5 band", () => {
    const grades = gradesFor("3", { ...NO_OFFSETS, math: 1 });
    expect(grades.math).toBe("4");
    expect(bandForGrade(grades.math)).toBe("g45");
    // and the strands the grown-up did not touch stay exactly where they were
    expect(bandForGrade(grades.reading)).toBe(bandForGrade("3"));
  });

  it("clamps the derived grade at both ends of the ladder", () => {
    expect(gradesFor("K", { ...NO_OFFSETS, math: -3 }).math).toBe("K");
    expect(gradesFor("12", { ...NO_OFFSETS, science: 4 }).science).toBe("12");
  });
});

describe("heroLevels — the whole composition, without a database", () => {
  // The rows `loadHeroLevels` fetches, as the database hands them over.
  const hero = { grade: "3", birthYear: null, ageMode: "elementary" };
  const settings = { enabled: true, toneMode: "gentle" as const };

  it("carries EVERY strand's saved gap through to the grade the engine is asked on", () => {
    // Four different offsets, so dropping them (or reading one strand's for all four)
    // cannot pass by coincidence. This is the step where a grown-up's setting either
    // reaches the engine or quietly reaches nothing at all: a composition that ignored
    // the profile row would leave all four at Grade 3 and every level ever set would be
    // dead, with the rest of the suite still green.
    const levels = heroLevels(hero, { mathOffset: 2, readingOffset: -1, languageOffset: 0, scienceOffset: 1 }, settings);
    expect(levels.grades).toEqual({ math: "5", reading: "2", language: "3", science: "4" });
  });

  it("leaves a hero with no profile row at their own grade, and carries the Realm settings", () => {
    const levels = heroLevels(hero, null, settings);
    expect(levels.grades).toEqual({ math: "3", reading: "3", language: "3", science: "3" });
    expect(levels.band).toBe("g23");
    expect(levels.enabled).toBe(true);
    expect(levels.tone).toBe("gentle");
  });

  it("turns a corrupt stored offset into grade level rather than letting it reach the engine", () => {
    const levels = heroLevels(hero, { mathOffset: 1.5, readingOffset: "two" }, settings);
    expect(levels.grades.math).toBe("3");
    expect(levels.grades.reading).toBe("3");
  });
});

describe("gradeForDeed", () => {
  it("asks on the grade of the deed's OWN strand", () => {
    // Reading and math are deliberately different grades, so a run that reached for the
    // wrong strand — or for a fixed one — lands on a visibly wrong grade rather than
    // passing because every strand happened to be the same year.
    const grades = { math: "6" as const, reading: "2" as const, language: "3" as const, science: "4" as const };
    const readingDeed = findDeed("well-signs")!;
    expect(readingDeed.area).toBe("reading");
    expect(gradeForDeed({ grades }, readingDeed)).toBe("2");
    // and the same hero's math quest is still built two bands higher
    const mathDeed = findDeed("well-stones")!;
    expect(mathDeed.area).toBe("math");
    expect(gradeForDeed({ grades }, mathDeed)).toBe("6");
  });
});
