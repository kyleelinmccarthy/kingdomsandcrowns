import { describe, expect, it } from "vitest";
import { addDays, todayInZone } from "@/lib/utils/dates";
import { EMPTY_WORLD_STATE, lockedNow, nextRewards, worldStateView, type WorldRow } from "./world-state";
import { worldObjectById } from "./world-objects";

const row = (objectId: string, state: string, updatedAt: Date): WorldRow => ({ objectId, state, updatedAt });

describe("lockedNow", () => {
  it("an object with no row is locked", () => {
    expect(lockedNow({}, null, "2026-11-09", "UTC")).toBe(true);
  });

  it("a row that is not open leaves the object locked", () => {
    expect(lockedNow({}, { state: "shut", updatedAt: new Date("2026-01-01T12:00:00Z") }, "2026-11-09", "UTC")).toBe(true);
  });

  it("a door once open stays open", () => {
    expect(lockedNow({}, { state: "open", updatedAt: new Date("2026-01-01T12:00:00Z") }, "2027-06-01", "UTC")).toBe(false);
  });

  it("a chest relocks on the seventh day in the family's zone", () => {
    // 06:30 UTC on the 3rd is 23:30 on the 2nd in Denver.
    const opened = { state: "open", updatedAt: new Date("2026-11-03T06:30:00Z") };
    const chest = { resetAfterDays: 7 };
    expect(lockedNow(chest, opened, "2026-11-08", "America/Denver")).toBe(false);
    expect(lockedNow(chest, opened, "2026-11-09", "America/Denver")).toBe(true);
    expect(lockedNow(chest, opened, "2026-11-09", "UTC")).toBe(false);
    expect(lockedNow(chest, opened, "2026-11-10", "UTC")).toBe(true);
  });

  it("agrees with the calendar: seven local days on, whatever the hour of the opening", () => {
    for (const at of ["2026-03-07T00:00:00Z", "2026-03-07T18:59:59Z", "2026-03-08T09:59:59Z", "2026-11-01T05:59:59Z"]) {
      const opened = { state: "open", updatedAt: new Date(at) };
      const day = todayInZone("America/Denver", opened.updatedAt);
      expect(lockedNow({ resetAfterDays: 7 }, opened, addDays(day, 6), "America/Denver"), at).toBe(false);
      expect(lockedNow({ resetAfterDays: 7 }, opened, addDays(day, 7), "America/Denver"), at).toBe(true);
    }
  });
});

describe("nextRewards", () => {
  const chest = worldObjectById("chest:west-lane")!;
  it("a chest gives its next unowned reward", () => {
    expect(nextRewards(chest, new Set())).toEqual([{ kind: "decor", id: "stone-bench" }]);
    expect(nextRewards(chest, new Set(["decor:stone-bench"]))).toEqual([{ kind: "decor", id: "sundial" }]);
    expect(nextRewards(chest, new Set(["decor:stone-bench", "decor:sundial", "lore:the-first-lock"]))).toEqual([]);
  });

  it("skips what is owned wherever it sits in the list", () => {
    expect(nextRewards(chest, new Set(["decor:sundial"]))).toEqual([{ kind: "decor", id: "stone-bench" }]);
  });

  it("a door gives everything at once", () => {
    expect(nextRewards(worldObjectById("door:ringstones")!, new Set())).toEqual([
      { kind: "fragment", placeId: "summit-7" },
      { kind: "lore", id: "ringstones-map" },
    ]);
  });
});

describe("worldStateView", () => {
  const now = new Date("2026-11-09T18:00:00Z");
  const clock = { today: todayInZone("UTC", now), zone: "UTC" };
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const rows: WorldRow[] = [
    row("chest:west-lane", "open", now),
    row("chest:east-lane", "open", ago(8)),
    row("decor:sundial", "placed", now),
    row("tower:g23", "2", now),
    row("tower:k1", "x", now),
    row("chest:nope", "open", now),
  ];
  const floors = [
    { band: "k1", open: true },
    { band: "g23", open: true },
    { band: "g45", open: false },
  ] as const;

  it("lists what stands open now, the decorations found and each floor's solved count", () => {
    expect(worldStateView(rows, floors, clock, true)).toEqual({
      locksOn: true,
      open: ["chest:west-lane"],
      decor: ["sundial"],
      tower: [
        { band: "k1", open: true, solved: 0 },
        { band: "g23", open: true, solved: 2 },
        { band: "g45", open: false, solved: 0 },
      ],
    });
  });

  it("carries the locks switch as it is given", () => {
    expect(worldStateView([], [], clock, false).locksOn).toBe(false);
  });

  it("ignores a decoration that is not in the catalog, and an unsent floor row", () => {
    const v = worldStateView([row("decor:nope", "placed", now), row("decor:__proto__", "placed", now), row("tower:g912", "5", now)], floors, clock, true);
    expect(v.decor).toEqual([]);
    expect(v.tower.map((f) => f.solved)).toEqual([0, 0, 0]);
  });

  it("lists open things in catalog order, whatever order the rows come in", () => {
    const v = worldStateView([row("door:ringstones", "open", now), row("chest:west-lane", "open", now)], [], clock, true);
    expect(v.open).toEqual(["chest:west-lane", "door:ringstones"]);
  });
});

describe("EMPTY_WORLD_STATE", () => {
  it("draws nothing", () => {
    expect(EMPTY_WORLD_STATE).toEqual({ locksOn: false, open: [], decor: [], tower: [] });
  });
});
