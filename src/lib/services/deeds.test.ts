import { describe, it, expect } from "vitest";
import { buildKingdomOverview, ownGradeOf } from "./deeds";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { bandForHero, type ContentBand } from "@/lib/utils/content-bands";
import { bandForGrade } from "@/lib/utils/grade-levels";
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

  it("falls back to the birth year when there is no grade", () => {
    expect(ownGradeOf(null, 2017, "elementary", today)).toBe("4"); // 2026 - 2017 - 5
    expect(ownGradeOf(null, 2021, "elementary", today)).toBe("K");
    expect(ownGradeOf(null, 2008, "high", today)).toBe("12"); // clamped at the top
  });

  it("does not trust a stored grade that is not on the ladder", () => {
    // `child.grade` is a plain nullable text column, so anything can be in it.
    expect(ownGradeOf("13", 2017, "elementary", today)).toBe("4");
    expect(ownGradeOf("", 2017, "elementary", today)).toBe("4");
    expect(ownGradeOf("kindergarten", null, "middle", today)).toBe("6");
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
