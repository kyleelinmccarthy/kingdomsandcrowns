import { describe, it, expect } from "vitest";
import {
  daysInRange,
  findCoveringBreak,
  findOverlappingBreaks,
  formatBreakDate,
  formatBreakRange,
  groupBreaksBySchoolYear,
  isIsoDate,
  schoolYearLabel,
  schoolYearOf,
} from "./school-calendar";

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-09-07")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true); // leap year
  });

  it("rejects malformed strings", () => {
    for (const bad of ["", "2026-9-7", "07/09/2026", "2026-09-07T00:00:00", "tomorrow"]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });

  it("rejects dates that don't exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false); // not a leap year
  });
});

describe("daysInRange", () => {
  it("counts a single-day holiday as one day", () => {
    expect(daysInRange("2026-09-07", "2026-09-07")).toBe(1);
  });

  it("counts both ends of a span", () => {
    expect(daysInRange("2026-11-23", "2026-11-27")).toBe(5);
  });

  it("counts across a month boundary", () => {
    expect(daysInRange("2026-12-21", "2027-01-01")).toBe(12);
  });
});

describe("findCoveringBreak", () => {
  const breaks = [
    { id: "a", name: "Labor Day", startDate: "2026-09-07", endDate: "2026-09-07" },
    { id: "b", name: "Thanksgiving", startDate: "2026-11-23", endDate: "2026-11-27" },
  ];

  it("finds a break covering the date, inclusive of both ends", () => {
    expect(findCoveringBreak("2026-09-07", breaks)?.id).toBe("a");
    expect(findCoveringBreak("2026-11-23", breaks)?.id).toBe("b");
    expect(findCoveringBreak("2026-11-27", breaks)?.id).toBe("b");
    expect(findCoveringBreak("2026-11-25", breaks)?.id).toBe("b");
  });

  it("returns null on an ordinary day", () => {
    expect(findCoveringBreak("2026-09-08", breaks)).toBeNull();
    expect(findCoveringBreak("2026-11-28", breaks)).toBeNull();
  });
});

describe("findOverlappingBreaks", () => {
  const breaks = [
    { id: "a", name: "Winter Break", startDate: "2026-12-21", endDate: "2027-01-01" },
    { id: "b", name: "Snow Day", startDate: "2027-02-02", endDate: "2027-02-02" },
  ];

  it("finds a break sharing a single day with the range", () => {
    expect(findOverlappingBreaks("2027-01-01", "2027-01-05", breaks).map((b) => b.id)).toEqual(["a"]);
  });

  it("ignores ranges that only touch without sharing a day", () => {
    expect(findOverlappingBreaks("2027-01-02", "2027-01-10", breaks)).toEqual([]);
  });

  it("skips the break being edited", () => {
    expect(findOverlappingBreaks("2026-12-21", "2027-01-01", breaks, "a")).toEqual([]);
  });
});

describe("schoolYearOf", () => {
  it("files August onward under the year that just started", () => {
    expect(schoolYearOf("2026-08-01")).toBe(2026);
    expect(schoolYearOf("2026-12-31")).toBe(2026);
  });

  it("files January through July under the year before", () => {
    expect(schoolYearOf("2027-01-01")).toBe(2026);
    expect(schoolYearOf("2027-07-31")).toBe(2026);
  });

  it("labels a year by both of its calendar years", () => {
    expect(schoolYearLabel(2026)).toBe("2026–27");
    expect(schoolYearLabel(2099)).toBe("2099–00");
  });
});

describe("groupBreaksBySchoolYear", () => {
  it("keeps a whole academic year in one bucket, newest year first", () => {
    const groups = groupBreaksBySchoolYear([
      { id: "a", name: "Winter Break", startDate: "2026-12-21", endDate: "2027-01-01" },
      { id: "b", name: "Spring Break", startDate: "2027-03-15", endDate: "2027-03-19" },
      { id: "c", name: "Last year's holiday", startDate: "2025-10-13", endDate: "2025-10-13" },
      { id: "d", name: "Labor Day", startDate: "2026-09-07", endDate: "2026-09-07" },
    ]);

    expect(groups.map((g) => g.label)).toEqual(["2026–27", "2025–26"]);
    // Winter and Spring straddle the calendar-year change but stay together.
    expect(groups[0].breaks.map((b) => b.id)).toEqual(["d", "a", "b"]);
    expect(groups[1].breaks.map((b) => b.id)).toEqual(["c"]);
  });

  it("returns nothing for an empty calendar", () => {
    expect(groupBreaksBySchoolYear([])).toEqual([]);
  });
});

describe("formatBreakRange", () => {
  it("reads a single day as one date", () => {
    expect(formatBreakRange("2026-09-07", "2026-09-07")).toBe("Sep 7, 2026");
  });

  it("drops the repeated year within one year", () => {
    expect(formatBreakRange("2026-11-23", "2026-11-27")).toBe("Nov 23 – Nov 27, 2026");
  });

  it("spells out both ends across a year boundary", () => {
    expect(formatBreakRange("2026-12-21", "2027-01-01")).toBe("Dec 21, 2026 – Jan 1, 2027");
  });

  it("reads the date as written, with no timezone shift", () => {
    // A UTC-parsed midnight renders as the previous day west of Greenwich;
    // these are plain calendar dates and must not move.
    expect(formatBreakDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatBreakDate("2026-12-31")).toBe("Dec 31, 2026");
  });
});
