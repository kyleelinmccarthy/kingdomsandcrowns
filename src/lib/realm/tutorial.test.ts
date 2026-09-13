import { describe, it, expect, vi } from "vitest";
import { advanceTutorial, deferSignal, keysFromWorldAxis, objectiveArrival, shouldEmitWalked, tutorialPrompt, TUTORIAL_STEPS, WALK_DISTANCE } from "./tutorial";
import { screenToWorldAxis } from "./input-mapping";

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

// The three rules the frame loop runs on. They live here rather than in realm-scene.tsx
// because that file imports three, which means it has no test of its own and the shell's
// suite mocks it whole — so a rule that decides whether a child can finish the tutorial would
// have been entirely unguarded there.

describe("keysFromWorldAxis", () => {
  // The real screen vectors `use-realm-input.ts` builds, put through the real
  // `screenToWorldAxis`, so this is the actual round trip and not a hand-written axis.
  const held = (screen: { x: number; y: number }) => keysFromWorldAxis(screenToWorldAxis(screen)).sort();

  it("recovers each single key from the axis it produces", () => {
    expect(held({ x: 0, y: 1 })).toEqual(["KeyW"]);
    expect(held({ x: 0, y: -1 })).toEqual(["KeyS"]);
    expect(held({ x: -1, y: 0 })).toEqual(["KeyA"]);
    expect(held({ x: 1, y: 0 })).toEqual(["KeyD"]);
  });

  it("does not mistake forward for back", () => {
    // A sign slip here is invisible on screen — the hero still walks — and silently turns
    // "press two different keys" into a rule about which two.
    expect(held({ x: 0, y: 1 })).not.toContain("KeyS");
    expect(held({ x: 0, y: -1 })).not.toContain("KeyW");
    expect(held({ x: -1, y: 0 })).not.toContain("KeyD");
    expect(held({ x: 1, y: 0 })).not.toContain("KeyA");
  });

  it("recovers both keys of a diagonal, which is what makes step one finishable at all", () => {
    expect(held({ x: 1, y: 1 })).toEqual(["KeyD", "KeyW"]);
    expect(held({ x: -1, y: 1 })).toEqual(["KeyA", "KeyW"]);
    expect(held({ x: 1, y: -1 })).toEqual(["KeyD", "KeyS"]);
    expect(held({ x: -1, y: -1 })).toEqual(["KeyA", "KeyS"]);
  });

  it("reads a half-pushed stick the same way a keyboard is read", () => {
    // On touch there are no key codes at all; the stick goes through the same mapping, so a
    // thumb pushed up and to the right has to count as two directions or a tablet child can
    // never finish step one.
    expect(held({ x: 0.6, y: 0.55 })).toEqual(["KeyD", "KeyW"]);
  });

  it("says nothing at all for a hero who is not steering", () => {
    // Click-to-walk covers ground with a zero axis. Clicking the grass is not pressing W.
    expect(keysFromWorldAxis({ x: 0, z: 0 })).toEqual([]);
    expect(keysFromWorldAxis({ x: 0.01, z: -0.01 })).toEqual([]); // float noise, not a direction
  });
});

describe("shouldEmitWalked", () => {
  it("stays quiet until the distance is really covered", () => {
    expect(shouldEmitWalked(WALK_DISTANCE - 0.01, 2, 0)).toBe(false);
    expect(shouldEmitWalked(WALK_DISTANCE, 2, 0)).toBe(true);
  });

  it("speaks once when the line is crossed, then holds its tongue", () => {
    expect(shouldEmitWalked(WALK_DISTANCE, 1, 0)).toBe(true);
    // Every frame after that, with the same one key, must send nothing: this is the only
    // thing between a memoised scene and sixty signals a second.
    expect(shouldEmitWalked(WALK_DISTANCE + 50, 1, 1)).toBe(false);
    expect(shouldEmitWalked(WALK_DISTANCE + 900, 1, 1)).toBe(false);
  });

  it("speaks again the moment a NEW key joins, which is what unsticks a W-only child", () => {
    // The trap this exists to avoid: a child crosses four units pressing only W, so the
    // signal goes out with one key and `advanceTutorial` correctly refuses it. If that were
    // the only signal they ever got, pressing A afterwards could never finish step one and
    // the tutorial would be unfinishable for the rest of the visit.
    expect(shouldEmitWalked(WALK_DISTANCE + 10, 2, 1)).toBe(true);
    expect(shouldEmitWalked(WALK_DISTANCE + 20, 3, 2)).toBe(true);
    expect(shouldEmitWalked(WALK_DISTANCE + 30, 4, 3)).toBe(true);
    // ...and is bounded: four keys is all there are, so a whole visit sends at most four.
    expect(shouldEmitWalked(WALK_DISTANCE + 40, 4, 4)).toBe(false);
  });

  it("never speaks for a hero who pressed nothing", () => {
    expect(shouldEmitWalked(999, 0, 0)).toBe(false);
  });
});

describe("objectiveArrival", () => {
  it("speaks on the way in and then goes quiet", () => {
    const first = objectiveArrival(true, false, false);
    expect(first).toEqual({ latched: true, emit: true });
    expect(objectiveArrival(true, first.latched, false)).toEqual({ latched: true, emit: false });
  });

  it("re-arms on the way out, so coming back speaks again", () => {
    expect(objectiveArrival(false, true, false)).toEqual({ latched: false, emit: false });
    expect(objectiveArrival(true, false, false).emit).toBe(true);
  });

  it("re-arms when a walk signal goes out under the hero's feet", () => {
    // From the spawn, holding W alone reaches the first site: a child can stand in the beacon
    // while still on step one, spending an arrival the model was bound to ignore. When the
    // walk signal that finishes step one finally goes out, the arrival has to come back —
    // without this they would have to leave the light and walk back to it.
    expect(objectiveArrival(true, true, true)).toEqual({ latched: true, emit: true });
  });

  it("stays silent out in the world whatever else is happening", () => {
    expect(objectiveArrival(false, false, true)).toEqual({ latched: false, emit: false });
  });
});

describe("deferSignal", () => {
  const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

  it("does not call through synchronously", async () => {
    // The whole point: the caller is `useFrame`, sixty times a second, and a synchronous call
    // here is a setState in the middle of a frame — the failure the scene's ref-based wiring
    // exists to prevent, and one nothing on screen would show you.
    const emit = vi.fn();
    deferSignal(emit)({ kind: "reachedObjective" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("calls through once the microtask queue drains, with the signal untouched", async () => {
    const emit = vi.fn();
    const signal = { kind: "walked" as const, keys: ["KeyW", "KeyD"], distance: 9 };
    deferSignal(emit)(signal);
    await flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(signal);
  });

  it("keeps several signals from one frame in order", async () => {
    // A `walked` and a `reachedObjective` can be sent by the same frame; the shell judges the
    // second against the first's result, so the order they arrive in is part of the contract.
    const seen: string[] = [];
    const defer = deferSignal((s) => seen.push(s.kind));
    defer({ kind: "walked", keys: ["KeyW", "KeyA"], distance: 9 });
    defer({ kind: "reachedObjective" });
    expect(seen).toEqual([]);
    await flush();
    expect(seen).toEqual(["walked", "reachedObjective"]);
  });
});
