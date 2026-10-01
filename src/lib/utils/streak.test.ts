import { describe, it, expect } from "vitest";
import { computeStreak, computeLongestStreak, isDayOff } from "./streak";
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

  describe("with non-school days", () => {
    // 2026-06-04 is a Thursday; 2026-05-30/31 are Sat/Sun.
    const monFri = ["mon", "tue", "wed", "thu", "fri"];
    const monday = new Date("2026-06-01T12:00:00Z");

    it("does not reset the streak over a weekend", () => {
      // Logged Thu + Fri, nothing over the weekend, now it's Monday.
      const dates = ["2026-05-28", "2026-05-29"];
      expect(computeStreak(dates, monday, { schoolDays: monFri })).toBe(2);
    });

    it("keeps counting through the weekend when Monday is logged too", () => {
      const dates = ["2026-06-01", "2026-05-29", "2026-05-28"];
      expect(computeStreak(dates, monday, { schoolDays: monFri })).toBe(3);
    });

    it("still counts activity logged on a non-school day", () => {
      // Sat + Sun logged as a bonus on top of Thu/Fri.
      const dates = ["2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31"];
      expect(computeStreak(dates, monday, { schoolDays: monFri })).toBe(4);
    });

    it("still breaks on a missed school day", () => {
      // Thursday missed; only Friday counts back from Monday.
      const dates = ["2026-05-29", "2026-05-27"];
      expect(computeStreak(dates, monday, { schoolDays: monFri })).toBe(1);
    });

    it("honors a custom school-day selection", () => {
      // Tue/Thu-only hero: Fri, Sat, Sun, Mon and Wed are all days off.
      const dates = ["2026-05-28", "2026-05-26"];
      expect(computeStreak(dates, monday, { schoolDays: ["tue", "thu"] })).toBe(2);
    });

    it("does not reset the streak over a school break", () => {
      const dates = ["2026-05-22"]; // the Friday before a week-long break
      const breaks = [{ startDate: "2026-05-25", endDate: "2026-05-29" }];
      expect(computeStreak(dates, monday, { schoolDays: monFri, breaks })).toBe(1);
    });

    it("treats break boundaries as inclusive", () => {
      // Break covers Mon-Fri; the streak reaches back past it to the prior Friday.
      const dates = ["2026-05-22", "2026-05-21"];
      const breaks = [{ startDate: "2026-05-25", endDate: "2026-05-29" }];
      expect(computeStreak(dates, monday, { schoolDays: monFri, breaks })).toBe(2);
    });

    it("does not reset the streak on an optional school day", () => {
      // Friday is a school day, but marked optional — a quiet Friday is fine.
      const dates = ["2026-05-28", "2026-06-01"];
      expect(
        computeStreak(dates, monday, { schoolDays: monFri, optionalDays: ["fri"] })
      ).toBe(2);
      // Without the optional tag, the missed Friday ends the streak at Monday.
      expect(computeStreak(dates, monday, { schoolDays: monFri })).toBe(1);
    });

    it("still counts activity logged on an optional day", () => {
      const dates = ["2026-05-28", "2026-05-29", "2026-06-01"];
      expect(
        computeStreak(dates, monday, { schoolDays: monFri, optionalDays: ["fri"] })
      ).toBe(3);
    });

    it("ignores an optional day that isn't a school day anyway", () => {
      const dates = ["2026-05-28", "2026-06-01"];
      expect(
        computeStreak(dates, monday, { schoolDays: monFri, optionalDays: ["sun"] })
      ).toBe(1);
    });

    it("treats every day as a school day when no options are given", () => {
      const dates = ["2026-05-28", "2026-05-29"];
      expect(computeStreak(dates, monday)).toBe(0);
    });
  });

  it("caps the look-back at 365 days", () => {
    // A full year-plus of consecutive days — should not exceed the 365 cap.
    const dates = Array.from({ length: 400 }, (_, n) => daysBefore(today, n));
    expect(computeStreak(dates, today)).toBe(365);
  });
});

