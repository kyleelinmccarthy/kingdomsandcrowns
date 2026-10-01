import { describe, it, expect } from "vitest";
import {
  parseExcuseReason,
  EXCUSE_REASON_LABELS,
  EXCUSE_REASONS,
  collisionKey,
  partitionMovable,
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
