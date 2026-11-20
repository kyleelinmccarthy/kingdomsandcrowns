import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { IMPROVEMENT_IDS, IMPROVEMENTS } from "@/lib/realm/improvements";
import { HERO_RADIUS } from "./collision";
import { improvementPlacements } from "./improvement-spots";
import { buildSpots, edgeDistance, lockSpot, pickSpot, CHRONICLE_TARGET, PLANS_TARGET, RIDDLE_LABEL, RIDDLE_VERB, siteLabel } from "./interact";
import { RIDDLE_STONE_SPOTS } from "@/lib/realm/riddle-stones";
import { LOCK_SPOT } from "@/lib/realm/world-objects";
import { worldCanvas, type LockSpotView } from "@/lib/realm/world-state";

const layout = buildWorldLayout({
  castleType: "castle",
  buildings: [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "chapel", done: 3, total: 5, complete: false },
  ],
  objectiveIds: ["chapel"],
});
const landmarks = [{ id: "summit-6", name: "Cloudfoot", position: { x: -184, z: -96 } }];
const spots = buildSpots({
  props: layout.props,
  sitePlan: 1.5,
  landmarks,
  castle: { x: 0, z: -12, hw: 3, hd: 1, label: "your castle" },
});
const find = (kind: string, id: string) => spots.findIndex((s) => s.target.kind === kind && s.target.id === id);

describe("what E can act on", () => {
  it("covers villagers, every site built or not, the castle and the landmarks", () => {
    expect(find("villager", "bram")).toBeGreaterThanOrEqual(0);
    expect(find("site", "well")).toBeGreaterThanOrEqual(0);
    expect(find("site", "chapel")).toBeGreaterThanOrEqual(0); // a foundation
    expect(find("site", "garden")).toBeGreaterThanOrEqual(0); // no progress at all
    expect(find("castle", "castle")).toBeGreaterThanOrEqual(0);
    expect(find("landmark", "summit-6")).toBeGreaterThanOrEqual(0);
  });

  it("labels things the way the prompt says them", () => {
    expect(spots[find("villager", "bram")].target.label).toBe("Old Bram");
    // A foundation's E is its villager's conversation, so it is labelled for them (interact-prompt.test.ts).
    expect(spots[find("site", "chapel")].target.label).toBe("Sister Wren");
    expect(siteLabel("Chapel")).toBe("the Chapel");
    expect(spots[find("landmark", "summit-6")].target.label).toBe("Cloudfoot");
    expect(siteLabel("the Mill")).toBe("the Mill");
  });

  it("leaves the castle out when there is none", () => {
    const none = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null });
    expect(none.some((s) => s.target.kind === "castle")).toBe(false);
  });

  it("measures reach from the edge of a building, not its middle", () => {
    const well = spots[find("site", "well")];
    expect(edgeDistance(well, well.x, well.z)).toBe(0);
    expect(edgeDistance(well, well.x + well.hw + 1, well.z)).toBeCloseTo(1);
  });

  it("finds nothing out in an empty field", () => {
    expect(pickSpot(spots, 60, 60, -1)).toBe(-1);
  });

  it("prefers the villager to the site they stand in front of", () => {
    const bram = spots[find("villager", "bram")];
    const i = pickSpot(spots, bram.x, bram.z + 0.9, -1);
    expect(spots[i].target.id).toBe("bram");
  });

  it("holds its choice instead of flickering between two equally close things", () => {
    const well = spots[find("site", "well")];
    const x = well.x - well.hw - 1.2; // west of the well, out of the villager's reach
    const first = pickSpot(spots, x, well.z, -1);
    expect(spots[first].target.id).toBe("well");
    // Step to where something else is only barely nearer: the well is kept.
    expect(pickSpot(spots, x, well.z, first)).toBe(first);
  });

  it("lets go once the child walks away", () => {
    const well = spots[find("site", "well")];
    const i = find("site", "well");
    expect(pickSpot(spots, well.x - well.hw - 6, well.z, i)).not.toBe(i);
  });
});

describe("the riddle stones", () => {
  it("adds one round spot per stone, read with E, its id the place's", () => {
    const stones = [{ placeId: "longwater", x: 33, z: -30.5 }, { placeId: "appleway", x: -5.5, z: 49 }];
    const withStones = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, stones });
    const riddles = withStones.filter((s) => s.target.kind === "riddle");
    expect(riddles.map((s) => s.target)).toEqual([
      { kind: "riddle", id: "longwater", label: RIDDLE_LABEL, verb: RIDDLE_VERB },
      { kind: "riddle", id: "appleway", label: RIDDLE_LABEL, verb: RIDDLE_VERB },
    ]);
    expect(RIDDLE_VERB).toBe("Read");
    expect(riddles[0]).toMatchObject({ x: 33, z: -30.5, round: true });
    // Standing beside it, E is at the stone.
    expect(withStones[pickSpot(withStones, 33, -29.5, -1)].target).toMatchObject({ kind: "riddle", id: "longwater" });
  });

  it("has none when none are given", () => {
    expect(spots.some((s) => s.target.kind === "riddle")).toBe(false);
  });
});

