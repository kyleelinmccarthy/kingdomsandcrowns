import { describe, expect, it } from "vitest";
import { buildWorldLayout, SPAWN, type SiteProgress } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { buildColliders, clearFraction, overlaps, slideMove, HERO_RADIUS, type Collider } from "./collision";
import { DEFAULT_DIST, DEFAULT_PITCH } from "./controls";
import { heightAt } from "./heightfield";
import { castlePlan, GATE_FRONT } from "./castle-plan";
import { buried, buildDoors, doorAhead, exitSpot, freeSpot, hasRoom, roomFor, ROOM_OF, DOOR_DWELL } from "./doorways";
import { buildSpots } from "./interact";

const SITE_PLAN = 1.5;
const OPTS = { sitePlan: SITE_PLAN, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };

function village(complete: boolean, castleType = "castle") {
  const buildings: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: complete ? 5 : 2, total: 5, complete }));
  return buildWorldLayout({ castleType, buildings, objectiveIds: [] });
}

function castleGate(castleType = "castle") {
  const plan = castlePlan(castleType);
  const c = village(true, castleType).props.find((p) => p.kind === "castle")!;
  return { x: c.position.x + plan.gate.x, face: c.position.z + GATE_FRONT, hw: plan.gate.hw - 0.3 };
}

/** The island's solids as the scene builds them: the village, its scenery, and the castle's own plan. */
function solidsFor(complete: boolean, castle = true, castleType = "castle", scenery = false): Collider[] {
  const layout = village(complete, castleType);
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), scenery ? layout.scenery : [], OPTS);
  if (castle) {
    const c = layout.props.find((p) => p.kind === "castle")!;
    const plan = castlePlan(castleType);
    for (const b of plan.solids) built.solids.push({ ...b, x: c.position.x + b.x, z: c.position.z + b.z, base: b.base, top: b.top });
  }
  return built.solids;
}

describe("which buildings have an inside", () => {
  it("every building but the well", () => {
    for (const b of BUILDINGS) expect(hasRoom(b.id)).toBe(b.id !== "well");
    expect(Object.keys(ROOM_OF)).toHaveLength(7);
  });

  it("a site must be RAISED to be gone into; until then E is still its villager's", () => {
    const half = [{ id: "chapel", complete: false }];
    const done = [{ id: "chapel", complete: true }];
    expect(roomFor({ kind: "site", id: "chapel" }, half, false)).toBeNull();
    expect(roomFor({ kind: "site", id: "chapel" }, done, false)).toEqual({ room: "chapel", site: "chapel" });
    expect(roomFor({ kind: "site", id: "well" }, [{ id: "well", complete: true }], false)).toBeNull();
    expect(roomFor({ kind: "villager", id: "wren" }, done, true)).toBeNull();
    expect(roomFor({ kind: "landmark", id: "summit-6" }, done, true)).toBeNull();
  });

  it("the castle only once it is the child's", () => {
    expect(roomFor({ kind: "castle", id: "castle" }, [], false)).toBeNull();
    expect(roomFor({ kind: "castle", id: "castle" }, [], true)).toEqual({ room: "castle", site: "castle" });
  });

  it("the E prompt says 'Go into' at a raised building, and nothing new at a site going up", () => {
    const up = buildSpots({ props: village(true).props, sitePlan: SITE_PLAN, landmarks: [], castle: null });
    const down = buildSpots({ props: village(false).props, sitePlan: SITE_PLAN, landmarks: [], castle: null });
    expect(up.find((s) => s.target.id === "chapel")!.target.verb).toBe("Go into");
    expect(up.find((s) => s.target.id === "well")!.target.verb).toBeUndefined();
    expect(down.find((s) => s.target.id === "chapel")!.target.verb).toBeUndefined();
  });
});

