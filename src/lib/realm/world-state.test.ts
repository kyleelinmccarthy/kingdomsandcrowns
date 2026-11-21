import { describe, expect, it } from "vitest";
import { addDays, todayInZone } from "@/lib/utils/dates";
import { applyRuneOutcomes, applyTowerOutcome, applyWorldOutcome, brokenNow, withRuneWalk, EMPTY_WORLD_STATE, heldNow, lockedNow, nextRewards, roomChestFor, solvedCount, worldCanvas, worldStateView, type WorldRow, type WorldStateView } from "./world-state";
import { worldObjectById, WORLD_OBJECTS } from "./world-objects";
import { RUNE_OBJECTS } from "./rune-objects";

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
      runesOn: false,
      open: ["chest:west-lane"],
      fixed: [],
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
    expect(EMPTY_WORLD_STATE).toEqual({ locksOn: false, runesOn: false, open: [], fixed: [], decor: [], tower: [] });
  });
});

describe("the canvas the world draws its locks from", () => {
  const view: WorldStateView = {
    locksOn: true,
    runesOn: false,
    open: ["chest:east-lane", "chest:library", "door:longwater"],
    fixed: [],
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
    expect(c).toMatchObject({ locksOn: true, decor: ["stone-bench", "sundial"], storeys: 2, towerKnown: true });
  });

  it("knows the Tower's floors only when the view lists some: a failed kingdom read lists none (final f2)", () => {
    expect(worldCanvas({ ...view, tower: [] })).toMatchObject({ locksOn: true, storeys: 0, towerKnown: false });
  });

  it("draws no lock at all with the locks switched off, and keeps what was found and the Tower's storeys (R-G7)", () => {
    expect(worldCanvas({ ...view, locksOn: false })).toEqual({ locksOn: false, locks: [], runes: [], decor: ["stone-bench", "sundial"], storeys: 2, towerKnown: true });
  });

  it("is nothing for the empty state", () => {
    expect(worldCanvas(EMPTY_WORLD_STATE)).toEqual({ locksOn: false, locks: [], runes: [], decor: [], storeys: 0, towerKnown: false });
  });
});

