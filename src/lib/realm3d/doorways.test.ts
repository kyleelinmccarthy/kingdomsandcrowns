import { describe, expect, it } from "vitest";
import { buildWorldLayout, type SiteProgress } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { buildColliders, overlaps, slideMove, HERO_RADIUS, type Collider } from "./collision";
import { castlePlan, GATE_FRONT } from "./castle-plan";
import { buried, buildDoors, doorAhead, exitSpot, freeSpot, hasRoom, roomFor, ROOM_OF, DOOR_DWELL } from "./doorways";
import { buildSpots } from "./interact";

const SITE_PLAN = 1.5;
/** Doors with no room in front of them in the authored village. See the walk-up test. */
const TUCKED = new Set(["market", "library"]);
const OPTS = { sitePlan: SITE_PLAN, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };

function village(complete: boolean) {
  const buildings: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: complete ? 5 : 2, total: 5, complete }));
  return buildWorldLayout({ castleType: "castle", buildings, objectiveIds: [] });
}

function castleGate() {
  const plan = castlePlan("castle");
  const c = village(true).props.find((p) => p.kind === "castle")!;
  return { x: c.position.x + plan.gate.x, face: c.position.z + GATE_FRONT, hw: plan.gate.hw - 0.3 };
}

function solidsFor(complete: boolean, castle = true): Collider[] {
  const layout = village(complete);
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), [], OPTS);
  if (castle) {
    const c = layout.props.find((p) => p.kind === "castle")!;
    const plan = castlePlan("castle");
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
      // Walk north from just in front of the door until the wall stops us, on the first clear
      // line across the doorway.
      const z0 = d.face + HERO_RADIUS + 0.4;
      let x = d.x;
      for (let k = 0; k <= 16 && !free(x, z0); k++) x = d.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;
      if (TUCKED.has(d.site)) {
        // The village is packed: these two front doors open onto a gap narrower than the hero,
        // behind a neighbour (the market behind the bridge house, the library behind the
        // chapel's bell tower). They are gone into with E from anywhere round the building.
        expect(free(x, z0), `${d.site} is no longer tucked away — take it off the list`).toBe(false);
        continue;
      }
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
