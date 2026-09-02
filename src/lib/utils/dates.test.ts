import { describe, it, expect } from "vitest";
import { getWeekStartDate, getWeekEndDate, formatDate, addDays } from "./dates";

describe("formatDate", () => {
  it("formats date as ISO date string", () => {
    const date = new Date("2026-03-16T12:00:00Z");
    expect(formatDate(date)).toBe("2026-03-16");
  });
});

describe("getWeekStartDate", () => {
  it("returns Monday for a Wednesday", () => {
    // March 18, 2026 is a Wednesday
    const date = new Date("2026-03-18T12:00:00Z");
    expect(getWeekStartDate(date)).toBe("2026-03-16");
  });

  it("returns Monday for a Monday", () => {
    const date = new Date("2026-03-16T12:00:00Z");
    expect(getWeekStartDate(date)).toBe("2026-03-16");
  });

  it("returns previous Monday for a Sunday", () => {
    // March 22, 2026 is a Sunday
    const date = new Date("2026-03-22T12:00:00Z");
    expect(getWeekStartDate(date)).toBe("2026-03-16");
  });
});

describe("getWeekEndDate", () => {
  it("returns Sunday for a Wednesday", () => {
    const date = new Date("2026-03-18T12:00:00Z");
    expect(getWeekEndDate(date)).toBe("2026-03-22");
  });

  it("returns Sunday for a Sunday", () => {
    const date = new Date("2026-03-22T12:00:00Z");
    expect(getWeekEndDate(date)).toBe("2026-03-22");
  });
});

describe("addDays", () => {
  it("shifts forward by a positive number of days", () => {
    expect(addDays("2026-03-16", 5)).toBe("2026-03-21");
  });

  it("shifts backward by a negative number of days", () => {
    expect(addDays("2026-03-16", -5)).toBe("2026-03-11");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-03-30", 3)).toBe("2026-04-02");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("returns the same date for a zero shift", () => {
    expect(addDays("2026-03-16", 0)).toBe("2026-03-16");
  });
});
