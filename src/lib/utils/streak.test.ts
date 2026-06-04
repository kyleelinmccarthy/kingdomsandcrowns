import { describe, it, expect } from "vitest";
import { computeStreak } from "./streak";
import { formatDate } from "./dates";

// Helper: a date N days before the given anchor.
function daysBefore(anchor: Date, n: number): string {
  const d = new Date(anchor);
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

describe("computeStreak", () => {
  const today = new Date("2026-06-04T12:00:00Z");

  it("returns 0 when there are no active days", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("counts a single day logged today", () => {
    expect(computeStreak([daysBefore(today, 0)], today)).toBe(1);
  });

  it("counts consecutive days up to and including today", () => {
    const dates = [0, 1, 2, 3].map((n) => daysBefore(today, n));
    expect(computeStreak(dates, today)).toBe(4);
  });

  it("does not break the streak when today has no activity yet", () => {
    // Logged yesterday and the day before, but not yet today.
    const dates = [daysBefore(today, 1), daysBefore(today, 2)];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("stops at the first gap before today", () => {
    // today, yesterday present; then a gap at day 2; day 3 present but unreachable.
    const dates = [daysBefore(today, 0), daysBefore(today, 1), daysBefore(today, 3)];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("returns 0 when the most recent activity is older than yesterday", () => {
    // Neither today nor yesterday — streak is broken.
    const dates = [daysBefore(today, 2), daysBefore(today, 3)];
    expect(computeStreak(dates, today)).toBe(0);
  });

  it("ignores duplicate dates", () => {
    const y = daysBefore(today, 0);
    expect(computeStreak([y, y, y], today)).toBe(1);
  });

  it("caps the look-back at 365 days", () => {
    // A full year-plus of consecutive days — should not exceed the 365 cap.
    const dates = Array.from({ length: 400 }, (_, n) => daysBefore(today, n));
    expect(computeStreak(dates, today)).toBe(365);
  });
});
