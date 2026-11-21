import { describe, expect, it } from "vitest";
import { buildWorldLayout, CASTLE_POSITION } from "@/lib/realm/layout";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { IMPROVEMENT_IDS, IMPROVEMENTS } from "@/lib/realm/improvements";
import { HERO_RADIUS } from "./collision";
import { improvementPlacements } from "./improvement-spots";
import { anchorTarget, buildSpots, edgeDistance, lockSpot, makeNearMemo, nearChanged, pickSpot, runeSpot, runeTarget, CHRONICLE_TARGET, PLANS_TARGET, RIDDLE_LABEL, RIDDLE_VERB, siteLabel, TOWER_TARGET, type InteractSpot } from "./interact";
import { interactVerb } from "./frame";
import { PUZZLE_TOWER } from "@/lib/realm/puzzle-tower";
import { RIDDLE_STONE_SPOTS } from "@/lib/realm/riddle-stones";
import { LOCK_SPOT } from "@/lib/realm/world-objects";
import { worldCanvas, type LockSpotView, type RuneSpotView } from "@/lib/realm/world-state";
import { RUNE_OBJECTS, RUNE_SPOT } from "@/lib/realm/rune-objects";
import { RUNE_LOOK_VERB, RUNE_VERB } from "@/lib/tasks/rune-copy";
import { runeSpotAt } from "@/test/rune-spots";
import { ANCHOR_SPOT, ANCHOR_SPOTS, ANCHORS } from "@/lib/realm/anchors";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { castlePlan } from "./castle-plan";
import { ARCH, ARCH_HALF_SPAN } from "./recess/course";
import { VILLAGE_POST } from "./travel";
import { TRAIL_SEARCH_VERB } from "@/lib/tasks/trail-copy";
import { CASTLE_TIER_IDS } from "@/test/world-clearance";

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
  const locks = worldCanvas({ locksOn: true, runesOn: false, open: ["chest:east-lane", "door:longwater"], fixed: [], decor: [], tower: [] }).locks;
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

describe("the Puzzle Tower", () => {
  const door = PUZZLE_TOWER.door;
  const withTower = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, tower: door });
  const towerAt = () => withTower.findIndex((s) => s.target.kind === "tower");

  it("adds exactly one spot, at its door, with its own words", () => {
    expect(withTower.filter((s) => s.target.kind === "tower")).toHaveLength(1);
    expect(withTower[towerAt()].target).toEqual(TOWER_TARGET);
    expect(TOWER_TARGET).toEqual({ kind: "tower", id: "puzzle-tower", label: "the Puzzle Tower", verb: "Climb" });
    expect(withTower[towerAt()]).toMatchObject({ x: door.x, z: door.z, hw: 0.7, hd: 0.9, round: false, reach: 1.4, bias: 0.4 });
  });

  it("is what E acts on from the west, where the hero comes from", () => {
    expect(pickSpot(withTower, door.x - 1.2, door.z, -1)).toBe(towerAt());
    expect(pickSpot(withTower, door.x - 0.5, door.z + 0.6, -1)).toBe(towerAt());
  });

  it("lets go once the hero walks on", () => {
    expect(pickSpot(withTower, door.x - 6, door.z, towerAt())).not.toBe(towerAt());
  });

  it("has none when the locks are off (null) or nothing is given", () => {
    expect(buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, tower: null }).some((s) => s.target.kind === "tower")).toBe(false);
    expect(buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null }).some((s) => s.target.kind === "tower")).toBe(false);
    expect(spots.some((s) => s.target.kind === "tower")).toBe(false);
  });

  it("no spot's reach holds another spot's centre: with every lock, riddle stone, the board, the lectern and every plaque at level 3 (F19)", () => {
    const placements = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0);
    const plaques = placements.map((p) => ({ id: p.id, label: IMPROVEMENTS[p.id].label, ...p.plaque }));
    const locks = worldCanvas({ locksOn: true, runesOn: false, open: [], fixed: [], decor: [], tower: [] }).locks;
    const set = buildSpots({ props: [], sitePlan: 1.5, landmarks: [], castle: null, locks, stones: RIDDLE_STONE_SPOTS, plans: KEEP_YARD.plansBoard, chronicle: KEEP_YARD.lectern, plaques, tower: door });
    expect(set).toHaveLength(locks.length + RIDDLE_STONE_SPOTS.length + 2 + plaques.length + 1);
    const held: string[] = [];
    for (const a of set) {
      for (const b of set) {
        if (a !== b && edgeDistance(a, b.x, b.z) <= a.reach) held.push(`${a.target.kind} ${a.target.id} holds ${b.target.kind} ${b.target.id}`);
      }
    }
    expect(held).toEqual([]);
  });
});

