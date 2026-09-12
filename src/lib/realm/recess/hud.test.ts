import { describe, it, expect } from "vitest";
import { hudRecessFor, recessPillText } from "./hud";

describe("hudRecessFor", () => {
  it("hides the HUD's recess tally until recess has ever produced one", () => {
    expect(hudRecessFor({ gleams: 0, laps: 0, bestLapMs: null }, false)).toBeNull();
  });

  it("keeps the tallies on screen after recess ends", () => {
    const recess = { gleams: 3, laps: 1, bestLapMs: 30_000 };
    expect(hudRecessFor(recess, false)).toEqual({ gleams: 3, laps: 1, bestLapMs: 30_000 });
  });

  it("shows a zeroed tally once recess is active even with nothing collected yet", () => {
    expect(hudRecessFor({ gleams: 0, laps: 0, bestLapMs: null }, true)).toEqual({ gleams: 0, laps: 0, bestLapMs: null });
  });
});

describe("recessPillText", () => {
  it("reads as one line, with plurals that match the counts", () => {
    expect(recessPillText(0, 0)).toBe("Recess · 0 gleams · 0 laps");
    expect(recessPillText(1, 1)).toBe("Recess · 1 gleam · 1 lap");
    expect(recessPillText(12, 3)).toBe("Recess · 12 gleams · 3 laps");
  });

  it("never shows a negative or fractional tally", () => {
    expect(recessPillText(-2, 1.7)).toBe("Recess · 0 gleams · 1 lap");
  });
});
