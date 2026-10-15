import { describe, it, expect } from "vitest";
import {
  parseExcuseReason,
  EXCUSE_REASON_LABELS,
  EXCUSE_REASONS,
  collisionKey,
  partitionMovable,
  plannedKeysOnDate,
  unclaimedPlannedKeys,
  type PlannedQuest,
} from "./excused-days";

describe("parseExcuseReason", () => {
  it("accepts every known reason", () => {
    for (const r of EXCUSE_REASONS) expect(parseExcuseReason(r)).toBe(r);
  });

  it("falls back to other for anything unrecognized", () => {
    expect(parseExcuseReason("nonsense")).toBe("other");
    expect(parseExcuseReason(null)).toBe("other");
    expect(parseExcuseReason(undefined)).toBe("other");
  });

  it("has a label for every reason", () => {
    for (const r of EXCUSE_REASONS) expect(EXCUSE_REASON_LABELS[r]).toBeTruthy();
  });
});

describe("partitionMovable", () => {
  const rows = [
    { id: "a1", childId: "c1", questId: "math" },
    { id: "a2", childId: "c1", questId: "reading" },
    { id: "a3", childId: "c2", questId: "math" },
  ];

  it("moves everything when the target day is clear", () => {
    const { movable, blocked } = partitionMovable(rows, []);
    expect(movable.map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(blocked).toEqual([]);
  });

  // quest_assignment is UNIQUE(child_id, quest_id, date): moving a quest onto a
  // day that already has it would throw, so it stays put instead.
  it("holds back work the target day already has for that hero", () => {
    const { movable, blocked } = partitionMovable(rows, [
      collisionKey({ childId: "c1", questId: "math" }),
    ]);
    expect(movable.map((r) => r.id)).toEqual(["a2", "a3"]);
    expect(blocked.map((r) => r.id)).toEqual(["a1"]);
  });

  it("keys collisions per hero, not globally", () => {
    // c1 already has math on the target day; c2 does not, so c2's math moves.
    const { movable } = partitionMovable(rows, [
      collisionKey({ childId: "c1", questId: "math" }),
    ]);
    expect(movable.map((r) => r.id)).toContain("a3");
  });

  it("never moves the same quest twice onto the target day", () => {
    const dupes = [
      { id: "a1", childId: "c1", questId: "math" },
      { id: "a2", childId: "c1", questId: "math" },
    ];
    const { movable, blocked } = partitionMovable(dupes, []);
    expect(movable.map((r) => r.id)).toEqual(["a1"]);
    expect(blocked.map((r) => r.id)).toEqual(["a2"]);
  });
});

describe("partitionMovable with planned days", () => {
  const rows = [
    { id: "a1", childId: "c1", questId: "math" },
    { id: "a2", childId: "c1", questId: "reading" },
  ];

  // The double-move bug: Monday's maths moved onto a Tuesday whose own maths
  // row had not been generated yet. Tuesday's copy is already planned, so the
  // move is held back even though no row exists there.
  it("holds back work the target day has planned but not yet generated", () => {
    const { movable, blocked } = partitionMovable(
      rows,
      [],
      [collisionKey({ childId: "c1", questId: "math" })]
    );
    expect(movable.map((r) => r.id)).toEqual(["a2"]);
    expect(blocked.map((r) => r.id)).toEqual(["a1"]);
  });

  it("blocks on existing rows and planned keys together", () => {
    const { movable, blocked } = partitionMovable(
      rows,
      [collisionKey({ childId: "c1", questId: "reading" })],
      [collisionKey({ childId: "c1", questId: "math" })]
    );
    expect(movable).toEqual([]);
    expect(blocked.map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("keys planned days per hero", () => {
    const { movable } = partitionMovable(
      [{ id: "a3", childId: "c2", questId: "math" }],
      [],
      [collisionKey({ childId: "c1", questId: "math" })]
    );
    expect(movable.map((r) => r.id)).toEqual(["a3"]);
  });
});

describe("plannedKeysOnDate", () => {
  const MON_TUE = {
    childId: "c1",
    questId: "math",
    isActive: true,
    frequency: "weekly" as const,
    daysOfWeek: JSON.stringify(["mon", "tue"]),
    intervalWeeks: 1,
    startDate: "2026-10-01",
    endDate: null,
  } satisfies PlannedQuest;
  const schoolDays = new Map([["c1", ["mon", "tue", "wed", "thu", "fri"]]]);

  // 2026-10-13 is a Tuesday, 2026-10-15 a Thursday.
  it("includes a weekly quest on one of its days", () => {
    expect([...plannedKeysOnDate("2026-10-13", [MON_TUE], schoolDays)]).toEqual(["c1:math"]);
  });

  it("leaves out a day the schedule does not cover", () => {
    expect(plannedKeysOnDate("2026-10-15", [MON_TUE], schoolDays).size).toBe(0);
  });

  it("never plans an inactive quest", () => {
    const q = { ...MON_TUE, isActive: false };
    expect(plannedKeysOnDate("2026-10-13", [q], schoolDays).size).toBe(0);
  });

  it("leaves out a schedule that ended before the target", () => {
    const q = { ...MON_TUE, endDate: "2026-10-08" };
    expect(plannedKeysOnDate("2026-10-13", [q], schoolDays).size).toBe(0);
  });

  it("leaves out a schedule that has not started yet", () => {
    const q = { ...MON_TUE, startDate: "2026-10-20" };
    expect(plannedKeysOnDate("2026-10-13", [q], schoolDays).size).toBe(0);
  });

  it("ignores a quest with no schedule", () => {
    const q = { ...MON_TUE, frequency: null, daysOfWeek: null, startDate: null };
    expect(plannedKeysOnDate("2026-10-13", [q], schoolDays).size).toBe(0);
  });

  it("honors the hero's school days", () => {
    const daily = { ...MON_TUE, frequency: "daily" as const, daysOfWeek: null };
    const noTuesday = new Map([["c1", ["mon", "wed"]]]);
    expect(plannedKeysOnDate("2026-10-13", [daily], noTuesday).size).toBe(0);
  });

  it("plans a one-off quest only on its own date", () => {
    const once = { ...MON_TUE, frequency: "once" as const, daysOfWeek: null, startDate: "2026-10-13" };
    expect(plannedKeysOnDate("2026-10-13", [once], schoolDays).has("c1:math")).toBe(true);
    expect(plannedKeysOnDate("2026-10-14", [once], schoolDays).size).toBe(0);
  });
});

describe("unclaimedPlannedKeys", () => {
  const math = collisionKey({ childId: "c1", questId: "math" });
  const reading = collisionKey({ childId: "c1", questId: "reading" });

  it("keeps planned keys nothing else has claimed", () => {
    expect([...unclaimedPlannedKeys([math, reading], [])]).toEqual([math, reading]);
  });

  it("drops a planned key a moved row claims through its original date", () => {
    expect([...unclaimedPlannedKeys([math, reading], [math])]).toEqual([reading]);
  });

  // Tuesday's maths row was moved to Thursday (originalDate Tuesday), so
  // generation will never plant Tuesday again. Monday's maths may land there.
  it("lets a move onto a planned day whose own row was moved away", () => {
    const rows = [{ id: "a1", childId: "c1", questId: "math" }];
    const { movable, blocked } = partitionMovable(
      rows,
      [],
      unclaimedPlannedKeys([math], [math])
    );
    expect(movable.map((r) => r.id)).toEqual(["a1"]);
    expect(blocked).toEqual([]);
  });

  it("still blocks when a row actually sits on the target", () => {
    const rows = [{ id: "a1", childId: "c1", questId: "math" }];
    const { blocked } = partitionMovable(rows, [math], unclaimedPlannedKeys([math], [math]));
    expect(blocked.map((r) => r.id)).toEqual(["a1"]);
  });
});
