import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { objectiveState } from "@/lib/realm/objective";
import { villagerById } from "@/lib/realm/villagers";
import { GOAL_NEAR, goalFor, listWords, makeGoalMark, NO_GOAL, placeGoal, spellHelp, type Inset } from "./guide";

const fresh = ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({ id, done: 0, total: 5, complete: false }));
const nameOf = (id: string) => villagerById(id)?.name ?? null;

describe("the goal: who the card sends the child to, standing where the world put them", () => {
  it("is Old Bram at the well for a brand-new child", () => {
    const objective = objectiveState(fresh, 1);
    const layout = buildWorldLayout({ castleType: "campsite", buildings: fresh, villagers: true, banners: 0, decor: true, objectiveIds: ["well"] });
    const bram = layout.villagers.find((v) => v.id === "bram")!;
    expect(goalFor(objective, layout.villagers, nameOf)).toEqual({ on: true, x: bram.position.x, z: bram.position.z, name: "Old Bram", id: "bram" });
  });

  it("moves on to Miller Tessa once the well stands", () => {
    const buildings = fresh.map((b) => (b.id === "well" ? { ...b, done: 5, complete: true } : b));
    const layout = buildWorldLayout({ castleType: "campsite", buildings, villagers: true, banners: 0, decor: true, objectiveIds: ["mill"] });
    expect(goalFor(objectiveState(buildings, 1), layout.villagers, nameOf).name).toBe("Miller Tessa");
  });

  it("is nowhere for a finished village or one that did not load", () => {
    expect(goalFor({ kind: "complete" }, [], nameOf)).toBe(NO_GOAL);
    expect(goalFor({ kind: "unknown" }, [], nameOf)).toBe(NO_GOAL);
    // Villagers missing (the load failed) while the card still has an objective: nowhere to point.
    expect(goalFor(objectiveState(fresh, 1), [], nameOf).on).toBe(false);
  });
});

describe("placing the ! on screen", () => {
  const W = 1280;
  const H = 800;
  const inset: Inset = { top: 90, right: 90, bottom: 200, left: 90 };

  it("sits on the villager when they are in view", () => {
    const m = placeGoal(makeGoalMark(), true, 600, 300, W, H, 0, 15, 0, -10, 0, inset);
    expect(m).toMatchObject({ show: true, x: 600, y: 300, edge: false, angle: 180, dist: 25 });
  });

  it("stands down when the child is close enough for the E prompt", () => {
    expect(placeGoal(makeGoalMark(), true, 600, 300, W, H, 0, 0, 0, GOAL_NEAR - 0.5, 0, inset).show).toBe(false);
  });

  it("points straight up from the top edge when the goal is ahead but off the top of the screen", () => {
    // Camera yaw 0: looking north (-z). Goal due north, 60 units: projected above the safe box.
    const m = placeGoal(makeGoalMark(), true, 640, 20, W, H, 0, 0, 0, -60, 0, inset);
    expect(m.edge).toBe(true);
    expect(m.angle).toBeCloseTo(0);
    expect(m.y).toBeCloseTo(inset.top);
    expect(m.x).toBeCloseTo((inset.left + W - inset.right) / 2);
  });

  it("points down from the bottom edge when the goal is behind the camera, with no projection at all", () => {
    const m = placeGoal(makeGoalMark(), false, 0, 0, W, H, 0, 0, 0, 60, 0, inset);
    expect(m.edge).toBe(true);
    expect(Math.abs(m.angle)).toBeCloseTo(180);
    expect(m.y).toBeCloseTo(H - inset.bottom);
  });

  it("points right when the goal is to the camera's right, and turns with the camera", () => {
    const east = placeGoal(makeGoalMark(), false, 0, 0, W, H, 0, 0, 60, 0, 0, inset);
    expect(east.angle).toBeCloseTo(90);
    expect(east.x).toBeCloseTo(W - inset.right);
    // Swing the camera a quarter turn so it looks east (yaw = -π/2 puts the boom to the west):
    // the same goal is now straight ahead.
    const ahead = placeGoal(makeGoalMark(), false, 0, 0, W, H, 0, 0, 60, 0, -Math.PI / 2, inset);
    expect(ahead.angle).toBeCloseTo(0);
  });
});

describe("how THIS child earns spells", () => {
  const facts = {
    level: 3,
    unlocked: ["ember", "tide", "bolt", "orb", "slow"],
    schoolCounts: { element: 2, form: 0, modifier: 0 },
    subjectNamesBySchool: { element: ["Math"], form: ["Reading"], modifier: [] },
  };

  it("names the elements and shapes they can already put together", () => {
    const h = spellHelp(facts);
    expect(h.elements).toEqual(["Ember", "Tide"]);
    expect(h.shapes).toEqual(["Bolt", "Orb"]);
  });

  it("puts the closest part first, in the Spellbook's own words", () => {
    const h = spellHelp(facts);
    expect(h.next[0]).toEqual({ name: "Stone", how: "3 more Math quests or side quests to go." });
    expect(h.next[1]).toEqual({ name: "Burst", how: "5 more Reading quests or side quests to go." });
  });

  it("says ask a grown-up when no subject feeds a school", () => {
    const h = spellHelp({ ...facts, subjectNamesBySchool: { element: [], form: [], modifier: [] } }, 1);
    expect(h.next[0].how).toMatch(/Ask a grown-up/);
  });
});

describe("listWords", () => {
  it("joins a list the way a child reads one", () => {
    expect(listWords(["Ember"])).toBe("Ember");
    expect(listWords(["Ember", "Tide"])).toBe("Ember and Tide");
    expect(listWords(["Ember", "Tide", "Stone"], "or")).toBe("Ember, Tide or Stone");
  });
});