describe("the doors on the island", () => {
  it("one per raised building with an inside, plus the castle gate — none on a site going up", () => {
    const doors = buildDoors({ props: village(true).props, sitePlan: SITE_PLAN, castle: castleGate() });
    expect(doors.map((d) => d.site).sort()).toEqual(["bridge", "castle", "chapel", "garden", "library", "market", "mill", "watchtower"]);
    expect(buildDoors({ props: village(false).props, sitePlan: SITE_PLAN, castle: null })).toEqual([]);
  });

  it("every open door can be walked up to, and walking north into it ends pressed against it", () => {
    const solids = solidsFor(true);
    const doors = buildDoors({ props: village(true).props, sitePlan: SITE_PLAN, castle: castleGate() });
    const out = { x: 0, z: 0 };
    const free = (x: number, z: number) => !solids.some((c) => overlaps(c, x, z, HERO_RADIUS));
    for (const d of doors) {
      // Walk north from just in front of the middle of the door until the wall stops us.
      const z0 = d.face + HERO_RADIUS + 0.4;
      let x = d.x;
      expect(free(x, z0), `${d.site} has no way up to its door`).toBe(true);
      let z = z0;
      for (let i = 0; i < 200; i++) {
        slideMove(out, x, z, x, z - 0.05, solids);
        if (out.z === z) break;
        x = out.x;
        z = out.z;
      }
      expect(z - HERO_RADIUS - d.face, d.site).toBeLessThan(0.06);
      expect(doorAhead(doors, x, z, 0, -1), d.site).toBe(doors.indexOf(d));
    }
  });

  it("only a walk INTO the door counts: not standing, not sliding along the wall, not walking away", () => {
    const doors = buildDoors({ props: village(true).props, sitePlan: SITE_PLAN, castle: null });
    const d = doors.find((x) => x.site === "chapel")!;
    const z = d.face + HERO_RADIUS;
    expect(doorAhead(doors, d.x, z, 0, -1)).toBeGreaterThanOrEqual(0);
    expect(doorAhead(doors, d.x, z, 0, 0)).toBe(-1);
    expect(doorAhead(doors, d.x, z, 1, 0)).toBe(-1); // sliding along the front wall
    expect(doorAhead(doors, d.x, z, 0.8, -0.6)).toBe(-1); // mostly sideways
    expect(doorAhead(doors, d.x, z, 0, 1)).toBe(-1); // walking away
    expect(doorAhead(doors, d.x + 2.5, z, 0, -1)).toBe(-1); // wall beside the door
    expect(doorAhead(doors, d.x, z + 1.5, 0, -1)).toBe(-1); // still a step away
    expect(DOOR_DWELL).toBeGreaterThan(0);
  });
});

/**
 * Every hero-centre on a grid over the village that a child can walk to from the spawn point:
 * a flood fill over the ground where the hero's whole body touches nothing solid. A gap
 * narrower than the hero is closed here, exactly as it is closed to the solver.
 */
const GRID = 0.1;
const HALF = 24;
function reachable(solids: readonly Collider[]): (x: number, z: number) => boolean {
  const n = Math.round((HALF * 2) / GRID) + 1;
  const at = (v: number) => Math.round((v + HALF) / GRID);
  const seen = new Uint8Array(n * n); // 0 unknown, 1 blocked, 2 reached
  const blockedAt = (i: number, j: number, list: readonly Collider[]) => {
    const x = i * GRID - HALF;
    const z = j * GRID - HALF;
    return list.some((c) => overlaps(c, x, z, HERO_RADIUS));
  };
  // Only what stands on the grid; the grid's own edge is the fence.
  const all = solids.filter((c) => Math.abs(c.x) < HALF + c.hw + 1 && Math.abs(c.z) < HALF + c.hd + 1);
  const stack = [at(SPAWN.x) + at(SPAWN.z) * n];
  expect(blockedAt(at(SPAWN.x), at(SPAWN.z), all), "the spawn point is inside a wall").toBe(false);
  seen[stack[0]] = 2;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % n;
    const j = (k - i) / n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const kk = a + b * n;
      if (seen[kk]) continue;
      if (blockedAt(a, b, all)) {
        seen[kk] = 1;
        continue;
      }
      seen[kk] = 2;
      stack.push(kk);
    }
  }
  return (x, z) => seen[at(x) + at(z) * n] === 2;
}