describe("the plans board", () => {
  const board = KEEP_YARD.plansBoard;
  const withBoard = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, plans: board });

  it("adds one spot at the board, read with E", () => {
    const plans = withBoard.filter((s) => s.target.kind === "plans");
    expect(plans.map((s) => s.target)).toEqual([{ kind: "plans", id: "plans-board", label: "Kingdom plans", verb: "Read" }]);
    expect(plans[0].target).toBe(PLANS_TARGET);
    expect(plans[0]).toMatchObject({ x: board.x, z: board.z });
  });

  it("is what E acts on when the hero walks up to it, from any side", () => {
    for (const [dx, dz] of [[0, 1.8], [1.8, 0], [0, -1.8], [-1.8, 0]]) {
      expect(withBoard[pickSpot(withBoard, board.x + dx, board.z + dz, -1)]?.target, `${dx},${dz}`).toBe(PLANS_TARGET);
    }
  });

  it("lets go once the hero walks on", () => {
    const i = withBoard.findIndex((s) => s.target.kind === "plans");
    expect(pickSpot(withBoard, board.x + 6, board.z, i)).not.toBe(i);
  });

  it("has none when none is given", () => {
    expect(spots.some((s) => s.target.kind === "plans")).toBe(false);
  });
});

describe("the Scribe's lectern", () => {
  const lectern = KEEP_YARD.lectern;
  const withLectern = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, chronicle: lectern });

  it("adds one spot at the lectern, read with E", () => {
    const found = withLectern.filter((s) => s.target.kind === "chronicle");
    expect(found.map((s) => s.target)).toEqual([{ kind: "chronicle", id: "lectern", label: "The Chronicle", verb: "Read" }]);
    expect(found[0].target).toBe(CHRONICLE_TARGET);
    expect(found[0]).toMatchObject({ x: lectern.x, z: lectern.z });
  });

  it("is what E acts on when the hero walks up to it, from any side", () => {
    for (const [dx, dz] of [[0, 1.5], [1.5, 0], [0, -1.5], [-1.5, 0]]) {
      expect(withLectern[pickSpot(withLectern, lectern.x + dx, lectern.z + dz, -1)]?.target, `${dx},${dz}`).toBe(CHRONICLE_TARGET);
    }
  });

  it("lets go once the hero walks on", () => {
    const i = withLectern.findIndex((s) => s.target.kind === "chronicle");
    expect(pickSpot(withLectern, lectern.x + 6, lectern.z, i)).not.toBe(i);
  });

  it("has none when none is given", () => {
    expect(spots.some((s) => s.target.kind === "chronicle")).toBe(false);
  });
});

describe("the plaques", () => {
  const all = buildWorldLayout({
    castleType: "castle",
    buildings: ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({ id, done: 5, total: 5, complete: true })),
  });
  const placements = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0);
  const plaques = placements.map((p) => ({ id: p.id, label: IMPROVEMENTS[p.id].label, ...p.plaque }));
  const withPlaques = buildSpots({ props: all.props, sitePlan: 1.5, landmarks: [], castle: null, plaques });
  const at = (id: string) => withPlaques.findIndex((s) => s.target.kind === "plaque" && s.target.id === id);

  it("adds one spot per built improvement, at its plaque point, read with E", () => {
    expect(withPlaques.filter((s) => s.target.kind === "plaque")).toHaveLength(IMPROVEMENT_IDS.length);
    const well = withPlaques[at("well-house")];
    expect(well.target).toEqual({ kind: "plaque", id: "well-house", label: "the Well House plaque", verb: "Read" });
    expect(well).toMatchObject({ x: placements[0].plaque.x, z: placements[0].plaque.z, round: true });
  });

  it("has none when none is given", () => {
    expect(spots.some((s) => s.target.kind === "plaque")).toBe(false);
  });

  it("is what E acts on at every plaque, in a fully built village (no villager or site outranks it)", () => {
    for (const p of placements) {
      expect(withPlaques[pickSpot(withPlaques, p.plaque.x, p.plaque.z, -1)]?.target, p.id).toMatchObject({ kind: "plaque", id: p.id });
    }
  });

  it("is reachable: the hero can stand at every plaque point, and a step toward it from the south", () => {
    const blocked = (x: number, z: number) =>
      all.colliders.some((c) => Math.abs(x - c.position.x) < c.size.w / 2 + HERO_RADIUS && Math.abs(z - c.position.z) < c.size.d / 2 + HERO_RADIUS);
    for (const p of placements) {
      expect(blocked(p.plaque.x, p.plaque.z), `${p.id} plaque point is walled off`).toBe(false);
      expect(blocked(p.plaque.x, p.plaque.z + 1), `${p.id} plaque is walled off from the south`).toBe(false);
    }
  });

  it("is let go once the hero walks on", () => {
    const i = at("well-house");
    expect(pickSpot(withPlaques, placements[0].plaque.x + 7, placements[0].plaque.z + 7, i)).not.toBe(i);
  });
});

