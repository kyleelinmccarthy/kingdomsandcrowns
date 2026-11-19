import { describe, it, expect } from "vitest";
import { hasObjectives, objectiveRank, rankBuildings, objectiveState, riseToast, objectiveSpeech, type Objective, type ObjectiveState } from "./objective";
import type { SiteProgress } from "./layout";
import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
import { DEEDS } from "@/lib/utils/deeds";
import type { SkillArea } from "@/lib/utils/skills";

// Each site at its real count: a building needs each of its stories once (D13.1).
const site = (id: string, done: number): SiteProgress => {
  const total = findBuilding(id)!.deedsToBuild;
  return { id, done, total, complete: done >= total };
};

describe("objectiveRank", () => {
  it("ranks work in progress first, untouched second, finished last", () => {
    expect(objectiveRank({ done: 2, complete: false })).toBe(0);
    expect(objectiveRank({ done: 0, complete: false })).toBe(1);
    expect(objectiveRank({ done: 5, complete: true })).toBe(2);
    // Complete rests at the end however its done count reads.
    expect(objectiveRank({ done: 0, complete: true })).toBe(2);
  });
});

describe("rankBuildings", () => {
  // The eight buildings in six progress states.
  const fixture = [
    site("well", 3), site("mill", 0), site("bridge", 1), site("chapel", 3),
    site("market", 0), site("library", 2), site("watchtower", 1), site("garden", 1),
  ];

  it("reproduces the order deed-picker's local rank produced", () => {
    // deed-picker.tsx:20-22, deleted in this task and re-expressed here so the two can never drift apart.
    const legacyRank = (b: { done: number; complete: boolean }) => (b.complete ? 2 : b.done > 0 ? 0 : 1);
    const legacy = [...fixture].sort((a, b) => legacyRank(a) - legacyRank(b)).map((b) => b.id);
    expect(legacy).toEqual(["bridge", "library", "watchtower", "garden", "mill", "market", "well", "chapel"]);
    expect(rankBuildings(fixture).map((b) => b.id)).toEqual(legacy);
  });

  it("is stable within a rank and never mutates its input", () => {
    const before = fixture.map((b) => b.id);
    const ranked = rankBuildings(fixture);
    expect(ranked).not.toBe(fixture);
    expect(fixture.map((b) => b.id)).toEqual(before);
    // Equal ranks keep input order: library (2 of 3) does not overtake bridge (1 of 2). That tie-break
    // belongs to objectiveState, not here — deed-picker's list order must not change in this task.
    expect(ranked.slice(0, 4).map((b) => b.id)).toEqual(["bridge", "library", "watchtower", "garden"]);
  });
});

/** The ids of the tracked objectives, or the kind — so one assertion covers both the kind and the order. */
const ids = (state: ObjectiveState) => (state.kind === "next" ? state.objectives.map((o) => o.buildingId) : state.kind);

const newHero: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: 0, total: b.deedsToBuild, complete: false }));

describe("objectiveState", () => {
  it("gives a brand-new hero the well, the same way every time", () => {
    const expected = { kind: "next", objectives: [{ buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 0, total: 3 }] };
    expect(objectiveState(newHero, 1)).toEqual(expected);
    expect(objectiveState(newHero, 1)).toEqual(expected);
    expect(objectiveState(newHero, 1)).toEqual(expected);
  });

  it("puts work in progress ahead of untouched sites, highest done first", () => {
    // Chapel and library tie at 2 done: the catalog order breaks it.
    const buildings = [site("well", 0), site("mill", 1), site("bridge", 0), site("chapel", 2), site("market", 0), site("library", 2), site("watchtower", 0), site("garden", 0)];
    expect(ids(objectiveState(buildings, 8))).toEqual(["chapel", "library", "mill", "well", "bridge", "market", "watchtower", "garden"]);
  });

  it("never offers a building that is already raised", () => {
    const buildings = [site("well", 3), site("mill", 3), site("bridge", 0), site("chapel", 2)];
    expect(ids(objectiveState(buildings, 8))).toEqual(["chapel", "bridge"]);
  });

  it("reads an empty kingdom as unknown, never as complete", () => {
    expect(objectiveState([], 1)).toEqual({ kind: "unknown" });
    expect(objectiveState([], 8)).toEqual({ kind: "unknown" });
    // An id with no catalog entry has no site in the world either (layout.ts skips it), so it is not an
    // objective — and a payload of nothing but strangers is a failed load, not a finished kingdom.
    expect(objectiveState([{ id: "moon-base", done: 0, total: 5, complete: false }], 1)).toEqual({ kind: "unknown" });
  });

  it("reports a finished kingdom when every building is built", () => {
    const all: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
    expect(objectiveState(all, 3)).toEqual({ kind: "complete" });
  });

  it("clamps limit to 1..8 and caps the list", () => {
    expect(ids(objectiveState(newHero, 3))).toEqual(["well", "mill", "bridge"]);
    expect(ids(objectiveState(newHero, 0))).toEqual(["well"]);
    expect(ids(objectiveState(newHero, -4))).toEqual(["well"]);
    expect(ids(objectiveState(newHero, 1.9))).toEqual(["well"]);
    expect(ids(objectiveState(newHero, 99)).length).toBe(8);
  });
});

