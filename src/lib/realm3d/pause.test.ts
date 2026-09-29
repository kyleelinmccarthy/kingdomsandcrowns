import { describe, expect, it } from "vitest";
import { autoPause, pauseCopy, type AutoTrigger } from "./pause";

const child = { playing: true, clock: true, focused: true };
const parent = { playing: true, clock: false, focused: true };
const ALL: AutoTrigger[] = ["hidden", "blur", "look", "idle"];

describe("autoPause — what pauses the game without being asked", () => {
  it("pauses a child's clock when the tab is hidden or the window loses focus: they are away", () => {
    expect(autoPause("hidden", child)).toBe("away");
    expect(autoPause("blur", child)).toBe("away");
  });

  it("pauses a child after two minutes without input, as a 'Still there?'", () => {
    expect(autoPause("idle", child)).toBe("idle");
  });

  it("takes the captured mouse let go, with the window still focused, as Esc: a pause anyone asked for", () => {
    expect(autoPause("look", child)).toBe("you");
    expect(autoPause("look", parent)).toBe("you");
  });

  it("takes the mouse let go because the window lost focus as the child being away", () => {
    expect(autoPause("look", { ...child, focused: false })).toBe("away");
  });

  it("never pauses a visiting grown-up by itself: they have no minutes to protect, and their view stays", () => {
    expect(autoPause("hidden", parent)).toBeNull();
    expect(autoPause("blur", parent)).toBeNull();
    expect(autoPause("idle", parent)).toBeNull();
    expect(autoPause("look", { ...parent, focused: false })).toBeNull();
  });

  it("never opens over a panel that is already open", () => {
    for (const t of ALL) expect(autoPause(t, { ...child, playing: false }), t).toBeNull();
    for (const t of ALL) expect(autoPause(t, { ...parent, playing: false }), t).toBeNull();
  });
});

describe("pauseCopy — what the pause screen says", () => {
  const HONEST = "The world waits for you. Your minutes are not ticking.";

  it("gives a pause the child asked for the honest line and no reason", () => {
    expect(pauseCopy("you", "child", "Emma")).toEqual({ title: "Paused", reason: null, line: HONEST, resume: "Resume" });
  });

  it("says the child was away, and that their minutes stopped too, over the same honest line", () => {
    expect(pauseCopy("away", "child", "Emma")).toEqual({
      title: "Paused",
      reason: "Paused while you were away — your minutes stopped too.",
      line: HONEST,
      resume: "Resume",
    });
  });

  it("asks 'Still there?' after the idle pause, with one friendly button back", () => {
    const idle = pauseCopy("idle", "child", "Emma");
    expect(idle.title).toBe("Still there?");
    expect(idle.reason).toMatch(/two minutes/);
    expect(idle.reason).toMatch(/your minutes stopped too/);
    expect(idle.line).toBe(HONEST);
    expect(idle.resume).toBe("I'm here!");
  });

  it("tells a grown-up the child's Realm waits, and says nothing of minutes", () => {
    const c = pauseCopy("you", "parent", "Emma");
    expect(c).toEqual({ title: "Paused", reason: null, line: "Emma's Realm waits while you look.", resume: "Resume" });
  });
});
