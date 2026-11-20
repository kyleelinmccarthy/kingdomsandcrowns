import { describe, it, expect } from "vitest";
import { buildKingdomOverview, gradeForDeed, gradesFor, heroLevels, ownGradeOf, siteTally } from "./deeds";
import { findDeed } from "@/lib/utils/deeds";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { bandForHero, type ContentBand } from "@/lib/utils/content-bands";
import { bandForGrade, NO_OFFSETS } from "@/lib/utils/grade-levels";
import type { AgeMode } from "@/lib/utils/age-mode";

const row = (buildingId: string, deedsDone: number, over: { completedAt?: Date | null; raisedByName?: string | null } = {}) =>
  ({ buildingId, deedsDone, completedAt: over.completedAt ?? null, raisedByName: over.raisedByName ?? null });
const best = (deedId: string, bestStars: 0 | 1 | 2 | 3) => ({ deedId, bestStars, crowned: false });

describe("buildKingdomOverview", () => {
  it("lists every building with progress from the stories done once each, and tone-aware stories", () => {
    // Nine runs at the well, but only two of its three stories ever earned a star.
    const bests = [best("well-stones", 2), best("well-signs", 1), best("well-water", 0), best("bridge-planks", 1), best("bridge-toll", 3)];
    const gentle = buildKingdomOverview([row("well", 9), row("bridge", 2)], "gentle", bests);
    expect(gentle.length).toBe(BUILDINGS.length);
    expect(gentle.find((b) => b.id === "well")).toMatchObject({ done: 2, total: 3, complete: false });
    expect(gentle.find((b) => b.id === "bridge")).toMatchObject({ done: 2, total: 2, complete: true });
    expect(gentle.find((b) => b.id === "mill")).toMatchObject({ done: 0, total: 3, complete: false });
    const planks = gentle.find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    const monsters = buildKingdomOverview([], "monsters").find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    expect(planks.story).not.toBe(monsters.story);
    expect(monsters.story).toMatch(/Shadow blobs/);
  });

  it("carries each side quest's best stars and crown, and sums them per building", () => {
    const best = [
      { deedId: "well-stones", bestStars: 3 as const, crowned: true },
      { deedId: "well-signs", bestStars: 2 as const, crowned: false },
    ];
    const well = buildKingdomOverview([], "gentle", best).find((b) => b.id === "well")!;
    expect(well.deeds.find((d) => d.id === "well-stones")).toMatchObject({ bestStars: 3, crowned: true });
    expect(well.deeds.find((d) => d.id === "well-signs")).toMatchObject({ bestStars: 2, crowned: false });
    // A side quest nobody has run holds no stars and no crown.
    expect(well.deeds.find((d) => d.id === "well-water")).toMatchObject({ bestStars: 0 as const, crowned: false });
    expect(well).toMatchObject({ stars: 5, maxStars: 9 });
  });

  it("holds no stars when there are no runs", () => {
    for (const b of buildKingdomOverview([], "gentle")) expect(b).toMatchObject({ stars: 0, maxStars: 3 * b.deeds.length });
  });

  it("replaying one story is practice: five runs of it never raise the well", () => {
    const well = buildKingdomOverview([row("well", 5)], "gentle", [best("well-stones", 3)]).find((b) => b.id === "well")!;
    expect(well).toMatchObject({ done: 1, total: 3, complete: false });
  });

  it("a raised building stays complete with no story counted, and remembers who raised it and when", () => {
    const at = new Date("2026-04-15T18:00:00Z");
    const overview = buildKingdomOverview([row("well", 0, { completedAt: at, raisedByName: "Ada" }), row("mill", 4, { completedAt: at })], "gentle", [], "Rowan");
    expect(overview.find((b) => b.id === "well")).toMatchObject({ done: 3, total: 3, complete: true, raisedBy: "Ada", raisedAt: at.getTime() / 1000 });
    // Raised before names were kept (or by the migration): the live name stands in (D13.9).
    expect(overview.find((b) => b.id === "mill")).toMatchObject({ complete: true, raisedBy: "Rowan", raisedAt: at.getTime() / 1000 });
    // A building still rising has no one to name yet.
    expect(overview.find((b) => b.id === "bridge")).toMatchObject({ complete: false, raisedBy: null, raisedAt: null });
  });

  it("counts only the building's current stories: a best on a story no longer told adds nothing", () => {
    const well = buildKingdomOverview([row("well", 3)], "gentle", [best("well-stones", 1), best("well-retired", 3)]).find((b) => b.id === "well")!;
    expect(well).toMatchObject({ done: 1, complete: false });
  });
});

describe("siteTally", () => {
  it("counts stories with a star once each, every run, and whether the site was ever raised", () => {
    const bests = [best("well-stones", 1), best("well-signs", 0), best("mill-sacks", 3)];
    expect(siteTally("well", undefined, bests)).toEqual({ distinctDone: 1, runsDone: 0, raised: false });
    expect(siteTally("well", { deedsDone: 6, completedAt: new Date() }, bests)).toEqual({ distinctDone: 1, runsDone: 6, raised: true });
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
      math: "4", reading: "2", language: "3", science: "5", logic: "3",
    });
  });

  it("leaves every strand at the hero's own grade when no grown-up has set a gap", () => {
    expect(gradesFor("6", NO_OFFSETS)).toEqual({ math: "6", reading: "6", language: "6", science: "6", logic: "6" });
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
    expect(levels.grades).toEqual({ math: "5", reading: "2", language: "3", science: "4", logic: "3" });
  });

  it("puts logic at the hero's own grade, whatever offsets are set", () => {
    const offsets = { mathOffset: 4, readingOffset: -3, languageOffset: 2, scienceOffset: -2 };
    expect(heroLevels(hero, offsets, settings).grades.logic).toBe("3");
    expect(heroLevels(hero, null, settings).grades.logic).toBe("3");
    expect(gradesFor("7", { math: 5, reading: -5, language: 5, science: -5 }).logic).toBe("7");
  });

  it("leaves a hero with no profile row at their own grade, and carries the Realm settings", () => {
    const levels = heroLevels(hero, null, settings);
    expect(levels.grades).toEqual({ math: "3", reading: "3", language: "3", science: "3", logic: "3" });
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
    const grades = { math: "6" as const, reading: "2" as const, language: "3" as const, science: "4" as const, logic: "3" as const };
    const readingDeed = findDeed("well-signs")!;
    expect(readingDeed.area).toBe("reading");
    expect(gradeForDeed({ grades }, readingDeed)).toBe("2");
    // and the same hero's math quest is still built two bands higher
    const mathDeed = findDeed("well-stones")!;
    expect(mathDeed.area).toBe("math");
    expect(gradeForDeed({ grades }, mathDeed)).toBe("6");
  });
});
