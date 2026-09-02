import { describe, it, expect } from "vitest";
import { planSeasonTransition, seasonLabel, nextOrdinal, type TransitionInput } from "./seasons";
import { crownForOrdinal, CROWNS } from "./crown-catalog";

const open = { id: "s-open", grade: "3", ordinal: 2, startDate: "2026-08-15" };
const previous = { id: "s-prev", grade: "2", ordinal: 1, startDate: "2025-08-15" };

const base: TransitionInput = {
  openSeason: open,
  previousCompleted: previous,
  openSeasonHasActivity: true,
  newGrade: "4",
  today: "2027-06-01",
  seasonCount: 2,
};

describe("seasonLabel", () => {
  it("names the school year by its start", () => {
    expect(seasonLabel("2026-08-15")).toBe("2026–27");
  });
  it("wraps the century", () => {
    expect(seasonLabel("2099-09-01")).toBe("2099–00");
  });
});

describe("nextOrdinal", () => {
  it("is one more than the seasons so far", () => {
    expect(nextOrdinal(0)).toBe(1);
    expect(nextOrdinal(4)).toBe(5);
  });
});

describe("crownForOrdinal", () => {
  it("gives the copper circlet first", () => {
    expect(crownForOrdinal(1).id).toBe("crown-copper");
  });
  it("clamps past the last tier", () => {
    expect(crownForOrdinal(40).id).toBe(CROWNS[CROWNS.length - 1].id);
    expect(crownForOrdinal(0).id).toBe("crown-copper");
  });
});

describe("planSeasonTransition", () => {
  it("opens a first season when none is open", () => {
    expect(
      planSeasonTransition({ ...base, openSeason: null, previousCompleted: null, seasonCount: 0, newGrade: "K" })
    ).toEqual({ type: "open", grade: "K", ordinal: 1, startDate: "2027-06-01" });
  });

  it("does nothing when the grade is unchanged", () => {
    expect(planSeasonTransition({ ...base, newGrade: "3" })).toEqual({ type: "noop" });
  });

  it("completes the season and mints its crown when the hero moves up", () => {
    expect(planSeasonTransition(base)).toEqual({
      type: "complete_and_open",
      completeId: "s-open",
      endDate: "2027-06-01",
      crownId: "crown-iron",
      open: { grade: "4", ordinal: 3, startDate: "2027-06-01" },
    });
  });

  it("treats a grade skip as one completed season", () => {
    const plan = planSeasonTransition({ ...base, newGrade: "5" });
    expect(plan.type).toBe("complete_and_open");
    if (plan.type === "complete_and_open") expect(plan.open.grade).toBe("5");
  });

  it("moves from kindergarten to first grade as a promotion", () => {
    const plan = planSeasonTransition({
      ...base,
      openSeason: { ...open, grade: "K", ordinal: 1 },
      previousCompleted: null,
      seasonCount: 1,
      newGrade: "1",
    });
    expect(plan.type).toBe("complete_and_open");
  });

  it("only relabels an empty season on a grade increase (a fixed typo is not a finished grade)", () => {
    expect(planSeasonTransition({ ...base, openSeasonHasActivity: false })).toEqual({
      type: "relabel",
      seasonId: "s-open",
      grade: "4",
    });
  });

  it("reverses a mistaken promotion when the new season is still empty", () => {
    expect(planSeasonTransition({ ...base, openSeasonHasActivity: false, newGrade: "2" })).toEqual({
      type: "reopen_previous",
      deleteId: "s-open",
      reopenId: "s-prev",
      grade: "2",
    });
  });

  it("relabels on a grade decrease when the season has activity", () => {
    expect(planSeasonTransition({ ...base, newGrade: "2" })).toEqual({
      type: "relabel",
      seasonId: "s-open",
      grade: "2",
    });
  });

  it("relabels on a grade decrease when there is nothing to reopen", () => {
    expect(
      planSeasonTransition({ ...base, openSeasonHasActivity: false, previousCompleted: null, newGrade: "2" })
    ).toEqual({ type: "relabel", seasonId: "s-open", grade: "2" });
  });

  it("never ends a season before it started", () => {
    const plan = planSeasonTransition({ ...base, today: "2026-08-01" });
    if (plan.type !== "complete_and_open") throw new Error("expected completion");
    expect(plan.endDate).toBe("2026-08-15");
    expect(plan.open.startDate).toBe("2026-08-15");
  });
});