describe("a visiting grown-up's words at the locks and the Tower (smoke bug 3)", () => {
  const locks = worldCanvas({ locksOn: true, runesOn: false, open: ["chest:east-lane", "door:longwater"], fixed: [], decor: [], tower: [] }).locks;
  const prompts = (viewer?: "child" | "parent") =>
    buildSpots({ props: [], sitePlan: 1.5, landmarks: [], castle: null, locks, tower: PUZZLE_TOWER.door, viewer })
      .filter((s) => s.target.kind === "lock" || s.target.kind === "tower")
      .map((s) => interactVerb(s.target));

  it("asks a grown-up to look, never to open or climb, at every chest, vault door and the Tower, open or shut", () => {
    const said = prompts("parent");
    expect(said.length).toBe(locks.length + 1);
    for (const p of said) expect(p).toMatch(/^Look at (the old chest|the vault door|the Puzzle Tower)$/);
    expect(said).toContain("Look at the Puzzle Tower");
  });

  it("keeps the hero's own verbs, and a viewer left out is the hero", () => {
    expect(prompts("child")).toEqual(prompts());
    expect(prompts("child")).toContain("Open the old chest");
    expect(prompts("child")).toContain("Climb the Puzzle Tower");
  });
});

describe("announcing what E will act on", () => {
  const shut = { kind: "lock" as const, id: "chest:library", label: "the old chest", verb: "Open" };

  it("announces the first target, then nothing while the same one stays in reach", () => {
    const memo = makeNearMemo();
    expect(nearChanged(memo, 2, shut)).toBe(true);
    expect(nearChanged(memo, 2, shut)).toBe(false);
    expect(nearChanged(memo, 2, { ...shut })).toBe(false);
  });

  it("announces a new index, and nothing in reach", () => {
    const memo = makeNearMemo();
    nearChanged(memo, 2, shut);
    expect(nearChanged(memo, -1, null)).toBe(true);
    expect(nearChanged(memo, -1, null)).toBe(false);
    expect(nearChanged(memo, 3, shut)).toBe(true);
  });

  it("announces the same index once its words change: a chest solved under the hero's nose", () => {
    const memo = makeNearMemo();
    nearChanged(memo, 2, shut);
    expect(nearChanged(memo, 2, { ...shut, verb: "Look in" })).toBe(true);
    expect(memo.target?.verb).toBe("Look in");
    expect(nearChanged(memo, 2, { ...shut, verb: "Look in", label: "the vault door" })).toBe(true);
  });
});

/* ------------------------------------------------------------------ the trail's stakes (H9) */

/**
 * The whole village's spots, as the scene builds them, plus the stakes: every building built or
 * bare, the castle gate at the given tier, the hitching post and the Ring's arch (riding and recess
 * can be on), every lock, riddle stone, the plans board, the lectern, every plaque at level 3 and
 * the Tower's door.
 */
function villageWithStakes(castleType: (typeof CASTLE_TIER_IDS)[number], built: boolean, anchors: typeof ANCHOR_SPOTS | null = ANCHOR_SPOTS, runes?: readonly RuneSpotView[]): InteractSpot[] {
  const village = buildWorldLayout({
    castleType,
    buildings: BUILDINGS.map((b) => ({ id: b.id, done: built ? b.deedsToBuild : 0, total: b.deedsToBuild, complete: built })),
  });
  const g = castlePlan(castleType).gate;
  const placements = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0);
  return buildSpots({
    props: village.props,
    sitePlan: 1.5,
    landmarks: [],
    castle: { x: CASTLE_POSITION.x + g.x, z: CASTLE_POSITION.z + g.z, hw: g.hw, hd: g.hd, label: "your castle", verb: "Go into" },
    posts: [{ id: "village", ...VILLAGE_POST }],
    arch: { x: ARCH.x, z: ARCH.z, halfSpan: ARCH_HALF_SPAN },
    stones: RIDDLE_STONE_SPOTS,
    plans: KEEP_YARD.plansBoard,
    chronicle: KEEP_YARD.lectern,
    plaques: placements.map((p) => ({ id: p.id, label: IMPROVEMENTS[p.id].label, ...p.plaque })),
    locks: worldCanvas({ locksOn: true, runesOn: false, open: [], fixed: [], decor: [], tower: [] }).locks,
    tower: PUZZLE_TOWER.door,
    anchors: anchors ?? undefined,
    runes,
  });
}

