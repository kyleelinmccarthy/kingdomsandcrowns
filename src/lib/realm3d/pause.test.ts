import { describe, expect, it } from "vitest";
import { autoPause, IDLE_MS, IDLE_REFUND_MAX_MINUTES, pauseCopy, type AutoTrigger } from "./pause";

const child = { playing: true, clock: true, focused: true };
const parent = { playing: true, clock: false, focused: true };
const ALL: AutoTrigger[] = ["hidden", "blur", "look", "idle"];

describe("autoPause — what pauses the game without being asked", () => {
  it("pauses a child's clock when the tab is hidden or the window loses focus: they are away", () => {
    expect(autoPause("hidden", child)).toBe("away");
    expect(autoPause("blur", child)).toBe("away");
  });

  it("pauses a child after two minutes without input, as an 'Are you there?'", () => {
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

  it("asks 'Are you there, {name}?' after the idle pause and says what it gave back, with one friendly button back", () => {
    expect(pauseCopy("idle", "child", "Emma", 2)).toEqual({
      title: "Are you there, Emma?",
      reason: "You stepped away, so the Realm paused and gave back 2 minutes.",
      line: HONEST,
      resume: "I'm back!",
    });
    expect(pauseCopy("idle", "child", "Noah", 1).reason).toBe("You stepped away, so the Realm paused and gave back 1 minute.");
  });

  it("says the minutes stopped too when the idle pause had nothing to give back (or the give-back failed)", () => {
    const idle = pauseCopy("idle", "child", "Emma", 0);
    expect(idle.title).toBe("Are you there, Emma?");
    expect(idle.reason).toBe("You stepped away, so the Realm paused — your minutes stopped too.");
    expect(idle.resume).toBe("I'm back!");
  });

  it("holds the reason back while the give-back is still being asked", () => {
    expect(pauseCopy("idle", "child", "Emma").reason).toBeNull();
  });

  it("tells a grown-up the child's Realm waits, and says nothing of minutes", () => {
    const c = pauseCopy("you", "parent", "Emma");
    expect(c).toEqual({ title: "Paused", reason: null, line: "Emma's Realm waits while you look.", resume: "Resume" });
  });
});

describe("IDLE_REFUND_MAX_MINUTES — the most one idle pause gives back", () => {
  it("is the idle wait rounded up to whole minutes, so it moves with IDLE_MS", () => {
    expect(IDLE_REFUND_MAX_MINUTES).toBe(Math.ceil(IDLE_MS / 60_000));
    expect(IDLE_REFUND_MAX_MINUTES).toBe(2);
  });
});