/** How far straight out from its face every door keeps open ground: a child's run-up, with the villager in it. */
const APPROACH = 4;
/**
 * How far out the camera behind a child walking at a door must see them without swinging. Longer
 * than the run-up: a camera free to swing turns W with it, and while this plan was being drawn a
 * village oak six units out behind the bridge house's door swung a walk right round the house
 * (found by playing).
 */
const CAMERA_RUN = 6;

describe("every door can be walked through", () => {
  // The class of bug, not its two instances: the market's door once opened onto a 1.2-unit gap
  // behind the bridge house and the library's behind the chapel's bell tower. A lit door a child
  // walks at and bumps into nothing-they-can-see reads as a game that is broken.
  for (const tier of ["campsite", "castle", "citadel"]) {
    it(`from the spawn point, straight at the middle of each door, a lane the hero's width and ${APPROACH} long (${tier})`, () => {
      const solids = solidsFor(true, true, tier, true);
      const walk = reachable(solids);
      const doors = buildDoors({ props: village(true, tier).props, sitePlan: SITE_PLAN, castle: castleGate(tier) });
      expect(doors).toHaveLength(8);
      const shut: string[] = [];
      for (const d of doors) {
        // A lane of hero-centres at the door's own x IS a corridor 2 × HERO_RADIUS wide.
        for (let z = d.face + HERO_RADIUS + 0.05; z <= d.face + HERO_RADIUS + APPROACH; z += GRID) {
          if (!walk(d.x, z)) {
            shut.push(`${d.site} at ${d.x.toFixed(1)},${z.toFixed(1)}`);
            break;
          }
        }
      }
      expect(shut).toEqual([]);
    });
  }

  it(`walking straight at every door, the camera behind the child has a clear line for the last ${CAMERA_RUN} — it never has to swing round a roof or a tower`, () => {
    // The camera swings itself round anything between it and a walking child, and W turns with
    // it; a door with a tall neighbour close behind it turns the walk off the door just as the
    // child arrives. Found by playing: with the camera free, a walk at the market's door ended in
    // the castle's great hall.
    const layout = village(true, "citadel");
    const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), layout.scenery, OPTS);
    const c = layout.props.find((p) => p.kind === "castle")!;
    for (const b of castlePlan("citadel").occluders) built.occluders.push({ ...b, x: c.position.x + b.x, z: c.position.z + b.z });
    const doors = buildDoors({ props: layout.props, sitePlan: SITE_PLAN, castle: castleGate("citadel") });
    const EYE = 1.5; // spike-scene's CAM_EYE
    const back = DEFAULT_DIST * Math.cos(DEFAULT_PITCH);
    const up = DEFAULT_DIST * Math.sin(DEFAULT_PITCH);
    const blocked: string[] = [];
    for (const d of doors) {
      for (let z = d.face + HERO_RADIUS + 0.05; z <= d.face + HERO_RADIUS + CAMERA_RUN; z += 0.25) {
        if (clearFraction(d.x, heightAt(d.x, z) + EYE, z, 0, up, back, built.occluders) < 0.999) {
          blocked.push(`${d.site} at ${z.toFixed(1)}`);
          break;
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it("nobody stands in a wall: every villager is clear of every solid, and can be walked up to", () => {
    const solids = solidsFor(true, true, "citadel", true);
    const walk = reachable(solids);
    const layout = village(true, "citadel");
    const VILLAGER_R = 0.45; // the layout's villager footprint is 0.9 across
    for (const v of layout.villagers) {
      for (const c of solids) expect(overlaps(c, v.position.x, v.position.z, VILLAGER_R), `${v.id} stands in a wall`).toBe(false);
      // Straight in front of them (+z), where a child walks up to talk, is open ground.
      expect(walk(v.position.x, v.position.z + 1.2), `${v.id} cannot be walked up to`).toBe(true);
    }
  });
});

describe("coming back out", () => {
  const solids = solidsFor(true);
  const layout = village(true);
  const villagers = layout.villagers.map((v) => v.position);
  const doors = buildDoors({ props: layout.props, sitePlan: SITE_PLAN, castle: castleGate() });

  it("out of every door: in front of it, facing away, touching nothing solid and clear of its villager", () => {
    const out = { x: 0, z: 0, face: -1 };
    for (const d of doors) {
      exitSpot(out, d, solids, villagers);
      expect(out.face, d.site).toBe(0); // +z: away from a door that faces +z
      expect(out.z, d.site).toBeGreaterThan(d.face + HERO_RADIUS);
      expect(out.z - d.face, d.site).toBeLessThan(4);
      expect(Math.abs(out.x - d.x), d.site).toBeLessThan(2.6);
      for (const c of solids) expect(overlaps(c, out.x, out.z, HERO_RADIUS), `${d.site} in a wall`).toBe(false);
      for (const v of villagers) expect(Math.hypot(v.x - out.x, v.z - out.z), `${d.site} on a villager`).toBeGreaterThanOrEqual(1.2);
      // ...and the first step forward really goes forward, rather than into the door again.
      expect(doorAhead(doors, out.x, out.z, 0, 1)).toBe(-1);
      expect(doorAhead(doors, out.x, out.z, 0, -1)).toBe(-1);
    }
  });

  it("never inside a wall, even when something has grown across the step", () => {
    const d = doors.find((x) => x.site === "chapel")!;
    const blocker: Collider = { x: d.x, z: d.face + 2.5, hw: 3.5, hd: 1.5, round: false, base: 0, top: 3 };
    const out = exitSpot({ x: 0, z: 0, face: 0 }, d, [...solids, blocker], villagers);
    for (const c of [...solids, blocker]) expect(overlaps(c, out.x, out.z, HERO_RADIUS)).toBe(false);
  });
});

describe("never disappearing", () => {
  it("a hero standing where a building has just risen is found buried, and freed to open ground", () => {
    const solids = solidsFor(true);
    const chapel = village(true).props.find((p) => p.id === "chapel")!;
    const x = chapel.position.x;
    const z = chapel.position.z;
    expect(buried(solids, x, z, 0)).toBe(true);
    const out = freeSpot({ x: 0, z: 0 }, x, z, solids);
    expect(buried(solids, out.x, out.z, 0)).toBe(false);
    for (const c of solids) expect(overlaps(c, out.x, out.z, HERO_RADIUS)).toBe(false);
  });

  it("a hero pressed against a wall, or standing on the garden beds, is not buried", () => {
    const solids = solidsFor(true);
    const doors = buildDoors({ props: village(true).props, sitePlan: SITE_PLAN, castle: null });
    const d = doors.find((x) => x.site === "mill")!;
    expect(buried(solids, d.x, d.face + HERO_RADIUS, 0)).toBe(false);
    const garden = village(true).props.find((p) => p.id === "garden")!;
    expect(buried(solids, garden.position.x, garden.position.z, 1.0)).toBe(false);
  });

  it("every spot in and round the village frees to open ground", () => {
    const solids = solidsFor(true);
    const out = { x: 0, z: 0 };
    for (let x = -14; x <= 14; x += 1) {
      for (let z = -14; z <= 12; z += 1) {
        freeSpot(out, x, z, solids);
        for (const c of solids) expect(overlaps(c, out.x, out.z, HERO_RADIUS), `${x},${z}`).toBe(false);
      }
    }
  });
});