describe("computeLongestStreak", () => {
  const monFri = ["mon", "tue", "wed", "thu", "fri"];

  it("returns 0 for an empty history", () => {
    expect(computeLongestStreak([])).toBe(0);
  });

  it("finds the longest run, not the most recent one", () => {
    // Four in a row in May, then a broken pair in June.
    const dates = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-06-02"];
    expect(computeLongestStreak(dates, { schoolDays: monFri })).toBe(4);
  });

  it("carries a run across a weekend", () => {
    // Thu, Fri, then Mon, Tue — one 4-day run once the weekend is skipped.
    const dates = ["2026-05-28", "2026-05-29", "2026-06-01", "2026-06-02"];
    expect(computeLongestStreak(dates, { schoolDays: monFri })).toBe(4);
    // Without school days, the same history is two separate 2-day runs.
    expect(computeLongestStreak(dates)).toBe(2);
  });

  it("carries a run across a school break", () => {
    const dates = ["2026-05-22", "2026-06-01"];
    const breaks = [{ startDate: "2026-05-25", endDate: "2026-05-29" }];
    expect(computeLongestStreak(dates, { schoolDays: monFri, breaks })).toBe(2);
  });

  it("resets on a missed school day", () => {
    // Wednesday 2026-05-27 is missed, so the run restarts on Thursday.
    const dates = ["2026-05-25", "2026-05-26", "2026-05-28", "2026-05-29"];
    expect(computeLongestStreak(dates, { schoolDays: monFri })).toBe(2);
  });

  it("carries a run across an optional day", () => {
    // Thu, then Mon — Friday is optional and the weekend is off.
    const dates = ["2026-05-28", "2026-06-01"];
    expect(
      computeLongestStreak(dates, { schoolDays: monFri, optionalDays: ["fri"] })
    ).toBe(2);
    expect(computeLongestStreak(dates, { schoolDays: monFri })).toBe(1);
  });

  it("ignores duplicates and unsorted input", () => {
    const dates = ["2026-06-02", "2026-06-01", "2026-06-02", "2026-05-29"];
    expect(computeLongestStreak(dates, { schoolDays: monFri })).toBe(3);
  });
});

describe("excused days", () => {
  const today = new Date("2026-09-07T12:00:00Z"); // a Monday
  const schoolDays = ["mon", "tue", "wed", "thu", "fri"];

  it("skips an excused day instead of breaking the streak", () => {
    // Fri 4th, Thu 3rd logged; Wed 2nd empty; Tue 1st, Mon Aug 31 logged.
    const dates = ["2026-09-04", "2026-09-03", "2026-09-01", "2026-08-31"];
    expect(computeStreak(dates, today, { schoolDays })).toBe(2);
    expect(
      computeStreak(dates, today, { schoolDays, excusedDates: ["2026-09-02"] })
    ).toBe(4);
  });

  it("still counts activity logged on an excused day", () => {
    const dates = ["2026-09-04", "2026-09-03", "2026-09-02"];
    expect(
      computeStreak(dates, today, { schoolDays, excusedDates: ["2026-09-03"] })
    ).toBe(3);
  });

  it("honours excused dates in computeLongestStreak", () => {
    const dates = ["2026-09-04", "2026-09-03", "2026-09-01", "2026-08-31"];
    expect(computeLongestStreak(dates, { schoolDays })).toBe(2);
    expect(
      computeLongestStreak(dates, { schoolDays, excusedDates: ["2026-09-02"] })
    ).toBe(4);
  });

  // The production regression this feature exists to fix. Both heroes' real
  // histories, read from production on 2026-09-07.
  describe("the Aug 31 regression", () => {
    const asOf = new Date("2026-09-04T19:36:00Z");
    const options = { schoolDays, optionalDays: ["fri"] };
    const lily = [
      "2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01",
      "2026-08-28", "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24",
      "2026-08-20", "2026-08-19",
    ];
    const lucas = [
      "2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01",
      "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24",
      "2026-08-20", "2026-08-19",
    ];

    it("reproduces the broken streak of 4", () => {
      expect(computeStreak(lily, asOf, options)).toBe(4);
      expect(computeStreak(lucas, asOf, options)).toBe(4);
    });

    it("restores the streak once Aug 31 is excused", () => {
      const excused = { ...options, excusedDates: ["2026-08-31"] };
      expect(computeStreak(lily, asOf, excused)).toBe(11);
      expect(computeStreak(lucas, asOf, excused)).toBe(10);
    });
  });
});

describe("isDayOff", () => {
  it("is true for a non-school weekday, an optional day, a break, and an excused date", () => {
    const opts = {
      schoolDays: ["mon", "tue", "wed", "thu", "fri"],
      optionalDays: ["fri"],
      breaks: [{ startDate: "2026-09-07", endDate: "2026-09-07" }],
      excusedDates: ["2026-08-31"],
    };
    expect(isDayOff("2026-09-05", opts)).toBe(true); // Saturday
    expect(isDayOff("2026-09-04", opts)).toBe(true); // optional Friday
    expect(isDayOff("2026-09-07", opts)).toBe(true); // break
    expect(isDayOff("2026-08-31", opts)).toBe(true); // excused
    expect(isDayOff("2026-09-03", opts)).toBe(false); // ordinary Thursday
  });
});
