import { describe, it, expect } from "vitest";
import { getDefaultUSSchoolHolidays } from "./school-holidays";
import { weekdayOfDate, addDaysToDate } from "./schedule-days";

function byName(holidays: ReturnType<typeof getDefaultUSSchoolHolidays>, name: string) {
  const found = holidays.find((h) => h.name === name);
  if (!found) throw new Error(`Missing holiday: ${name}`);
  return found;
}

describe("getDefaultUSSchoolHolidays", () => {
  // September 2026 (a school year already in progress).
  const reference = new Date(Date.UTC(2026, 8, 3));
  const holidays = getDefaultUSSchoolHolidays(reference);

  it("returns a fixed set of uniquely named holidays", () => {
    const names = holidays.map((h) => h.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      "Labor Day",
      "Thanksgiving Break",
      "Winter Break",
      "MLK Day",
      "Presidents Day",
      "Spring Break",
      "Memorial Day",
      "Summer Break",
    ]);
  });

  it("every range has startDate <= endDate", () => {
    for (const h of holidays) {
      expect(h.startDate <= h.endDate).toBe(true);
    }
  });

  it("Labor Day is the 1st Monday of September", () => {
    const laborDay = byName(holidays, "Labor Day");
    expect(laborDay.startDate).toBe(laborDay.endDate);
    expect(weekdayOfDate(laborDay.startDate)).toBe("mon");
    expect(laborDay.startDate.slice(0, 7)).toBe("2026-09");
    expect(Number(laborDay.startDate.slice(8, 10))).toBeLessThanOrEqual(7);
  });

  it("Thanksgiving Break spans Wed-Fri around the 4th Thursday of November", () => {
    const tg = byName(holidays, "Thanksgiving Break");
    expect(weekdayOfDate(tg.startDate)).toBe("wed");
    expect(weekdayOfDate(tg.endDate)).toBe("fri");
    expect(addDaysToDate(tg.startDate, 2)).toBe(tg.endDate);
    expect(tg.startDate.slice(0, 7)).toBe("2026-11");
    const thursday = addDaysToDate(tg.startDate, 1);
    const day = Number(thursday.slice(8, 10));
    expect(day).toBeGreaterThanOrEqual(22);
    expect(day).toBeLessThanOrEqual(28);
  });

  it("Winter Break covers Dec 23 through Jan 2, spanning the school-year rollover", () => {
    const wb = byName(holidays, "Winter Break");
    expect(wb.startDate).toBe("2026-12-23");
    expect(wb.endDate).toBe("2027-01-02");
  });

  it("MLK Day is the 3rd Monday of January (the following calendar year)", () => {
    const mlk = byName(holidays, "MLK Day");
    expect(mlk.startDate).toBe(mlk.endDate);
    expect(weekdayOfDate(mlk.startDate)).toBe("mon");
    expect(mlk.startDate.slice(0, 7)).toBe("2027-01");
    const day = Number(mlk.startDate.slice(8, 10));
    expect(day).toBeGreaterThanOrEqual(15);
    expect(day).toBeLessThanOrEqual(21);
  });

  it("Presidents Day is the 3rd Monday of February", () => {
    const pd = byName(holidays, "Presidents Day");
    expect(pd.startDate).toBe(pd.endDate);
    expect(weekdayOfDate(pd.startDate)).toBe("mon");
    expect(pd.startDate.slice(0, 7)).toBe("2027-02");
    const day = Number(pd.startDate.slice(8, 10));
    expect(day).toBeGreaterThanOrEqual(15);
    expect(day).toBeLessThanOrEqual(21);
  });

  it("Spring Break is a Mon-Fri week in mid-March", () => {
    const sb = byName(holidays, "Spring Break");
    expect(weekdayOfDate(sb.startDate)).toBe("mon");
    expect(weekdayOfDate(sb.endDate)).toBe("fri");
    expect(addDaysToDate(sb.startDate, 4)).toBe(sb.endDate);
    expect(sb.startDate.slice(0, 7)).toBe("2027-03");
  });

  it("Memorial Day is the last Monday of May", () => {
    const md = byName(holidays, "Memorial Day");
    expect(md.startDate).toBe(md.endDate);
    expect(weekdayOfDate(md.startDate)).toBe("mon");
    expect(md.startDate.slice(0, 7)).toBe("2027-05");
    const day = Number(md.startDate.slice(8, 10));
    expect(day).toBeGreaterThanOrEqual(25);
  });

  it("Summer Break runs from June 1 through mid-August", () => {
    const summer = byName(holidays, "Summer Break");
    expect(summer.startDate).toBe("2027-06-01");
    expect(summer.endDate).toBe("2027-08-15");
  });

  it("uses the prior calendar year as the school-year start when referenced before July", () => {
    // February 2027 is still inside the school year that started Sept 2026.
    const midYear = getDefaultUSSchoolHolidays(new Date(Date.UTC(2027, 1, 10)));
    expect(byName(midYear, "Labor Day").startDate.slice(0, 4)).toBe("2026");
    expect(byName(midYear, "Memorial Day").startDate.slice(0, 4)).toBe("2027");
  });

  it("treats July as the start of the next school year", () => {
    const summerRef = getDefaultUSSchoolHolidays(new Date(Date.UTC(2026, 6, 15)));
    expect(byName(summerRef, "Labor Day").startDate.slice(0, 4)).toBe("2026");
  });
});
