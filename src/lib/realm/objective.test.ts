import { describe, it, expect } from "vitest";
import { objectiveRank, rankBuildings, objectiveState, riseToast, objectiveSpeech, type Objective, type ObjectiveState } from "./objective";
import type { SiteProgress } from "./layout";
import { BUILDINGS } from "@/lib/utils/kingdom";

// Every building is 5 side quests today; slice 13 lowers the real counts and re-baselines this fixture (spec §3.8).
const site = (id: string, done: number): SiteProgress => ({ id, done, total: 5, complete: done >= 5 });

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
    site("well", 5), site("mill", 0), site("bridge", 2), site("chapel", 5),
    site("market", 0), site("library", 4), site("watchtower", 1), site("garden", 3),
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
    // Equal ranks keep input order: library (4 of 5) does not overtake bridge (2 of 5). That tie-break
    // belongs to objectiveState, not here — deed-picker's list order must not change in this task.
    expect(ranked.slice(0, 4).map((b) => b.id)).toEqual(["bridge", "library", "watchtower", "garden"]);
  });
});

/** The ids of the tracked objectives, or the kind — so one assertion covers both the kind and the order. */
const ids = (state: ObjectiveState) => (state.kind === "next" ? state.objectives.map((o) => o.buildingId) : state.kind);

const newHero: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: 0, total: b.deedsToBuild, complete: false }));

describe("objectiveState", () => {
  it("gives a brand-new hero the well, the same way every time", () => {
    const expected = { kind: "next", objectives: [{ buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 0, total: 5 }] };
    expect(objectiveState(newHero, 1)).toEqual(expected);
    expect(objectiveState(newHero, 1)).toEqual(expected);
    expect(objectiveState(newHero, 1)).toEqual(expected);
  });

  it("puts work in progress ahead of untouched sites, highest done first", () => {
    const buildings = [site("well", 0), site("mill", 1), site("bridge", 0), site("chapel", 3), site("market", 0), site("library", 2), site("watchtower", 0), site("garden", 0)];
    expect(ids(objectiveState(buildings, 8))).toEqual(["chapel", "library", "mill", "well", "bridge", "market", "watchtower", "garden"]);
  });

  it("never offers a building that is already raised", () => {
    const buildings = [site("well", 5), site("mill", 5), site("bridge", 0), site("chapel", 4)];
    expect(ids(objectiveState(buildings, 8))).toEqual(["chapel", "bridge"]);
  });

  it("reads an empty kingdom as unknown, never as complete", () => {
    expect(objectiveState([], 1)).toEqual({ kind: "unknown" });
    expect(objectiveState([], 8)).toEqual({ kind: "unknown" });
    // An id with no catalog entry has no site in the world either (layout.ts skips it), so it is not an
    // objective — and a payload of nothing but strangers is a failed load, not a finished kingdom.
    expect(objectiveState([{ id: "moon-base", done: 0, total: 5, complete: false }], 1)).toEqual({ kind: "unknown" });
  });

  it("reports a finished kingdom when every building is raised", () => {
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

const objective = (buildingId: string, label: string, villagerId: string | null, villagerName: string | null): Objective =>
  ({ buildingId, villagerId, label, villagerName, done: 0, total: 5 });

describe("riseToast", () => {
  it("names the building that rose and the one that follows", () => {
    const next: ObjectiveState = { kind: "next", objectives: [objective("mill", "Grain Mill", "tessa", "Miller Tessa")] };
    expect(riseToast("Village Well", next)).toBe("The Village Well stands. Next: the Grain Mill, with Miller Tessa.");
  });

  it("says the kingdom is finished when that was the last one", () => {
    // Interim copy: slice 13 (the record of the work) owns the final line and re-baselines this assertion.
    expect(riseToast("Royal Garden", { kind: "complete" })).toBe("The Royal Garden stands. Every building is raised.");
  });

  it("says only what it knows when the kingdom state is unknown", () => {
    expect(riseToast("Village Well", { kind: "unknown" })).toBe("The Village Well stands.");
    expect(riseToast("Village Well", { kind: "next", objectives: [] })).toBe("The Village Well stands.");
  });

  it("drops the companion clause when the next site has no villager", () => {
    const next: ObjectiveState = { kind: "next", objectives: [objective("mill", "Grain Mill", null, null)] };
    expect(riseToast("Village Well", next)).toBe("The Village Well stands. Next: the Grain Mill.");
  });
});

describe("objectiveSpeech", () => {
  it("reads the next objective aloud", () => {
    expect(objectiveSpeech(objectiveState(newHero, 1))).toBe("Your next side quest is at the Village Well. Old Bram is waiting.");
  });

  it("reads a finished kingdom aloud", () => {
    // Interim copy: slice 13 owns the final line and re-baselines this assertion.
    expect(objectiveSpeech({ kind: "complete" })).toBe("Every building is raised. Nothing is waiting.");
  });

  it("says nothing at all when the kingdom is unknown", () => {
    expect(objectiveSpeech({ kind: "unknown" })).toBeNull();
    expect(objectiveSpeech({ kind: "next", objectives: [] })).toBeNull();
  });

  it("drops the villager clause when the site has no villager", () => {
    expect(objectiveSpeech({ kind: "next", objectives: [objective("mill", "Grain Mill", null, null)] })).toBe("Your next side quest is at the Grain Mill.");
  });

  it("never puts the word deed in a child's ear", () => {
    expect(objectiveSpeech(objectiveState(newHero, 1))).not.toMatch(/deed/i);
  });
});
