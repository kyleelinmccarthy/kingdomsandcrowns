import { describe, it, expect } from "vitest";
import {
  MAKEUP_LOOKBACK_DAYS,
  formatMissedDate,
  isMakeupDay,
  isUnfinishedStatus,
  isWithinBreak,
  makeupReason,
  makeupWindowStart,
  parseMakeupDays,
  parseMakeupMode,
  selectMakeupAssignments,
  type MakeupSettings,
} from "./makeup";

// 2026-09-04 is a Friday; 2026-08-31 is the Monday of that week.
const TODAY = "2026-09-04";

const settings = (over: Partial<MakeupSettings> = {}): MakeupSettings => ({
  mode: "always",
  weekdays: [],
  markedDates: [],
  ...over,
});

const item = (date: string, status = "pending", sortOrder = 0) => ({
  assignment: { id: `${date}-${status}-${sortOrder}`, status, date },
  quest: { sortOrder },
});

describe("isUnfinishedStatus", () => {
  it("counts work nobody decided against as still owed", () => {
    expect(isUnfinishedStatus("pending")).toBe(true);
    // A hero who got stuck moved past the quest so the day could go on; the
    // work itself was never done and was never excused.
    expect(isUnfinishedStatus("stuck")).toBe(true);
  });

  it("treats a completed or skipped quest as settled", () => {
    expect(isUnfinishedStatus("completed")).toBe(false);
    // Skipping IS the "not needed" decision — that's what excuses missed work.
    expect(isUnfinishedStatus("skipped")).toBe(false);
    expect(isUnfinishedStatus(undefined)).toBe(false);
  });
});

describe("parseMakeupMode", () => {
  it("reads the stored modes", () => {
    expect(parseMakeupMode("always")).toBe("always");
    expect(parseMakeupMode("makeup_days")).toBe("makeup_days");
    expect(parseMakeupMode("off")).toBe("off");
  });

  it("falls back to carrying work over when the value is missing or junk", () => {
    expect(parseMakeupMode(null)).toBe("always");
    expect(parseMakeupMode(undefined)).toBe("always");
    expect(parseMakeupMode("sometimes")).toBe("always");
  });
});

describe("parseMakeupDays", () => {
  it("reads a stored weekday array", () => {
    expect(parseMakeupDays('["mon","fri"]')).toEqual(["mon", "fri"]);
  });

  it("drops anything that isn't a weekday, and tolerates junk", () => {
    expect(parseMakeupDays('["fri","funday"]')).toEqual(["fri"]);
    expect(parseMakeupDays("not json")).toEqual([]);
    expect(parseMakeupDays('{"fri":true}')).toEqual([]);
    expect(parseMakeupDays(null)).toEqual([]);
  });
});

describe("isMakeupDay", () => {
  it("is every day when catch-up is always on", () => {
    expect(isMakeupDay(TODAY, settings({ mode: "always" }))).toBe(true);
  });

  it("is only the chosen weekdays in makeup_days mode", () => {
    expect(isMakeupDay(TODAY, settings({ mode: "makeup_days", weekdays: ["fri"] }))).toBe(true);
    expect(isMakeupDay(TODAY, settings({ mode: "makeup_days", weekdays: ["mon"] }))).toBe(false);
    expect(isMakeupDay(TODAY, settings({ mode: "makeup_days", weekdays: [] }))).toBe(false);
  });

  it("is never, in off mode", () => {
    expect(isMakeupDay(TODAY, settings({ mode: "off" }))).toBe(false);
  });

  it("honors a date a parent marked, even when catch-up is off", () => {
    expect(isMakeupDay(TODAY, settings({ mode: "off", markedDates: [TODAY] }))).toBe(true);
    expect(isMakeupDay(TODAY, settings({ mode: "off", markedDates: ["2026-09-11"] }))).toBe(false);
  });
});

