import { describe, expect, it } from "vitest";
import { IMPROVEMENT_IDS } from "@/lib/realm/improvements";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { VILLAGERS } from "@/lib/realm/villagers";
import { EMPTY_WORKS, type Works } from "@/lib/realm/works-state";
import { NO_GOAL } from "./guide";
import { isPlanGoal, planGoal, planGoalSpeech } from "./plan-goal";

const NONE: ReadonlySet<string> = new Set();
/** Enough for any first level: every cost is 4 and 2 of two materials. */
const RICH: Works = { ...EMPTY_WORKS, balance: { stone: 9, ink: 9, herbs: 9, thread: 9, dye: 9, timber: 0 } };

describe("planGoal", () => {
  it("points at the plans board, named for the plan, when the pinned plan is ready to build", () => {
    const goal = planGoal({ ...RICH, pinned: "village-banners" }, NONE);
    expect(goal).toEqual({ on: true, x: KEEP_YARD.plansBoard.x, z: KEEP_YARD.plansBoard.z, name: "Banners", id: "plan:village-banners" });
    expect(isPlanGoal(goal)).toBe(true);
  });

  it("is off with nothing pinned, however rich the hero", () => {
    expect(planGoal(RICH, NONE)).toEqual(NO_GOAL);
  });

  it("is off while the pinned plan is short of materials", () => {
    expect(planGoal({ ...EMPTY_WORKS, pinned: "village-banners" }, NONE)).toEqual(NO_GOAL);
  });

  it("is off while the pinned plan's building is not raised, and on once it is", () => {
    const works = { ...RICH, pinned: "well-house" };
    expect(planGoal(works, NONE)).toEqual(NO_GOAL);
    expect(planGoal(works, new Set(["well"])).on).toBe(true);
  });

  it("is off once every level of the pinned plan stands", () => {
    expect(planGoal({ ...RICH, pinned: "village-banners", built: { "village-banners": 3 } }, NONE)).toEqual(NO_GOAL);
  });

  it("is off for a pin the catalog does not know", () => {
    expect(planGoal({ ...RICH, pinned: "moat" }, NONE)).toEqual(NO_GOAL);
  });

  it("never has a villager's id, so no villager comparison can mistake it", () => {
    const villagerIds = new Set(VILLAGERS.map((v) => v.id));
    for (const id of IMPROVEMENT_IDS) {
      const goal = planGoal({ ...RICH, pinned: id }, new Set(["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"]));
      expect(goal.on, id).toBe(true);
      expect(villagerIds.has(goal.id), id).toBe(false);
    }
  });

  it("tells a villager's goal from a plan's", () => {
    expect(isPlanGoal({ on: true, id: "bram" })).toBe(false);
    expect(isPlanGoal(NO_GOAL)).toBe(false);
  });

  it("says where to go, out loud", () => {
    expect(planGoalSpeech(planGoal({ ...RICH, pinned: "village-banners" }, NONE))).toBe("Everything for the Banners is here. Go to the plans board to build it.");
  });
});
