import { describe, it, expect } from "vitest";
import {
  timeRangesOverlap,
  timeRangesConflict,
  findSlotConflict,
  weekdayOfDate,
  defaultRepeatDaysForStartDate,
  syncRepeatDaysWithStartDate,
  parseSchoolDays,
  parseStreakOptionalDays,
  DEFAULT_SCHOOL_DAYS,
} from "./schedule-days";

describe("timeRangesOverlap", () => {
  it("detects a fully contained overlap", () => {
    expect(timeRangesOverlap("09:00", "10:00", "09:15", "09:45")).toBe(true);
  });

  it("detects a partial overlap", () => {
    expect(timeRangesOverlap("09:00", "10:00", "09:30", "10:30")).toBe(true);
  });

  it("treats back-to-back ranges as non-overlapping", () => {
    expect(timeRangesOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });

  it("returns false for ranges on the same day but far apart", () => {
    expect(timeRangesOverlap("09:00", "10:00", "13:00", "14:00")).toBe(false);
  });

  it("detects an identical range as overlapping", () => {
    expect(timeRangesOverlap("09:00", "10:00", "09:00", "10:00")).toBe(true);
  });
});

describe("timeRangesConflict", () => {
  it("allows an identical slot, so two subjects can share one block", () => {
    expect(timeRangesConflict("09:00", "10:00", "09:00", "10:00")).toBe(false);
  });

  it("still rejects a partial overlap", () => {
    expect(timeRangesConflict("09:00", "10:00", "09:30", "10:30")).toBe(true);
  });

  it("still rejects a fully contained range", () => {
    expect(timeRangesConflict("09:00", "10:00", "09:15", "09:45")).toBe(true);
  });

  it("rejects a slot that shares only its start time", () => {
    expect(timeRangesConflict("09:00", "10:00", "09:00", "09:45")).toBe(true);
  });

  it("rejects a slot that shares only its end time", () => {
    expect(timeRangesConflict("09:00", "10:00", "09:15", "10:00")).toBe(true);
  });

  it("leaves back-to-back slots alone", () => {
    expect(timeRangesConflict("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });
});

describe("findSlotConflict", () => {
  // A typical fully-booked morning: nothing free left to drop a subject into.
  const tuesday = [
    { subjectId: "math", startTime: "08:00", endTime: "08:45" },
    { subjectId: "reading", startTime: "08:45", endTime: "09:30" },
    { subjectId: "science", startTime: "09:45", endTime: "10:30" },
  ];

  it("lets a new subject share an existing slot exactly", () => {
    expect(
      findSlotConflict(tuesday, { subjectId: "art", startTime: "08:00", endTime: "08:45" })
    ).toBeNull();
  });

  it("blocks a partial overlap and names the class it hits", () => {
    const conflict = findSlotConflict(tuesday, {
      subjectId: "art",
      startTime: "08:15",
      endTime: "09:00",
    });
    expect(conflict?.kind).toBe("overlap");
    expect(conflict?.block.subjectId).toBe("math");
  });

  it("blocks a range that swallows a whole class", () => {
    const conflict = findSlotConflict(tuesday, {
      subjectId: "art",
      startTime: "08:00",
      endTime: "09:30",
    });
    expect(conflict?.kind).toBe("overlap");
  });

  it("blocks the same subject landing twice in one slot", () => {
    const conflict = findSlotConflict(tuesday, {
      subjectId: "math",
      startTime: "08:00",
      endTime: "08:45",
    });
    expect(conflict?.kind).toBe("duplicate");
  });

  it("allows the same subject at a different time on the same day", () => {
    expect(
      findSlotConflict(tuesday, { subjectId: "math", startTime: "13:00", endTime: "13:45" })
    ).toBeNull();
  });

  it("allows a genuinely free gap between classes", () => {
    expect(
      findSlotConflict(tuesday, { subjectId: "art", startTime: "09:30", endTime: "09:45" })
    ).toBeNull();
  });

  it("allows three subjects to stack in one slot", () => {
    const stacked = [
      { subjectId: "math", startTime: "08:00", endTime: "08:45" },
      { subjectId: "art", startTime: "08:00", endTime: "08:45" },
    ];
    expect(
      findSlotConflict(stacked, { subjectId: "reading", startTime: "08:00", endTime: "08:45" })
    ).toBeNull();
  });
});

describe("weekdayOfDate", () => {
  it("maps a known Monday correctly", () => {
    expect(weekdayOfDate("2026-03-02")).toBe("mon");
  });

  it("maps a known Sunday correctly", () => {
    expect(weekdayOfDate("2026-03-08")).toBe("sun");
  });
});

describe("defaultRepeatDaysForStartDate", () => {
  it("returns the start date's weekday when it's a school day", () => {
    // 2026-03-02 is Monday
    expect(defaultRepeatDaysForStartDate("2026-03-02", ["mon", "tue", "wed", "thu", "fri"])).toEqual(["mon"]);
  });

  it("returns empty when the start date's weekday isn't a school day", () => {
    // 2026-03-07 is Saturday
    expect(defaultRepeatDaysForStartDate("2026-03-07", ["mon", "tue", "wed", "thu", "fri"])).toEqual([]);
  });
});

describe("syncRepeatDaysWithStartDate", () => {
  it("adds the start date's weekday when missing and valid", () => {
    // 2026-03-04 is Wednesday
    expect(syncRepeatDaysWithStartDate(["mon"], "2026-03-04", ["mon", "tue", "wed", "thu", "fri"])).toEqual([
      "mon",
      "wed",
    ]);
  });

  it("leaves days unchanged when the weekday is already present", () => {
    expect(syncRepeatDaysWithStartDate(["mon", "wed"], "2026-03-04", ["mon", "tue", "wed", "thu", "fri"])).toEqual([
      "mon",
      "wed",
    ]);
  });

  it("leaves days unchanged when the start date isn't a school day", () => {
    // 2026-03-07 is Saturday
    expect(syncRepeatDaysWithStartDate(["mon"], "2026-03-07", ["mon", "tue", "wed", "thu", "fri"])).toEqual(["mon"]);
  });
});

describe("parseSchoolDays", () => {
  it("falls back to Mon-Fri for null, empty, and malformed values", () => {
    expect(parseSchoolDays(null)).toEqual(DEFAULT_SCHOOL_DAYS);
    expect(parseSchoolDays("[]")).toEqual(DEFAULT_SCHOOL_DAYS);
    expect(parseSchoolDays("not json")).toEqual(DEFAULT_SCHOOL_DAYS);
    expect(parseSchoolDays('{"mon":true}')).toEqual(DEFAULT_SCHOOL_DAYS);
  });

  it("keeps a stored selection and drops unrecognized codes", () => {
    expect(parseSchoolDays('["mon","tue","funday"]')).toEqual(["mon", "tue"]);
  });
});

describe("parseStreakOptionalDays", () => {
  it("defaults to none — every school day counts unless tagged", () => {
    expect(parseStreakOptionalDays(null)).toEqual([]);
    expect(parseStreakOptionalDays("[]")).toEqual([]);
    expect(parseStreakOptionalDays("not json")).toEqual([]);
  });

  it("keeps a stored selection and drops unrecognized codes", () => {
    expect(parseStreakOptionalDays('["fri","someday"]')).toEqual(["fri"]);
  });
});
