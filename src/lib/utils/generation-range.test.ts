import { describe, it, expect } from "vitest";
import { clampGenerationRange, MAX_GENERATION_DAYS } from "./generation-range";

describe("clampGenerationRange", () => {
  it("leaves a normal two-week window untouched", () => {
    expect(clampGenerationRange("2026-09-02", "2026-09-16")).toEqual({
      startDate: "2026-09-02",
      endDate: "2026-09-16",
    });
  });

  it("caps an absurd range at the maximum window", () => {
    // A crafted 50-year request would otherwise materialize ~18,000 rows per daily task.
    const { startDate, endDate } = clampGenerationRange("2026-09-02", "2076-09-02");
    expect(startDate).toBe("2026-09-02");
    expect(endDate).toBe("2027-09-03"); // 366 days after the start
  });

  it("caps exactly at the boundary without trimming a legal request", () => {
    const { endDate } = clampGenerationRange("2026-01-01", "2027-01-02");
    expect(endDate).toBe("2027-01-02"); // exactly MAX_GENERATION_DAYS out
  });

  it("collapses an inverted range to a single day rather than generating backwards", () => {
    expect(clampGenerationRange("2026-09-16", "2026-09-02")).toEqual({
      startDate: "2026-09-16",
      endDate: "2026-09-16",
    });
  });

  it("handles a single-day range", () => {
    expect(clampGenerationRange("2026-09-02", "2026-09-02")).toEqual({
      startDate: "2026-09-02",
      endDate: "2026-09-02",
    });
  });

  it("exposes the cap so callers and tests agree on one number", () => {
    expect(MAX_GENERATION_DAYS).toBe(366);
  });
});