describe("a room's chest", () => {
  const view: WorldStateView = { locksOn: true, runesOn: false, open: ["chest:library"], fixed: [], decor: [], tower: [] };

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
  const view: WorldStateView = { locksOn: true, runesOn: false, open: ["door:longwater"], fixed: [], decor: ["sundial"], tower: [] };

  it("returns the same view for a miss, and for a lock the view already shows open", () => {
    expect(applyWorldOutcome(view, { objectId: "chest:west-lane", opened: false, reason: "missed", rewards: [] })).toBe(view);
    expect(applyWorldOutcome(view, { objectId: "door:longwater", opened: false, reason: "already-open", rewards: [] })).toBe(view);
  });

  it("shows a lock open when the server says it was already open (another run opened it), adding nothing it gave", () => {
    const next = applyWorldOutcome(view, { objectId: "chest:west-lane", opened: false, reason: "already-open", rewards: [] });
    expect(next).toEqual({ locksOn: true, runesOn: false, open: ["chest:west-lane", "door:longwater"], fixed: [], decor: ["sundial"], tower: [] });
    expect(view.open).toEqual(["door:longwater"]);
    expect(applyWorldOutcome(view, { objectId: "chest:nowhere", opened: false, reason: "already-open", rewards: [] })).toBe(view);
  });

  it("places nothing an outcome that did not open carries: only an opening's rewards are folded in (G4 m1)", () => {
    const decor = [{ kind: "decor" as const, id: "stone-bench" as const }];
    const shut = applyWorldOutcome(view, { objectId: "chest:west-lane", opened: false, reason: "already-open", rewards: decor });
    expect(shut.open).toEqual(["chest:west-lane", "door:longwater"]);
    expect(shut.decor).toEqual(["sundial"]);
    expect(applyWorldOutcome(view, { objectId: "chest:west-lane", opened: false, reason: "missed", rewards: decor })).toBe(view);
  });

  it("opens the object and places a decoration it gave, in catalog order", () => {
    const next = applyWorldOutcome(view, { objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] });
    expect(next).toEqual({ locksOn: true, runesOn: false, open: ["chest:west-lane", "door:longwater"], fixed: [], decor: ["stone-bench", "sundial"], tower: [] });
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

describe("solvedCount: the one reading of a floor's record (final f5)", () => {
  it("reads a whole count, and anything else as none", () => {
    expect(solvedCount("0")).toBe(0);
    expect(solvedCount("7")).toBe(7);
    expect(solvedCount("123456789")).toBe(123456789);
    for (const junk of [undefined, "", "-1", "1.5", "abc", " 3", "1234567890"]) expect(solvedCount(junk), String(junk)).toBe(0);
  });
});

describe("applyTowerOutcome: the client's mirror of a floor's solved count", () => {
  const view: WorldStateView = {
    locksOn: true, runesOn: false, open: [], fixed: [], decor: [],
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

describe("heldNow is the one rule (R-I3)", () => {
  const open = (iso: string) => ({ state: "open", updatedAt: new Date(iso) });

  it("holds what the row's state says, for as long as the object's reset allows", () => {
    expect(heldNow({}, null, "open", "2026-11-09", "UTC")).toBe(false);
    expect(heldNow({}, { state: "shut", updatedAt: new Date("2026-01-01T12:00:00Z") }, "open", "2026-11-09", "UTC")).toBe(false);
    expect(heldNow({}, open("2026-01-01T12:00:00Z"), "open", "2027-06-01", "UTC")).toBe(true);
    expect(heldNow({ resetAfterDays: 7 }, open("2026-11-03T06:30:00Z"), "open", "2026-11-09", "UTC")).toBe(true);
    expect(heldNow({ resetAfterDays: 7 }, open("2026-11-03T06:30:00Z"), "open", "2026-11-10", "UTC")).toBe(false);
  });

  it("reads the state it is asked about: a fixed row does not hold an open lock, nor the reverse", () => {
    const fixed = { state: "fixed", updatedAt: new Date("2026-11-09T12:00:00Z") };
    expect(heldNow({ resetAfterDays: 4 }, fixed, "fixed", "2026-11-09", "UTC")).toBe(true);
    expect(heldNow({ resetAfterDays: 4 }, fixed, "open", "2026-11-09", "UTC")).toBe(false);
    expect(heldNow({ resetAfterDays: 4 }, open("2026-11-09T12:00:00Z"), "fixed", "2026-11-09", "UTC")).toBe(false);
  });

  it("makes lockedNow its negation for open, on every chest and door, row or none, day by day", () => {
    const rows = [null, open("2026-11-03T06:30:00Z"), { state: "shut", updatedAt: new Date("2026-11-03T06:30:00Z") }, open("2026-11-12T12:00:00Z")];
    for (const o of WORLD_OBJECTS) {
      for (const r of rows) {
        for (const today of ["2026-11-03", "2026-11-09", "2026-11-10", "2027-03-01"]) {
          expect(lockedNow(o, r, today, "America/Denver"), `${o.id} ${today}`).toBe(!heldNow(o, r, "open", today, "America/Denver"));
        }
      }
    }
  });
});

describe("brokenNow: a rune object's cycle (R-I3)", () => {
  const rune = { resetAfterDays: 4 };
  const fixedAt = (iso: string) => ({ state: "fixed", updatedAt: new Date(iso) });

  it("is broken with no row, and for a row that is not fixed", () => {
    expect(brokenNow(rune, null, "2026-11-09", "UTC")).toBe(true);
    expect(brokenNow(rune, { state: "open", updatedAt: new Date("2026-11-09T12:00:00Z") }, "2026-11-09", "UTC")).toBe(true);
  });

  it("holds fixed on the day of the fix and through day 3, and breaks on day 4", () => {
    const row = fixedAt("2026-11-09T12:00:00Z");
    expect(brokenNow(rune, row, "2026-11-09", "UTC")).toBe(false);
    expect(brokenNow(rune, row, "2026-11-12", "UTC")).toBe(false);
    expect(brokenNow(rune, row, "2026-11-13", "UTC")).toBe(true);
  });

  it("agrees with the calendar in the family's zone, whatever the hour of the fix", () => {
    for (const at of ["2026-03-07T00:00:00Z", "2026-03-07T18:59:59Z", "2026-03-08T09:59:59Z", "2026-11-01T05:59:59Z"]) {
      const row = fixedAt(at);
      const day = todayInZone("America/Denver", row.updatedAt);
      expect(brokenNow(rune, row, day, "America/Denver"), at).toBe(false);
      expect(brokenNow(rune, row, addDays(day, 3), "America/Denver"), at).toBe(false);
      expect(brokenNow(rune, row, addDays(day, 4), "America/Denver"), at).toBe(true);
    }
  });

  it("reads a row written in the future (clock skew) as fixed", () => {
    expect(brokenNow(rune, fixedAt("2026-11-12T12:00:00Z"), "2026-11-09", "UTC")).toBe(false);
  });
});

describe("the view's rune objects", () => {
  const now = new Date("2026-11-09T18:00:00Z");
  const clock = { today: todayInZone("UTC", now), zone: "UTC" };
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("lists the fixed ones in catalog order, whatever order the rows come in, and carries the switch", () => {
    const rows: WorldRow[] = [
      row("rune:lane-vine", "fixed", now),
      row("rune:west-wagon", "fixed", ago(2)),
      row("rune:east-barrow", "fixed", ago(5)),
      row("rune:nope", "fixed", now),
      row("rune:flower-bed", "open", now),
    ];
    const v = worldStateView(rows, [], clock, true, true);
    expect(v.fixed).toEqual(["rune:west-wagon", "rune:lane-vine"]);
    expect(v.runesOn).toBe(true);
  });

  it("carries runesOn false when the fifth argument is absent, and still lists what is fixed (the records stay, R-I13)", () => {
    const v = worldStateView([row("rune:west-wagon", "fixed", now)], [], clock, true);
    expect(v.runesOn).toBe(false);
    expect(v.fixed).toEqual(["rune:west-wagon"]);
  });

  it("keeps the two lists apart: a rune row is never open, a chest row never fixed", () => {
    const v = worldStateView([row("rune:west-wagon", "fixed", now), row("chest:west-lane", "open", now)], [], clock, true, true);
    expect(v.open).toEqual(["chest:west-lane"]);
    expect(v.fixed).toEqual(["rune:west-wagon"]);
  });
});

describe("the canvas's rune objects", () => {
  const view: WorldStateView = {
    locksOn: true,
    runesOn: true,
    open: ["chest:east-lane"],
    fixed: ["rune:west-wagon", "rune:ringstones-oak"],
    decor: ["sundial"],
    tower: [{ band: "k1", open: true, solved: 1 }],
  };

  it("draws all fifteen with runes on, each fixed as the view says, labelled for its state (RI-a / N8)", () => {
    const c = worldCanvas(view);
    expect(c.runes.map((r) => r.id)).toEqual(RUNE_OBJECTS.map((o) => o.id));
    expect(c.runes.filter((r) => r.fixed).map((r) => r.id)).toEqual(["rune:west-wagon", "rune:ringstones-oak"]);
    const wagon = RUNE_OBJECTS[0];
    expect(c.runes[0]).toEqual({ id: wagon.id, effect: "mend", label: "the wagon", x: wagon.x, z: wagon.z, ry: wagon.ry, fixed: true });
    expect(c.runes[1]).toMatchObject({ id: "rune:east-barrow", label: "the broken barrow", fixed: false });
  });

  it("draws none with runes off, and keeps the locks, decorations, storeys and Tower as they were", () => {
    const off = worldCanvas({ ...view, runesOn: false });
    expect(off.runes).toEqual([]);
    expect({ ...off, runes: worldCanvas(view).runes }).toEqual(worldCanvas(view));
    expect(off).toMatchObject({ locksOn: true, decor: ["sundial"], storeys: 1, towerKnown: true });
    expect(off.locks.filter((l) => l.open).map((l) => l.id)).toEqual(["chest:east-lane"]);
  });

  it("keeps the two switches apart: runes on with the locks off draws every rune object and no lock", () => {
    const c = worldCanvas({ ...view, locksOn: false });
    expect(c.locks).toEqual([]);
    expect(c.runes).toHaveLength(15);
  });
});

describe("applyRuneOutcomes: the client's mirror of a fix", () => {
  const view: WorldStateView = { locksOn: true, runesOn: true, open: [], fixed: ["rune:lane-vine"], decor: [], tower: [] };

  it("gives back the same view for a miss, an unknown id and an object the view already shows fixed", () => {
    expect(applyRuneOutcomes(view, [{ objectId: "rune:west-wagon", fixed: false, reason: "missed" }])).toBe(view);
    expect(applyRuneOutcomes(view, [{ objectId: "rune:nope", fixed: true }])).toBe(view);
    expect(applyRuneOutcomes(view, [{ objectId: "rune:lane-vine", fixed: true }])).toBe(view);
    expect(applyRuneOutcomes(view, [{ objectId: "rune:lane-vine", fixed: false, reason: "already-fixed" }])).toBe(view);
    expect(applyRuneOutcomes(view, [])).toBe(view);
  });

  it("adds a fixed object in catalog order, without touching the old view", () => {
    const next = applyRuneOutcomes(view, [{ objectId: "rune:west-wagon", fixed: true }]);
    expect(next).not.toBe(view);
    expect(next.fixed).toEqual(["rune:west-wagon", "rune:lane-vine"]);
    expect(view.fixed).toEqual(["rune:lane-vine"]);
    expect(next.open).toBe(view.open);
    expect(next.decor).toBe(view.decor);
  });

  it("shows an object another run already fixed as fixed too", () => {
    expect(applyRuneOutcomes(view, [{ objectId: "rune:east-barrow", fixed: false, reason: "already-fixed" }]).fixed).toEqual(["rune:east-barrow", "rune:lane-vine"]);
  });

  it("folds several outcomes in one pass", () => {
    const next = applyRuneOutcomes(view, [
      { objectId: "rune:farfurrow-gate", fixed: true },
      { objectId: "rune:old-tree", fixed: false, reason: "missed" },
      { objectId: "rune:lane-lantern", fixed: true },
    ]);
    expect(next.fixed).toEqual(["rune:lane-lantern", "rune:lane-vine", "rune:farfurrow-gate"]);
  });
});

describe("withRuneWalk: a rune walk's view of its objects (owner, 2026-11-21)", () => {
  // The lantern, the flower bed and the tree stand fixed on their records; the wagon is broken.
  const view: WorldStateView = { ...EMPTY_WORLD_STATE, runesOn: true, fixed: ["rune:lane-lantern", "rune:flower-bed", "rune:old-tree"] };
  const canvas = worldCanvas(view);
  const spot = (c: ReturnType<typeof worldCanvas>, id: string) => c.runes.find((r) => r.id === id)!;

  it("no walk is the canvas itself", () => {
    expect(withRuneWalk(canvas, null)).toBe(canvas);
  });

  it("every object the walk still names is drawn broken, by its broken label, whatever its record says", () => {
    const walked = withRuneWalk(canvas, { named: ["rune:west-wagon", "rune:lane-lantern", "rune:flower-bed"], mended: [] });
    expect(spot(walked, "rune:lane-lantern")).toMatchObject({ fixed: false, label: "the dark lantern" });
    expect(spot(walked, "rune:flower-bed")).toMatchObject({ fixed: false, label: "the dry flower bed" });
    expect(spot(walked, "rune:west-wagon")).toEqual(spot(canvas, "rune:west-wagon"));
    // An object the walk does not name keeps its record: the tree stands fixed.
    expect(spot(walked, "rune:old-tree")).toBe(spot(canvas, "rune:old-tree"));
    expect(walked.locks).toBe(canvas.locks);
  });

  it("an object cast right on this walk shows mended, by its fixed label, even while it is still named", () => {
    const walked = withRuneWalk(canvas, { named: ["rune:west-wagon", "rune:lane-lantern"], mended: ["rune:west-wagon"] });
    expect(spot(walked, "rune:west-wagon")).toMatchObject({ fixed: true, label: "the wagon" });
    expect(spot(walked, "rune:lane-lantern")).toMatchObject({ fixed: false, label: "the dark lantern" });
  });

  it("a walk that changes nothing gives back the same canvas, so the memoised World is not redrawn", () => {
    expect(withRuneWalk(canvas, { named: ["rune:west-wagon"], mended: [] })).toBe(canvas);
    expect(withRuneWalk(canvas, { named: [], mended: ["rune:lane-lantern"] })).toBe(canvas);
  });

  it("runes off: nothing is drawn, walk or not", () => {
    const off = worldCanvas({ ...view, runesOn: false });
    expect(withRuneWalk(off, { named: ["rune:lane-lantern"], mended: [] })).toBe(off);
  });
});