/** A built village whose stars are all earned except where `left` says: `{ mill: 7 }` is the Mill at 7 of 9. */
const builtWithStars = (left: Record<string, number> = {}): SiteProgress[] =>
  BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true, stars: left[b.id] ?? 9, maxStars: 9 }));

describe("objectiveState once every building stands", () => {
  it("points at the building with stars still to earn", () => {
    expect(objectiveState(builtWithStars({ mill: 7 }), 3)).toEqual({
      kind: "stars",
      objectives: [{ buildingId: "mill", villagerId: "tessa", label: "Grain Mill", villagerName: "Miller Tessa", done: 7, total: 9 }],
    });
  });

  it("puts the building with the most stars still to earn first, then the catalog order", () => {
    const state = objectiveState(builtWithStars({ garden: 8, chapel: 2, well: 8 }), 3);
    expect(hasObjectives(state) ? state.objectives.map((o) => o.buildingId) : state.kind).toEqual(["chapel", "well", "garden"]);
  });

  it("is complete only when every star is earned", () => {
    expect(objectiveState(builtWithStars(), 3)).toEqual({ kind: "complete" });
  });

  it("stays complete for callers that send no stars", () => {
    const all: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
    expect(objectiveState(all, 3)).toEqual({ kind: "complete" });
  });

  it("never sends a child to stars while a building still waits to be raised", () => {
    const buildings = builtWithStars({ mill: 0 }).map((b) => (b.id === "garden" ? { ...b, done: 1, complete: false } : b));
    expect(ids(objectiveState(buildings, 3))).toEqual(["garden"]);
  });
});

describe("hasObjectives", () => {
  it("is true for the kinds that carry objectives", () => {
    expect(hasObjectives({ kind: "next", objectives: [] })).toBe(true);
    expect(hasObjectives({ kind: "stars", objectives: [] })).toBe(true);
    expect(hasObjectives({ kind: "complete" })).toBe(false);
    expect(hasObjectives({ kind: "unknown" })).toBe(false);
  });
});

const objective = (buildingId: string, label: string, villagerId: string | null, villagerName: string | null): Objective =>
  ({ buildingId, villagerId, label, villagerName, done: 0, total: 3 });

describe("riseToast", () => {
  it("names the building that rose and the one that follows", () => {
    const next: ObjectiveState = { kind: "next", objectives: [objective("mill", "Grain Mill", "tessa", "Miller Tessa")] };
    expect(riseToast("Village Well", next)).toBe("The Village Well stands. Next: the Grain Mill, with Miller Tessa.");
  });

  it("says the kingdom is finished when that was the last one", () => {
    // Interim copy: slice 13 (the record of the work) owns the final line and re-baselines this assertion.
    expect(riseToast("Royal Garden", { kind: "complete" })).toBe("The Royal Garden stands. Every building is built.");
  });

  it("says only what it knows when the kingdom state is unknown", () => {
    expect(riseToast("Village Well", { kind: "unknown" })).toBe("The Village Well stands.");
    expect(riseToast("Village Well", { kind: "next", objectives: [] })).toBe("The Village Well stands.");
  });

  it("drops the companion clause when the next site has no villager", () => {
    const next: ObjectiveState = { kind: "next", objectives: [objective("mill", "Grain Mill", null, null)] };
    expect(riseToast("Village Well", next)).toBe("The Village Well stands. Next: the Grain Mill.");
  });

  it("says the village is built and where stars are still to earn when the last one rises", () => {
    const next: ObjectiveState = { kind: "stars", objectives: [objective("well", "Well", "bram", "Old Bram")] };
    expect(riseToast("Mill", next)).toBe("The Mill stands. Every building is built — there are stars to earn at the Well.");
  });
});

