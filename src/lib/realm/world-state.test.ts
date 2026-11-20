import { describe, expect, it } from "vitest";
import { addDays, todayInZone } from "@/lib/utils/dates";
import { applyTowerOutcome, applyWorldOutcome, EMPTY_WORLD_STATE, lockedNow, nextRewards, roomChestFor, worldCanvas, worldStateView, type WorldRow, type WorldStateView } from "./world-state";
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

  it("reads a row written in the future (clock skew) as open: a chest does not relock before it was opened", () => {
    const skewed = { state: "open", updatedAt: new Date("2026-11-12T12:00:00Z") };
    expect(lockedNow({ resetAfterDays: 7 }, skewed, "2026-11-09", "UTC")).toBe(false);
    expect(lockedNow({}, skewed, "2026-11-09", "UTC")).toBe(false);
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

describe("the canvas the world draws its locks from", () => {
  const view: WorldStateView = {
    locksOn: true,
    open: ["chest:east-lane", "chest:library", "door:longwater"],
    decor: ["stone-bench", "sundial"],
    tower: [{ band: "k1", open: true, solved: 2 }, { band: "g23", open: true, solved: 0 }, { band: "g45", open: false, solved: 0 }],
  };

  it("lists the three village chests and the five vault doors, each open as the view says", () => {
    const c = worldCanvas(view);
    expect(c.locks.map((l) => l.id)).toEqual([
      "chest:west-lane", "chest:east-lane", "chest:castle-back",
      "door:ringstones", "door:highcairn", "door:longwater", "door:farfurrow", "door:appleway",
    ]);
    expect(c.locks.filter((l) => l.open).map((l) => l.id)).toEqual(["chest:east-lane", "door:longwater"]);
    const west = worldObjectById("chest:west-lane")!;
    expect(c.locks[0]).toEqual({ id: west.id, type: "chest", label: "the old chest", x: west.x, z: west.z, ry: west.ry, open: false });
    expect(c.locks[3]).toMatchObject({ type: "door", label: "the vault door" });
    expect(c).toMatchObject({ locksOn: true, decor: ["stone-bench", "sundial"], storeys: 2 });
  });

  it("draws no lock at all with the locks switched off, and keeps what was found and the Tower's storeys (R-G7)", () => {
    expect(worldCanvas({ ...view, locksOn: false })).toEqual({ locksOn: false, locks: [], decor: ["stone-bench", "sundial"], storeys: 2 });
  });

  it("is nothing for the empty state", () => {
    expect(worldCanvas(EMPTY_WORLD_STATE)).toEqual({ locksOn: false, locks: [], decor: [], storeys: 0 });
  });
});

describe("a room's chest", () => {
  const view: WorldStateView = { locksOn: true, open: ["chest:library"], decor: [], tower: [] };

  it("is the library's in the library, open as the view says, in the room's own frame", () => {
    const lib = worldObjectById("chest:library")!;
    expect(roomChestFor("library", view)).toEqual({ id: "chest:library", type: "chest", label: "the old chest", x: lib.x, z: lib.z, ry: lib.ry, open: true });
    expect(roomChestFor("garden", view)).toMatchObject({ id: "chest:garden", open: false });
  });

  it("is none in a room with no chest", () => {
    expect(roomChestFor("mill", view)).toBeNull();
    expect(roomChestFor("castle", view)).toBeNull();
  });

  it("is none with the locks switched off", () => {
    expect(roomChestFor("library", { ...view, locksOn: false })).toBeNull();
  });
});

describe("applyWorldOutcome: the client's mirror of an opening", () => {
  const view: WorldStateView = { locksOn: true, open: ["door:longwater"], decor: ["sundial"], tower: [] };

  it("returns the same view for a miss, and for a lock the view already shows open", () => {
    expect(applyWorldOutcome(view, { objectId: "chest:west-lane", opened: false, reason: "missed", rewards: [] })).toBe(view);
    expect(applyWorldOutcome(view, { objectId: "door:longwater", opened: false, reason: "already-open", rewards: [] })).toBe(view);
  });

  it("shows a lock open when the server says it was already open (another run opened it), adding nothing it gave", () => {
    const next = applyWorldOutcome(view, { objectId: "chest:west-lane", opened: false, reason: "already-open", rewards: [] });
    expect(next).toEqual({ locksOn: true, open: ["chest:west-lane", "door:longwater"], decor: ["sundial"], tower: [] });
    expect(view.open).toEqual(["door:longwater"]);
    expect(applyWorldOutcome(view, { objectId: "chest:nowhere", opened: false, reason: "already-open", rewards: [] })).toBe(view);
  });

  it("opens the object and places a decoration it gave, in catalog order", () => {
    const next = applyWorldOutcome(view, { objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] });
    expect(next).toEqual({ locksOn: true, open: ["chest:west-lane", "door:longwater"], decor: ["stone-bench", "sundial"], tower: [] });
    expect(view.open).toEqual(["door:longwater"]);
  });

  it("opens an emptied chest, and a door, with nothing new placed", () => {
    expect(applyWorldOutcome(view, { objectId: "chest:east-lane", opened: true, rewards: [] }).decor).toEqual(["sundial"]);
    const door = applyWorldOutcome(view, { objectId: "door:ringstones", opened: true, rewards: [{ kind: "fragment", placeId: "summit-7" }, { kind: "lore", id: "ringstones-map" }] });
    expect(door.open).toEqual(["door:ringstones", "door:longwater"]);
    expect(door.decor).toEqual(["sundial"]);
  });

  it("ignores an id that is not in the catalog", () => {
    expect(applyWorldOutcome(view, { objectId: "chest:nowhere", opened: true, rewards: [] }).open).toEqual(["door:longwater"]);
  });
});

describe("applyTowerOutcome: the client's mirror of a floor's solved count", () => {
  const view: WorldStateView = {
    locksOn: true, open: [], decor: [],
    tower: [{ band: "k1", open: true, solved: 2 }, { band: "g23", open: true, solved: 0 }, { band: "g45", open: false, solved: 0 }],
  };

  it("sets that floor's count, and returns a new view without touching the old one", () => {
    const next = applyTowerOutcome(view, { band: "g23", solved: 1, solvedNow: true });
    expect(next).not.toBe(view);
    expect(next.tower).toEqual([{ band: "k1", open: true, solved: 2 }, { band: "g23", open: true, solved: 1 }, { band: "g45", open: false, solved: 0 }]);
    expect(view.tower[1].solved).toBe(0);
    expect(next.open).toBe(view.open);
    expect(next.decor).toBe(view.decor);
  });

  it("takes the server's count as it stands, so a later solve counts on", () => {
    const one = applyTowerOutcome(view, { band: "k1", solved: 3, solvedNow: true });
    expect(applyTowerOutcome(one, { band: "k1", solved: 4, solvedNow: true }).tower[0].solved).toBe(4);
  });

  it("returns the same view for a miss that changed nothing", () => {
    expect(applyTowerOutcome(view, { band: "k1", solved: 2, solvedNow: false })).toBe(view);
  });

  it("returns the same view for a band the view does not show", () => {
    expect(applyTowerOutcome(view, { band: "g912", solved: 1, solvedNow: true })).toBe(view);
    expect(applyTowerOutcome(EMPTY_WORLD_STATE, { band: "k1", solved: 1, solvedNow: true })).toBe(EMPTY_WORLD_STATE);
  });

  it("never opens a floor: the count of a waiting floor is set, its lock stays shut", () => {
    expect(applyTowerOutcome(view, { band: "g45", solved: 1, solvedNow: true }).tower[2]).toEqual({ band: "g45", open: false, solved: 1 });
  });
});
