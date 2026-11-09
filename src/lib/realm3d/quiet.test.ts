import { describe, expect, it } from "vitest";
import { QUIET_LINE, quietSurfaces, restingLine, wakeToast } from "./quiet";

describe("quietSurfaces: what the quiet world switches off", () => {
  it("in the quiet world, troubles, riding and recess are off", () => {
    expect(quietSurfaces(true)).toEqual({ troubles: false, riding: false, recess: false });
  });

  it("awake, everything is on", () => {
    expect(quietSurfaces(false)).toEqual({ troubles: true, riding: true, recess: true });
  });
});

describe("the quiet world's words", () => {
  it("the HUD line, exactly", () => {
    expect(QUIET_LINE).toBe("Earn play time with a side quest");
  });

  it("the wake toast counts minutes, and says minute for one", () => {
    expect(wakeToast(3)).toBe("+3 minutes — the Realm wakes up!");
    expect(wakeToast(1)).toBe("+1 minute — the Realm wakes up!");
  });

  it("what rests while quiet invites to a side quest, never refuses", () => {
    expect(restingLine("The Ring")).toBe("The Ring is resting. Earn play time with a side quest.");
    expect(restingLine("Your Pony")).toBe("Your Pony is resting. Earn play time with a side quest.");
  });
});