describe("the world's locks", () => {
  const all = buildWorldLayout({
    castleType: "castle",
    buildings: ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({ id, done: 5, total: 5, complete: true })),
  });
  const locks = worldCanvas({ locksOn: true, open: ["chest:east-lane", "door:longwater"], decor: [], tower: [] }).locks;
  const withLocks = buildSpots({ props: all.props, sitePlan: 1.5, landmarks: [], castle: null, locks });
  const at = (l: LockSpotView) => withLocks.findIndex((s) => s.target.kind === "lock" && s.target.id === l.id);

  it("adds one round spot per lock, at the lock, the size of its footprint", () => {
    expect(withLocks.filter((s) => s.target.kind === "lock")).toHaveLength(locks.length);
    for (const l of locks) {
      const s = withLocks[at(l)];
      expect(s, l.id).toMatchObject({ x: l.x, z: l.z, round: true, hw: LOCK_SPOT.radius, hd: LOCK_SPOT.radius, reach: LOCK_SPOT.reach });
      expect(s).toEqual(lockSpot(l));
    }
  });

  it("says Open at a shut lock, Look in at an open chest and Look through at an open vault door", () => {
    const target = (id: string) => withLocks[at(locks.find((l) => l.id === id)!)].target;
    expect(target("chest:west-lane")).toEqual({ kind: "lock", id: "chest:west-lane", label: "the old chest", verb: "Open" });
    expect(target("door:ringstones")).toEqual({ kind: "lock", id: "door:ringstones", label: "the vault door", verb: "Open" });
    expect(target("chest:east-lane")).toEqual({ kind: "lock", id: "chest:east-lane", label: "the old chest", verb: "Look in" });
    expect(target("door:longwater")).toEqual({ kind: "lock", id: "door:longwater", label: "the vault door", verb: "Look through" });
  });

  it("is what E acts on when the hero walks up to it, from any side", () => {
    const d = LOCK_SPOT.radius + 1.2;
    for (const l of locks) {
      for (const [dx, dz] of [[0, d], [d, 0], [0, -d], [-d, 0]]) {
        expect(withLocks[pickSpot(withLocks, l.x + dx, l.z + dz, -1)]?.target.id, `${l.id} from ${dx},${dz}`).toBe(l.id);
      }
    }
  });

  it("lets go once the hero walks on", () => {
    for (const l of locks) expect(pickSpot(withLocks, l.x + 7, l.z + 7, at(l)), l.id).not.toBe(at(l));
  });

  it("has none when none are given", () => {
    expect(spots.some((s) => s.target.kind === "lock")).toBe(false);
    expect(buildSpots({ props: [], sitePlan: 1.5, landmarks: [], castle: null, locks: [] })).toEqual([]);
  });

  it("no spot's reach holds another spot's centre: every lock, riddle stone, the plans board, the lectern and every plaque at level 3 (F19)", () => {
    const placements = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0);
    const plaques = placements.map((p) => ({ id: p.id, label: IMPROVEMENTS[p.id].label, ...p.plaque }));
    const set = buildSpots({ props: [], sitePlan: 1.5, landmarks: [], castle: null, locks, stones: RIDDLE_STONE_SPOTS, plans: KEEP_YARD.plansBoard, chronicle: KEEP_YARD.lectern, plaques });
    expect(set).toHaveLength(locks.length + RIDDLE_STONE_SPOTS.length + 2 + plaques.length);
    const held: string[] = [];
    for (const a of set) {
      for (const b of set) {
        if (a !== b && edgeDistance(a, b.x, b.z) <= a.reach) held.push(`${a.target.kind} ${a.target.id} holds ${b.target.kind} ${b.target.id}`);
      }
    }
    expect(held).toEqual([]);
  });
});