describe("objectiveSpeech", () => {
  it("reads the next objective aloud", () => {
    expect(objectiveSpeech(objectiveState(newHero, 1))).toBe("Your next side quest is at the Village Well. Old Bram is waiting.");
  });

  it("reads a finished kingdom aloud", () => {
    // Interim copy: slice 13 owns the final line and re-baselines this assertion.
    expect(objectiveSpeech({ kind: "complete" })).toBe("Every building is built. Nothing is waiting.");
  });

  it("says nothing at all when the kingdom is unknown", () => {
    expect(objectiveSpeech({ kind: "unknown" })).toBeNull();
    expect(objectiveSpeech({ kind: "next", objectives: [] })).toBeNull();
  });

  it("reads where stars are still to earn once every building stands", () => {
    const state: ObjectiveState = { kind: "stars", objectives: [objective("mill", "Mill", "tessa", "Miller Tessa")] };
    expect(objectiveSpeech(state)).toBe("Every building stands. There are stars to earn at the Mill. Miller Tessa is waiting.");
    expect(objectiveSpeech({ kind: "stars", objectives: [objective("mill", "Mill", null, null)] })).toBe("Every building stands. There are stars to earn at the Mill.");
    expect(objectiveSpeech({ kind: "stars", objectives: [] })).toBeNull();
  });

  it("drops the villager clause when the site has no villager", () => {
    expect(objectiveSpeech({ kind: "next", objectives: [objective("mill", "Grain Mill", null, null)] })).toBe("Your next side quest is at the Grain Mill.");
  });

  it("never puts the word deed in a child's ear", () => {
    expect(objectiveSpeech(objectiveState(newHero, 1))).not.toMatch(/deed/i);
  });
});

describe("focus areas break ties toward a building with a deed in them", () => {
  // Which buildings carry a deed in an area depends on the catalog; find two that differ.
  const hasArea = (id: string, area: SkillArea) => DEEDS.some((d) => d.buildingId === id && d.area === area);
  const pair = (() => {
    for (const area of ["science", "language", "reading", "math"] as SkillArea[]) {
      const withIt = BUILDINGS.filter((b) => hasArea(b.id, area));
      const without = BUILDINGS.filter((b) => !hasArea(b.id, area));
      // The one that WITHOUT the area comes first in BUILDINGS order, so a tie-break is visible.
      for (const w of without) for (const f of withIt) if (BUILDINGS.indexOf(w) < BUILDINGS.indexOf(f)) return { area, plain: w.id, focus: f.id };
    }
    throw new Error("catalog has no usable pair");
  })();
  const focus = new Set<SkillArea>([pair.area]);

  it("rankBuildings: within a rank the focus building leads; otherwise unchanged", () => {
    const list = [site(pair.plain, 0), site(pair.focus, 0)];
    expect(rankBuildings(list).map((b) => b.id)).toEqual([pair.plain, pair.focus]);
    expect(rankBuildings(list, new Set()).map((b) => b.id)).toEqual([pair.plain, pair.focus]);
    expect(rankBuildings(list, focus).map((b) => b.id)).toEqual([pair.focus, pair.plain]);
  });

  it("rankBuildings: never overrides the rank order", () => {
    const list = [site(pair.plain, 1), site(pair.focus, 0)]; // work in progress outranks untouched
    expect(rankBuildings(list, focus).map((b) => b.id)).toEqual([pair.plain, pair.focus]);
  });

  it("objectiveState: a full tie goes to the focus building", () => {
    const tied = [site(pair.plain, 0), site(pair.focus, 0)];
    const ids = (s: ObjectiveState) => (hasObjectives(s) ? s.objectives.map((o) => o.buildingId) : []);
    expect(ids(objectiveState(tied, 2))).toEqual([pair.plain, pair.focus]);
    expect(ids(objectiveState(tied, 2, focus))).toEqual([pair.focus, pair.plain]);
  });

  it("objectiveState: more work done still wins over focus", () => {
    // Both still rising, whatever their real counts: only how much is done decides here.
    const rising = (id: string, done: number): SiteProgress => ({ id, done, total: done + 1, complete: false });
    const list = [rising(pair.plain, 3), rising(pair.focus, 1)];
    const first = objectiveState(list, 1, focus);
    expect(hasObjectives(first) && first.objectives[0].buildingId).toBe(pair.plain);
  });
});
