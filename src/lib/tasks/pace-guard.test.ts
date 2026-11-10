import { describe, expect, it } from "vitest";
import { NUDGE_LINE, PACE, shouldNudge } from "./pace-guard";

const miss = (at: number) => ({ at, correct: false });
const hit = (at: number) => ({ at, correct: true });

describe("shouldNudge", () => {
  it("says the pace and the line", () => {
    expect(PACE).toEqual({ misses: 3, windowMs: 10_000 });
    expect(NUDGE_LINE).toBe("Slow down, friend. Read it once more. Here's a clue.");
  });

  it("nudges after three misses inside ten seconds", () => {
    expect(shouldNudge([miss(0), miss(3000), miss(6000)])).toBe(true);
  });

  it("does not nudge when the three misses are spread past the window", () => {
    expect(shouldNudge([miss(0), miss(6000), miss(12_000)])).toBe(false);
  });

  it("does not nudge when a right answer is among the last few", () => {
    expect(shouldNudge([miss(0), miss(2000), hit(4000)])).toBe(false);
    expect(shouldNudge([miss(0), hit(1000), miss(2000), miss(3000)])).toBe(false);
  });

  it("does not nudge on fewer than three answers", () => {
    expect(shouldNudge([])).toBe(false);
    expect(shouldNudge([miss(0), miss(1000)])).toBe(false);
  });

  it("looks only at the latest three", () => {
    expect(shouldNudge([hit(0), miss(20_000), miss(21_000), miss(22_000)])).toBe(true);
    expect(shouldNudge([miss(0), miss(1000), miss(2000), hit(3000)])).toBe(false);
  });

  it("counts exactly the window as fast", () => {
    expect(shouldNudge([miss(0), miss(5000), miss(10_000)])).toBe(true);
    expect(shouldNudge([miss(0), miss(5000), miss(10_001)])).toBe(false);
  });
});