describe("the trail's stakes", () => {
  const withStakes = villageWithStakes("castle", true);
  const stakeAt = (id: string) => withStakes.findIndex((s) => s.target.kind === "anchor" && s.target.id === id);

  it("adds fourteen round spots, one per anchor, each searched with E: \"Search the mill\"", () => {
    const stakes = withStakes.filter((s) => s.target.kind === "anchor");
    expect(stakes).toHaveLength(14);
    expect(TRAIL_SEARCH_VERB).toBe("Search");
    for (const a of ANCHOR_SPOTS) {
      const s = withStakes[stakeAt(a.id)];
      expect(s, a.id).toMatchObject({ x: a.x, z: a.z, round: true, hw: ANCHOR_SPOT.radius, hd: ANCHOR_SPOT.radius, reach: ANCHOR_SPOT.reach, bias: 0.4, ring: ANCHOR_SPOT.radius + 0.6 });
      expect(s.target).toEqual(anchorTarget(a));
    }
    expect(anchorTarget(ANCHOR_SPOTS.find((a) => a.id === "landmark:mill")!)).toEqual({ kind: "anchor", id: "landmark:mill", label: "the mill", verb: "Search" });
    expect(interactVerb(withStakes[stakeAt("landmark:mill")].target)).toBe("Search the mill");
  });

  it("labels every stake the same way: only the place's own name differs, never anything about the clue", () => {
    for (const s of withStakes.filter((t) => t.target.kind === "anchor")) {
      expect(Object.keys(s.target).sort()).toEqual(["id", "kind", "label", "verb"]);
      expect(s.target.verb).toBe(TRAIL_SEARCH_VERB);
      expect(s.target.label).toBe(ANCHORS[s.target.id as keyof typeof ANCHORS].label);
      expect({ ...s, target: null, x: 0, z: 0 }).toEqual({ ...withStakes[stakeAt("landmark:well")], target: null, x: 0, z: 0 });
    }
  });

  it("is what E acts on when the hero walks up to it, from every side, in a village built or not", () => {
    // A step from the stake's edge on every side. (Two stakes stand near a plan's level-3 plaque, the
    // well's and the garden's: from their south, past 0.8 from the stake's edge, the plaque is nearer.)
    const d = ANCHOR_SPOT.radius + 0.6;
    const unbuilt = villageWithStakes("campsite", false);
    for (const a of ANCHOR_SPOTS) {
      for (const [dx, dz] of [[0, d], [d, 0], [0, -d], [-d, 0]]) {
        expect(withStakes[pickSpot(withStakes, a.x + dx, a.z + dz, -1)]?.target.id, `${a.id} from ${dx},${dz}`).toBe(a.id);
        expect(unbuilt[pickSpot(unbuilt, a.x + dx, a.z + dz, -1)]?.target.id, `${a.id} from ${dx},${dz}, unbuilt`).toBe(a.id);
      }
      expect(withStakes[pickSpot(withStakes, a.x, a.z, -1)]?.target.id, `${a.id} on it`).toBe(a.id);
    }
  });

  it("lets go once the hero walks on", () => {
    for (const a of ANCHOR_SPOTS) expect(pickSpot(withStakes, a.x + 6, a.z + 6, stakeAt(a.id)), a.id).not.toBe(stakeAt(a.id));
  });

  it("has none when anchors is absent: no walk, no stakes", () => {
    expect(villageWithStakes("castle", true, null).some((s) => s.target.kind === "anchor")).toBe(false);
    expect(spots.some((s) => s.target.kind === "anchor")).toBe(false);
  });

  it("no anchor holds another spot, and no spot holds an anchor: the whole village, built and bare, at every castle tier (F19, F-4)", () => {
    const held: string[] = [];
    const kinds = new Set<string>();
    const name = (s: InteractSpot) => `${s.target.kind} ${s.target.id}`;
    for (const castleType of CASTLE_TIER_IDS) {
      for (const built of [true, false]) {
        const set = villageWithStakes(castleType, built);
        for (const a of set) {
          kinds.add(a.target.kind);
          for (const b of set) {
            if (a === b || (a.target.kind !== "anchor" && b.target.kind !== "anchor")) continue;
            if (edgeDistance(a, b.x, b.z) <= a.reach) held.push(`${name(a)} holds ${name(b)} (${castleType}, ${built ? "built" : "bare"})`);
          }
        }
      }
    }
    expect([...new Set(held)]).toEqual([]);
    expect([...kinds].sort()).toEqual(["anchor", "arch", "castle", "chronicle", "lock", "plans", "plaque", "post", "riddle", "site", "tower", "villager"]);
  });

  describe("the castle gate's stake, in front of the gate (H1's RH-b): the castle keeps its own E at the door", () => {
    it("the stake is what E acts on as the hero comes up the road, from the south, east and west, at every tier", () => {
      const gate = ANCHORS["landmark:castle-gate"];
      for (const castleType of CASTLE_TIER_IDS) {
        const set = villageWithStakes(castleType, true);
        for (const [x, z] of [[gate.x, gate.z], [gate.x, gate.z + 1.5], [gate.x + 1.5, gate.z], [gate.x - 1.5, gate.z]]) {
          expect(set[pickSpot(set, x, z, -1)]?.target.id, `${castleType} at ${x},${z}`).toBe("landmark:castle-gate");
        }
      }
    });

    it("at the castle door (z ≤ -10.5, across the door) E still goes into the castle, never searches", () => {
      for (const castleType of CASTLE_TIER_IDS) {
        const set = villageWithStakes(castleType, true);
        const door = [-1.5, -0.75, 0].flatMap((x) => [-10.5, -11, -11.5].map((z) => [x, z])).concat([[0.75, -11.5], [1.5, -11.5]]);
        for (const [x, z] of door) expect(set[pickSpot(set, x, z, -1)]?.target.kind, `${castleType} at ${x},${z}`).toBe("castle");
      }
    });

    it("walking north up the road: the stake's prompt first, then the castle's at the door, and nothing flickers", () => {
      const set = villageWithStakes("castle", true);
      const seen: string[] = [];
      let i = -1;
      for (let z = -5; z >= -11.9; z -= 0.1) {
        i = pickSpot(set, 0.8, z, i);
        const k = i < 0 ? "none" : set[i].target.kind;
        if (seen[seen.length - 1] !== k) seen.push(k);
      }
      expect(seen).toEqual(["none", "anchor", "castle"]);
    });
  });
});

