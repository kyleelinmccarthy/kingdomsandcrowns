import { describe, it, expect } from "vitest";
import { advanceTutorial, tutorialPrompt, TUTORIAL_STEPS, WALK_DISTANCE } from "./tutorial";

const start = { completed: 0 };

describe("tutorialPrompt", () => {
  it("names all four movement keys at step one, not W alone", () => {
    const prompt = tutorialPrompt(start)!;
    for (const key of ["W", "A", "S", "D"]) expect(prompt).toContain(key);
  });

  it("says nothing once all four steps are done", () => {
    expect(tutorialPrompt({ completed: 4 })).toBeNull();
  });

  it("never says a word about depth", () => {
    for (let c = 0; c <= 4; c++) {
      expect(tutorialPrompt({ completed: c }) ?? "").not.toMatch(/depth|simple mode|advanced/i);
    }
  });
});

describe("advanceTutorial", () => {
  it("does not finish step one for a child who only ever presses W", () => {
    const after = advanceTutorial(start, { kind: "walked", keys: ["KeyW"], distance: 999 });
    expect(after.completed).toBe(0);
  });

  it("does not finish step one for two keys and no distance", () => {
    const after = advanceTutorial(start, { kind: "walked", keys: ["KeyW", "KeyD"], distance: 0 });
    expect(after.completed).toBe(0);
  });

  it("finishes step one on two keys and the distance together", () => {
    const after = advanceTutorial(start, { kind: "walked", keys: ["KeyW", "KeyD"], distance: WALK_DISTANCE });
    expect(after.completed).toBe(1);
  });

  it("ignores a signal for a step that is not the current one", () => {
    // Reaching the objective before learning to walk must not skip step one.
    expect(advanceTutorial(start, { kind: "reachedObjective" })).toEqual(start);
    // And a walk signal after step one is done changes nothing.
    const one = { completed: 1 };
    expect(advanceTutorial(one, { kind: "walked", keys: ["KeyW", "KeyA"], distance: 99 })).toEqual(one);
  });

  it("walks the whole ladder in order and then stops", () => {
    let s = start;
    s = advanceTutorial(s, { kind: "walked", keys: ["KeyW", "KeyS"], distance: WALK_DISTANCE });
    s = advanceTutorial(s, { kind: "reachedObjective" });
    s = advanceTutorial(s, { kind: "interacted" });
    s = advanceTutorial(s, { kind: "castLanded" });
    expect(s.completed).toBe(4);
    expect(advanceTutorial(s, { kind: "castLanded" })).toEqual({ completed: 4 });
  });

  it("never returns a completed count outside 0..4", () => {
    expect(advanceTutorial({ completed: -5 }, { kind: "interacted" }).completed).toBeGreaterThanOrEqual(0);
    expect(advanceTutorial({ completed: 99 }, { kind: "castLanded" }).completed).toBeLessThanOrEqual(4);
  });

  it("has exactly four steps, in the frozen order", () => {
    expect(TUTORIAL_STEPS.map((s) => s.signal)).toEqual(["walked", "reachedObjective", "interacted", "castLanded"]);
  });
});