describe("makeupReason", () => {
  it("names why the panel is showing, most specific first", () => {
    expect(makeupReason(TODAY, settings({ mode: "always", markedDates: [TODAY] }))).toBe("marked_day");
    expect(makeupReason(TODAY, settings({ mode: "makeup_days", weekdays: ["fri"] }))).toBe("makeup_weekday");
    expect(makeupReason(TODAY, settings({ mode: "always" }))).toBe("always");
    expect(makeupReason(TODAY, settings({ mode: "off" }))).toBeNull();
  });
});

describe("isWithinBreak", () => {
  const breaks = [{ startDate: "2026-09-01", endDate: "2026-09-03" }];

  it("covers both ends of the break", () => {
    expect(isWithinBreak("2026-09-01", breaks)).toBe(true);
    expect(isWithinBreak("2026-09-03", breaks)).toBe(true);
  });

  it("leaves days outside it alone", () => {
    expect(isWithinBreak("2026-08-31", breaks)).toBe(false);
    expect(isWithinBreak("2026-09-04", breaks)).toBe(false);
    expect(isWithinBreak("2026-09-02", [])).toBe(false);
  });
});

describe("makeupWindowStart", () => {
  it("reaches back exactly the lookback window", () => {
    expect(MAKEUP_LOOKBACK_DAYS).toBe(7);
    expect(makeupWindowStart(TODAY)).toBe("2026-08-28");
  });
});

describe("selectMakeupAssignments", () => {
  const dates = (rows: ReturnType<typeof selectMakeupAssignments>) =>
    rows.map((r) => r.assignment.date);

  it("keeps only unfinished work from earlier days", () => {
    const rows = [
      item("2026-09-03", "pending"),
      item("2026-09-03", "completed"),
      item("2026-09-02", "skipped"),
      item("2026-09-01", "stuck"),
    ];
    expect(dates(selectMakeupAssignments(rows, TODAY))).toEqual(["2026-09-03", "2026-09-01"]);
  });

  it("never includes today's own quests — today's board already shows them", () => {
    expect(dates(selectMakeupAssignments([item(TODAY, "pending")], TODAY))).toEqual([]);
  });

  it("stops at the lookback window", () => {
    const rows = [item("2026-08-28", "pending"), item("2026-08-27", "pending")];
    expect(dates(selectMakeupAssignments(rows, TODAY))).toEqual(["2026-08-28"]);
  });

  it("honors a caller-narrowed window start", () => {
    const rows = [item("2026-09-01", "pending"), item("2026-09-03", "pending")];
    expect(dates(selectMakeupAssignments(rows, TODAY, "2026-09-02"))).toEqual(["2026-09-03"]);
  });

  it("leaves out days inside a school break — nobody was meant to be working", () => {
    const rows = [item("2026-09-03", "pending"), item("2026-09-02", "pending")];
    const breaks = [{ startDate: "2026-09-02", endDate: "2026-09-02" }];
    expect(dates(selectMakeupAssignments(rows, TODAY, "2026-08-28", breaks))).toEqual([
      "2026-09-03",
    ]);
  });

  it("puts the most recent day first, keeping quest order within a day", () => {
    const rows = [
      item("2026-09-01", "pending", 1),
      item("2026-09-03", "pending", 5),
      item("2026-09-03", "pending", 2),
    ];
    expect(
      selectMakeupAssignments(rows, TODAY).map((r) => `${r.assignment.date}#${r.quest.sortOrder}`)
    ).toEqual(["2026-09-03#2", "2026-09-03#5", "2026-09-01#1"]);
  });
});

describe("formatMissedDate", () => {
  it("names yesterday as yesterday", () => {
    expect(formatMissedDate("2026-09-03", TODAY)).toBe("Yesterday");
  });

  it("names the recent days by weekday", () => {
    expect(formatMissedDate("2026-08-31", TODAY)).toBe("Monday");
    expect(formatMissedDate("2026-09-02", TODAY)).toBe("Wednesday");
  });

  it("falls back to the date a full week back, which shares today's weekday", () => {
    expect(formatMissedDate("2026-08-28", TODAY)).toBe("2026-08-28");
  });
});
