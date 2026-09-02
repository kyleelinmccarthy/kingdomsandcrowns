import { describe, it, expect } from "vitest";
import { findStaleAssignmentIds, type PendingAssignmentRow } from "./assignment-pruning";

const MON_WED = JSON.stringify(["mon", "wed"]);
const SCHOOL_DAYS = ["mon", "tue", "wed", "thu", "fri"];

// 2026-03-02 is a Monday.
function row(overrides: Partial<PendingAssignmentRow> & { id: string; date: string }): PendingAssignmentRow {
  return {
    sourceId: "quest-1",
    sourceIsActive: true,
    schedule: {
      frequency: "weekly",
      daysOfWeek: MON_WED,
      intervalWeeks: 1,
      startDate: "2026-03-02",
      endDate: null,
    },
    ...overrides,
  };
}

const range = { rangeStart: "2026-03-02", rangeEnd: "2026-03-13", schoolDays: SCHOOL_DAYS };

describe("findStaleAssignmentIds", () => {
  it("keeps rows the schedule still calls for", () => {
    const rows = [row({ id: "a", date: "2026-03-02" }), row({ id: "b", date: "2026-03-04" })];
    expect(findStaleAssignmentIds(rows, range)).toEqual([]);
  });

  it("drops every row of a removed quest, scheduled or not", () => {
    const rows = [
      row({ id: "a", date: "2026-03-02", sourceIsActive: false }),
      row({ id: "b", date: "2026-03-04", sourceIsActive: false, schedule: null }),
    ];
    expect(findStaleAssignmentIds(rows, range)).toEqual(["a", "b"]);
  });

  it("drops rows on days a narrowed repeat no longer covers", () => {
    // Repeat edited down from Mon/Wed to Wed only; Monday's row is orphaned.
    const wedOnly = {
      frequency: "weekly" as const,
      daysOfWeek: JSON.stringify(["wed"]),
      intervalWeeks: 1,
      startDate: "2026-03-02",
      endDate: null,
    };
    const rows = [
      row({ id: "mon", date: "2026-03-02", schedule: wedOnly }),
      row({ id: "wed", date: "2026-03-04", schedule: wedOnly }),
    ];
    expect(findStaleAssignmentIds(rows, range)).toEqual(["mon"]);
  });

  it("drops rows past a newly added end date", () => {
    const capped = {
      frequency: "daily" as const,
      daysOfWeek: null,
      intervalWeeks: null,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
    };
    const rows = [
      row({ id: "in", date: "2026-03-03", schedule: capped }),
      row({ id: "out", date: "2026-03-06", schedule: capped }),
    ];
    expect(findStaleAssignmentIds(rows, range)).toEqual(["out"]);
  });

  it("drops off-week rows when the repeat interval widens", () => {
    const everyOtherWeek = {
      frequency: "weekly" as const,
      daysOfWeek: MON_WED,
      intervalWeeks: 2,
      startDate: "2026-03-02",
      endDate: null,
    };
    const rows = [
      row({ id: "week1", date: "2026-03-02", schedule: everyOtherWeek }),
      row({ id: "week2", date: "2026-03-09", schedule: everyOtherWeek }),
    ];
    expect(findStaleAssignmentIds(rows, range)).toEqual(["week2"]);
  });

  it("drops rows on days that are no longer school days", () => {
    const daily = {
      frequency: "daily" as const,
      daysOfWeek: null,
      intervalWeeks: null,
      startDate: "2026-03-02",
      endDate: null,
    };
    const rows = [
      row({ id: "mon", date: "2026-03-02", schedule: daily }),
      row({ id: "fri", date: "2026-03-06", schedule: daily }),
    ];
    expect(
      findStaleAssignmentIds(rows, { ...range, schoolDays: ["mon", "tue", "wed", "thu"] })
    ).toEqual(["fri"]);
  });

  it("leaves an active unscheduled quest's rows alone — those are ad-hoc 'Start a Quest' rows", () => {
    const rows = [row({ id: "a", date: "2026-03-02", schedule: null })];
    expect(findStaleAssignmentIds(rows, range)).toEqual([]);
  });

  it("keeps a one-off 'once' schedule on its exact date even off a school day", () => {
    const once = {
      frequency: "once" as const,
      daysOfWeek: null,
      intervalWeeks: null,
      startDate: "2026-03-07", // Saturday
      endDate: null,
    };
    const rows = [
      row({ id: "sat", date: "2026-03-07", schedule: once }),
      row({ id: "other", date: "2026-03-09", schedule: once }),
    ];
    expect(findStaleAssignmentIds(rows, range)).toEqual(["other"]);
  });

  it("computes each quest's scheduled dates once, then applies them per row", () => {
    const rows = [
      row({ id: "a", sourceId: "q1", date: "2026-03-02" }),
      row({ id: "b", sourceId: "q1", date: "2026-03-03" }), // Tue — not in Mon/Wed
      row({ id: "c", sourceId: "q2", date: "2026-03-04" }),
    ];
    expect(findStaleAssignmentIds(rows, range)).toEqual(["b"]);
  });
});
