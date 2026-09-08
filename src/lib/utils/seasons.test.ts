import { describe, it, expect } from "vitest";
import {
  planSeasonTransition, seasonLabel, nextOrdinal, gradeName,
  pendingCeremony, completedCrowns, crownChoices, bannerCount, wearableCrownIds, seasonsToMark, BANNER_CAP,
  type TransitionInput, type SeasonWithCeremony,
} from "./seasons";
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

describe("clearing the grade", () => {
  it("pauses an open season that has activity", () => {
    expect(planSeasonTransition({ ...base, newGrade: null })).toEqual({ type: "pause", seasonId: "s-open" });
  });
  it("deletes an open season with no activity", () => {
    expect(planSeasonTransition({ ...base, newGrade: null, openSeasonHasActivity: false })).toEqual({ type: "delete_open", seasonId: "s-open" });
  });
  it("does nothing when no season is open", () => {
    expect(planSeasonTransition({ ...base, newGrade: null, openSeason: null })).toEqual({ type: "noop" });
  });
});

const done = (id: string, ordinal: number, crownId: string | null, seen: string | null = null): SeasonWithCeremony => ({
  id, grade: String(ordinal), ordinal, startDate: `${2020 + ordinal}-08-15`, endDate: `${2021 + ordinal}-06-01`, crownId,
  completedAt: `${2021 + ordinal}-06-01T00:00:00.000Z`, ceremonySeenAt: seen,
});
const stillOpen: SeasonWithCeremony = { id: "s-open", grade: "9", ordinal: 9, startDate: "2029-08-15", endDate: null, crownId: null, completedAt: null, ceremonySeenAt: null };

describe("ceremony selection", () => {
  it("picks the newest completed, crowned season whose ceremony has not been seen", () => {
    const seasons = [done("s1", 1, "crown-copper", "2022-06-02T00:00:00.000Z"), done("s2", 2, "crown-iron"), done("s3", 3, "crown-silver"), stillOpen];
    expect(pendingCeremony(seasons)?.id).toBe("s3");
    expect(pendingCeremony([stillOpen, done("s2", 2, "crown-iron"), done("s3", 3, "crown-silver")])?.id).toBe("s3");
  });
  it("is null when every crown has had its ceremony or nothing is complete", () => {
    expect(pendingCeremony([done("s1", 1, "crown-copper", "2022-06-02T00:00:00.000Z"), stillOpen])).toBeNull();
    expect(pendingCeremony([stillOpen])).toBeNull();
    expect(pendingCeremony([])).toBeNull();
  });
  it("still offers a ceremony for an unknown crown id, but never lists it as wearable", () => {
    expect(pendingCeremony([done("s1", 1, "crown-mystery")])?.id).toBe("s1");
    expect(completedCrowns([done("s1", 1, "crown-copper"), done("s2", 2, "crown-mystery")]).map((c) => c.crown.id)).toEqual(["crown-copper"]);
    expect(wearableCrownIds([done("s2", 2, "crown-mystery")]).size).toBe(0);
  });
  it("lists crowns newest first with their season labels and counts banners up to the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => done(`s${i + 1}`, i + 1, crownForOrdinal(i + 1).id));
    expect(completedCrowns(many)[0].crown.id).toBe(crownForOrdinal(10).id);
    expect(crownChoices(many)[9]).toEqual({ id: "crown-copper", label: "Copper Circlet", color: "#b87333", seasonLabel: "2021–22" });
    expect(bannerCount(many)).toBe(BANNER_CAP);
    expect(bannerCount([done("s1", 1, "crown-copper"), stillOpen])).toBe(1);
    expect(bannerCount([stillOpen])).toBe(0);
    expect(wearableCrownIds(many).has("crown-copper")).toBe(true);
    expect(wearableCrownIds([stillOpen]).size).toBe(0);
  });
  it("marks the chosen season and every older unmarked one, never the open season", () => {
    const seasons = [done("s1", 1, "crown-copper"), done("s2", 2, "crown-iron", "2023-06-02T00:00:00.000Z"), done("s3", 3, "crown-silver"), done("s4", 4, "crown-gold"), stillOpen];
    expect(seasonsToMark(seasons, "s3").sort()).toEqual(["s1", "s3"]);
    expect(seasonsToMark(seasons, "s-open")).toEqual([]);
    expect(seasonsToMark(seasons, "nope")).toEqual([]);
    expect(seasonsToMark(seasons, "s2")).toEqual(["s1"]);
  });
  it("names grades for people", () => {
    expect(gradeName("K")).toBe("Kindergarten");
    expect(gradeName("3")).toBe("Grade 3");
  });
});
