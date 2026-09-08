import { describe, it, expect } from "vitest";
import { hudRecessFor } from "./hud";

describe("hudRecessFor", () => {
  it("hides the HUD's recess tally until recess has ever produced one", () => {
    expect(hudRecessFor({ gleams: 0, laps: 0, bestLapMs: null, lapMs: null }, false)).toBeNull();
  });

  it("shows the running lap while recess is active", () => {
    const recess = { gleams: 2, laps: 0, bestLapMs: null, lapMs: 12_000 };
    expect(hudRecessFor(recess, true)).toEqual({ gleams: 2, laps: 0, bestLapMs: null, lapMs: 12_000 });
  });

  it("clears the running lap once recess ends, but keeps the tallies", () => {
    const recess = { gleams: 3, laps: 1, bestLapMs: 30_000, lapMs: 12_000 };
    expect(hudRecessFor(recess, false)).toEqual({ gleams: 3, laps: 1, bestLapMs: 30_000, lapMs: null });
  });

  it("shows a zeroed tally once recess is active even with nothing collected yet", () => {
    expect(hudRecessFor({ gleams: 0, laps: 0, bestLapMs: null, lapMs: null }, true)).toEqual({ gleams: 0, laps: 0, bestLapMs: null, lapMs: null });
  });
});
