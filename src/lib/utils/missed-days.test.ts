import { describe, it, expect } from "vitest";
import { selectMissedDays, formatMovedFrom } from "./missed-days";

const schoolDays = ["mon", "tue", "wed", "thu", "fri"];
// 2026-09-07 is a Monday.
const base = { today: "2026-09-07", schoolDays, assignments: [], activeDates: [] };

describe("selectMissedDays", () => {
  it("reports a required school day with no activity", () => {
    const result = selectMissedDays({ ...base, activeDates: ["2026-09-04"] });
    expect(result.map((d) => d.date)).toContain("2026-09-03");
  });

  it("never reports weekends, optional days, breaks, or excused days", () => {
    const result = selectMissedDays({
      ...base,
      optionalDays: ["fri"],
      breaks: [{ startDate: "2026-09-02", endDate: "2026-09-02" }],
      excusedDates: ["2026-09-01"],
    });
    const dates = result.map((d) => d.date);
    expect(dates).not.toContain("2026-09-05"); // Saturday
    expect(dates).not.toContain("2026-09-06"); // Sunday
    expect(dates).not.toContain("2026-09-04"); // optional Friday
    expect(dates).not.toContain("2026-09-02"); // break
    expect(dates).not.toContain("2026-09-01"); // excused
  });

  it("excludes today itself", () => {
    const result = selectMissedDays(base);
    expect(result.map((d) => d.date)).not.toContain("2026-09-07");
  });

  it("reports a day that has activity but still owes work", () => {
    const result = selectMissedDays({
      ...base,
      activeDates: ["2026-09-03"],
      assignments: [
        { date: "2026-09-03", status: "completed" },
        { date: "2026-09-03", status: "pending" },
        { date: "2026-09-03", status: "stuck" },
        { date: "2026-09-03", status: "skipped" },
      ],
    });
    const day = result.find((d) => d.date === "2026-09-03");
    expect(day).toBeDefined();
    expect(day!.empty).toBe(false);
    expect(day!.unfinishedCount).toBe(2); // pending + stuck, not skipped
  });

  it("marks only the most recent empty day as the streak breaker", () => {
    const result = selectMissedDays({
      ...base,
      activeDates: ["2026-09-04", "2026-09-03"],
    });
    const breakers = result.filter((d) => d.brokeStreak).map((d) => d.date);
    expect(breakers).toEqual(["2026-09-02"]);
  });

  it("returns newest first", () => {
    const result = selectMissedDays(base);
    const dates = result.map((d) => d.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("honours the window bound", () => {
    const result = selectMissedDays({ ...base, windowDays: 3 });
    expect(result.every((d) => d.date >= "2026-09-04")).toBe(true);
  });
});

describe("formatMovedFrom", () => {
  it("names the weekday and date", () => {
    expect(formatMovedFrom("2026-08-31")).toBe("Monday, Aug 31");
    expect(formatMovedFrom("2026-09-04")).toBe("Friday, Sep 4");
  });

  it("falls back to the raw date when the month is nonsense", () => {
    expect(formatMovedFrom("2026-13-01")).toBe("2026-13-01");
  });
});