describe("the rune objects", () => {
  const runes = worldCanvas({ locksOn: true, runesOn: true, open: [], fixed: ["rune:west-wagon"], decor: [], tower: [] }).runes;
  const withRunes = villageWithStakes("castle", true, null, runes);
  const at = (id: string) => withRunes.findIndex((s) => s.target.kind === "rune" && s.target.id === id);

  it("adds fifteen round spots with runes on, and none when runes is absent", () => {
    expect(runes).toHaveLength(15);
    const spotsOf = withRunes.filter((s) => s.target.kind === "rune");
    expect(spotsOf).toHaveLength(15);
    for (const r of runes) {
      expect(withRunes[at(r.id)], r.id).toMatchObject({ x: r.x, z: r.z, round: true, hw: RUNE_SPOT.radius, hd: RUNE_SPOT.radius, reach: RUNE_SPOT.reach, bias: 0.4, ring: RUNE_SPOT.radius + 0.6 });
      expect(withRunes[at(r.id)]).toEqual(runeSpot(r));
    }
    expect(villageWithStakes("castle", true, null).some((s) => s.target.kind === "rune")).toBe(false);
    expect(villageWithStakes("castle", true, null, []).some((s) => s.target.kind === "rune")).toBe(false);
    expect(spots.some((s) => s.target.kind === "rune")).toBe(false);
  });

  it("says Cast a rune at a broken object, Look at a fixed one by its fixed name, and Look at to a grown-up", () => {
    const target = (id: string, viewer?: "child" | "parent") => runeTarget(runes.find((r) => r.id === id)!, viewer);
    expect(target("rune:west-wagon".replace("west-wagon", "east-barrow"))).toEqual({ kind: "rune", id: "rune:east-barrow", label: "the broken barrow", verb: "Cast a rune at" });
    expect(target("rune:west-wagon")).toEqual({ kind: "rune", id: "rune:west-wagon", label: "the wagon", verb: "Look at" });
    expect(target("rune:east-barrow", "parent").verb).toBe("Look at");
    expect(target("rune:west-wagon", "parent").verb).toBe("Look at");
    expect([RUNE_VERB, RUNE_LOOK_VERB]).toEqual(["Cast a rune at", "Look at"]);
    expect(interactVerb(target("rune:east-barrow"))).toBe("Cast a rune at the broken barrow");
    expect(withRunes[at("rune:east-barrow")].target).toEqual(target("rune:east-barrow"));
  });

  it("gives a visiting grown-up Look at everywhere through buildSpots", () => {
    const visited = buildSpots({ props: [], sitePlan: 1.5, landmarks: [], castle: null, runes, viewer: "parent" });
    expect(visited.filter((s) => s.target.kind === "rune").every((s) => s.target.verb === "Look at")).toBe(true);
  });

  it("every target is of the rune kind, one per catalog object", () => {
    expect(withRunes.filter((s) => s.target.kind === "rune").map((s) => s.target.id).sort()).toEqual(RUNE_OBJECTS.map((o) => o.id).sort());
  });

  it("is what E acts on when the hero walks up to it, from every side, in a village built or not", () => {
    const d = RUNE_SPOT.radius + 0.6;
    const bare = villageWithStakes("campsite", false, null, runes);
    for (const r of runes) {
      for (const [dx, dz] of [[0, d], [d, 0], [0, -d], [-d, 0]]) {
        expect(withRunes[pickSpot(withRunes, r.x + dx, r.z + dz, -1)]?.target.id, `${r.id} from ${dx},${dz}`).toBe(r.id);
        expect(bare[pickSpot(bare, r.x + dx, r.z + dz, -1)]?.target.id, `${r.id} from ${dx},${dz}, bare`).toBe(r.id);
      }
    }
  });

  it("lets go once the hero walks on", () => {
    for (const r of runes) expect(pickSpot(withRunes, r.x + 6, r.z + 6, at(r.id)), r.id).not.toBe(at(r.id));
  });

  it("the test helper's spot is the real one, so the reach rules cannot drift", () => {
    for (const r of runes) expect(runeSpotAt(r), r.id).toEqual(runeSpot(r));
  });

  it("no rune spot holds another spot, and no spot holds a rune spot: the whole village, with the stakes up and down, built and bare, at every castle tier", () => {
    const held: string[] = [];
    const kinds = new Set<string>();
    const name = (s: InteractSpot) => `${s.target.kind} ${s.target.id}`;
    for (const castleType of CASTLE_TIER_IDS) {
      for (const built of [true, false]) {
        for (const anchors of [ANCHOR_SPOTS, null]) {
          const set = villageWithStakes(castleType, built, anchors, runes);
          for (const a of set) {
            kinds.add(a.target.kind);
            for (const b of set) {
              if (a === b || (a.target.kind !== "rune" && b.target.kind !== "rune")) continue;
              if (edgeDistance(a, b.x, b.z) <= a.reach) held.push(`${name(a)} holds ${name(b)} (${castleType}, ${built ? "built" : "bare"})`);
            }
          }
        }
      }
    }
    expect([...new Set(held)]).toEqual([]);
    expect([...kinds].sort()).toEqual(["anchor", "arch", "castle", "chronicle", "lock", "plans", "plaque", "post", "riddle", "rune", "site", "tower", "villager"]);
  });
});
