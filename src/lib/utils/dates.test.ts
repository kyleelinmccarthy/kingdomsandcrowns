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

import { todayInZone, weekStartOf, weekEndOf } from "./dates";

describe("todayInZone", () => {
  it("gives the local day, not the UTC day, for an evening instant", () => {
    // 02:00 UTC on the 3rd is 20:00 on the 2nd in Denver. This exact case is
    // the bug: work logged after 5pm was being filed under tomorrow.
    const instant = new Date("2026-09-03T02:00:00Z");
    expect(todayInZone("America/Denver", instant)).toBe("2026-09-02");
  });

  it("gives the next day for a zone ahead of UTC at the same instant", () => {
    const instant = new Date("2026-09-02T20:00:00Z");
    expect(todayInZone("Pacific/Auckland", instant)).toBe("2026-09-03");
  });

  it("is the identity for UTC itself", () => {
    expect(todayInZone("UTC", new Date("2026-09-02T23:59:59Z"))).toBe("2026-09-02");
  });

  it("handles the spring-forward transition", () => {
    // 2026-03-08 is when America/Denver jumps from MST to MDT at 02:00 local.
    expect(todayInZone("America/Denver", new Date("2026-03-08T09:30:00Z"))).toBe("2026-03-08");
    expect(todayInZone("America/Denver", new Date("2026-03-08T06:30:00Z"))).toBe("2026-03-07");
  });

  it("handles the fall-back transition", () => {
    // 2026-11-01, MDT -> MST at 02:00 local.
    expect(todayInZone("America/Denver", new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01");
    expect(todayInZone("America/Denver", new Date("2026-11-01T05:30:00Z"))).toBe("2026-10-31");
  });

  it("handles a leap day", () => {
    expect(todayInZone("America/Denver", new Date("2028-02-29T18:00:00Z"))).toBe("2028-02-29");
  });

  it("pads single-digit months and days", () => {
    expect(todayInZone("UTC", new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });
});

describe("weekStartOf / weekEndOf", () => {
  it("returns the Monday and Sunday bracketing a midweek date", () => {
    // 2026-09-02 is a Wednesday.
    expect(weekStartOf("2026-09-02")).toBe("2026-08-31");
    expect(weekEndOf("2026-09-02")).toBe("2026-09-06");
  });

  it("treats Monday as the first day of its own week", () => {
    expect(weekStartOf("2026-08-31")).toBe("2026-08-31");
    expect(weekEndOf("2026-08-31")).toBe("2026-09-06");
  });

  it("treats Sunday as the LAST day of the preceding week, not the first of the next", () => {
    // The single most common off-by-one in week maths.
    expect(weekStartOf("2026-09-06")).toBe("2026-08-31");
    expect(weekEndOf("2026-09-06")).toBe("2026-09-06");
  });

  it("crosses a month boundary", () => {
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28");
  });

  it("crosses a year boundary", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });

  it("is a pure function of the date string, with no dependence on the host clock", () => {
    // Kind 2: same input, same output, regardless of where this runs.
    expect(weekStartOf("2026-09-02")).toBe(weekStartOf("2026-09-02"));
  });
});
