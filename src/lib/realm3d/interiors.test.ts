import { describe, expect, it } from "vitest";
import { supportHeight, HERO_RADIUS, type Collider } from "./collision";
import { villagerById } from "@/lib/realm/villagers";
import { fixtureLine, roomPlan, ROOM_KINDS, GALLERY_Y, LOOKOUT_Y, type RoomPlan } from "./interiors";
import { hiddenWalls, leavingRoom, makeHidden, pickRoomSpot, roomBlocks, roomBuried, roomSlide, roomSpots, LEVEL_REACH } from "./room-rules";
import { edgeDistance } from "./interact";
import { ROOM_OF } from "./doorways";

/**
 * Where a child can get to in a room, walking and climbing by the same rules the scene uses:
 * a flood over a 0.125-unit grid, carrying the height of the child's feet, stepping only where
 * `roomBlocks` lets them and landing on whatever `supportHeight` says is underfoot.
 */
function reachable(plan: RoomPlan): Map<string, number> {
  const step = 0.125;
  const seen = new Map<string, number>();
  const key = (x: number, z: number, y: number) => `${Math.round(x / step)},${Math.round(z / step)},${Math.round(y * 4)}`;
  const q: [number, number, number][] = [[plan.spawn.x, plan.spawn.z, 0]];
  seen.set(key(plan.spawn.x, plan.spawn.z, 0), 0);
  const out = { x: 0, z: 0 };
  while (q.length) {
    const [x, z, y] = q.shift()!;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      roomSlide(out, x, z, x + dx, z + dz, plan.solids, HERO_RADIUS, y);
      if (out.x === x && out.z === z) continue;
      const ny = supportHeight(out.x, out.z, 0, plan.solids, HERO_RADIUS, y);
      const k = key(out.x, out.z, ny);
      if (seen.has(k)) continue;
      seen.set(k, ny);
      q.push([out.x, out.z, ny]);
    }
  }
  return seen;
}

function canReach(plan: RoomPlan, seen: Map<string, number>, x: number, z: number, r: number, reach: number, floor: number): boolean {
  for (const [k, y] of seen) {
    const [i, j] = k.split(",").map(Number);
    const px = i * 0.125;
    const pz = j * 0.125;
    if (Math.abs(y - floor) > LEVEL_REACH) continue;
    if (Math.hypot(px - x, pz - z) - r <= reach) return true;
  }
  return false;
}

describe.each(ROOM_KINDS.map((k) => [k]))("the %s", (kind) => {
  const plan = roomPlan(kind);

  it("is the same room every time it is built", () => {
    expect(roomPlan(kind)).toEqual(plan);
  });

  it("has a name, walls round it and a door in the south wall", () => {
    expect(plan.name).toMatch(/^(the|your) /);
    expect(plan.where).toBe(`Inside ${plan.name}`);
    expect(plan.door.x).toBe(0);
    expect(plan.parts.length).toBeGreaterThan(40);
    // Nothing is drawn far outside the room: a part out in the dark is a bug, not decoration.
    for (const p of plan.parts) {
      expect(Math.abs(p.x), `${p.shape} at ${p.x}`).toBeLessThan(plan.W / 2 + 1.2);
      expect(Math.abs(p.z), `${p.shape} at ${p.z}`).toBeLessThan(plan.D / 2 + 1.2);
      expect(p.y).toBeGreaterThan(-0.5);
      expect(p.y).toBeLessThan(plan.H + 1.5);
    }
    for (const a of plan.anims) expect(plan.parts.some((p) => p.anim === a.id), a.id).toBe(true);
    for (const p of plan.parts) if (p.anim) expect(plan.anims.some((a) => a.id === p.anim), p.anim).toBe(true);
  });

  it("puts the child just inside the door, facing in, clear of everything", () => {
    expect(plan.spawn.face).toBeCloseTo(Math.PI);
    expect(plan.spawn.z).toBeGreaterThan(plan.D / 2 - 2);
    expect(roomBuried(plan.solids, plan.spawn.x, plan.spawn.z, 0)).toBe(false);
  });

  it("keeps the child in: walking any way from the middle for ever ends inside the walls", () => {
    const out = { x: 0, z: 0 };
    for (let a = 0; a < 16; a++) {
      let x = plan.spawn.x;
      let z = plan.spawn.z;
      const dx = Math.sin((a / 16) * Math.PI * 2) * 0.2;
      const dz = Math.cos((a / 16) * Math.PI * 2) * 0.2;
      for (let i = 0; i < 400; i++) {
        roomSlide(out, x, z, x + dx, z + dz, plan.solids, HERO_RADIUS, 0);
        x = out.x;
        z = out.z;
      }
      expect(Math.abs(x)).toBeLessThan(plan.W / 2);
      expect(Math.abs(z)).toBeLessThan(plan.D / 2);
    }
  });

  it("lets the child walk from the door to the keeper, to the thing to use, and back to the door", () => {
    const seen = reachable(plan);
    if (plan.keeper) {
      expect(roomBuried(plan.solids, plan.keeper.x, plan.keeper.z, 0), "keeper stands in something").toBe(false);
      expect(canReach(plan, seen, plan.keeper.x, plan.keeper.z, 0.45, 1.8, 0), "keeper out of reach").toBe(true);
    }
    const f = plan.fixture;
    expect(canReach(plan, seen, f.x, f.z, f.r, 1.5, f.floor), `${f.id} out of reach`).toBe(true);
    // ...and back out: some reachable spot is pressing on the doorway.
    let out = false;
    for (const [k, y] of seen) {
      const [i, j] = k.split(",").map(Number);
      if (leavingRoom(plan, i * 0.125, j * 0.125, 1, y)) out = true;
    }
    expect(out).toBe(true);
  });

  it("offers three things to E: the keeper, the thing to use and the door out", () => {
    const keeper = plan.keeper ? villagerById(plan.keeper.villager) : null;
    if (plan.keeper) expect(keeper, "the keeper is a real villager").not.toBeNull();
    const rs = roomSpots(plan, keeper?.name ?? null);
    expect(rs.spots.map((s) => s.target.kind)).toEqual(plan.keeper ? ["villager", "fixture", "door"] : ["fixture", "door"]);
    expect(rs.spots.find((s) => s.target.kind === "door")!.target).toMatchObject({ verb: "Go", label: "outside" });
    const f = rs.spots.find((s) => s.target.kind === "fixture")!;
    expect(f.target.verb).toBeTruthy();
    // Standing at the spawn, the way out is what E does.
    const i = pickRoomSpot(rs, plan.spawn.x, plan.spawn.z + 0.6, 0, -1);
    expect(rs.spots[i]?.target.kind).toBe("door");
  });

  it("says something different each time the thing is used, with the child's name in it", () => {
    const lines = new Set([0, 1, 2].map((n) => fixtureLine(plan, n, "Emma")));
    expect(lines.size).toBe(Math.min(3, plan.fixture.lines.length));
    for (const l of lines) expect(l).not.toMatch(/\{hero\}/);
    expect(fixtureLine(plan, 3, "Noah")).toBe(fixtureLine(plan, 0, "Noah"));
  });
});

describe("which room is whose", () => {
  it("every room but the castle is kept by that building's own villager", () => {
    for (const [building, kind] of Object.entries(ROOM_OF)) {
      const plan = roomPlan(kind);
      expect(villagerById(plan.keeper!.villager)!.buildingId).toBe(building);
    }
    expect(roomPlan("castle").keeper).toBeNull();
  });

  it("the castle's banners are the child's colours", () => {
    const plan = roomPlan("castle", { field: "#123456", charge: "#abcdef" });
    expect(plan.parts.filter((p) => p.color === "#123456").length).toBeGreaterThan(10);
    expect(plan.parts.filter((p) => p.color === "#abcdef").length).toBeGreaterThan(5);
  });
});

describe("up and down", () => {
  it("the watchtower's stair climbs to the lookout, and the telescope is only reachable up there", () => {
    const plan = roomPlan("watchtower");
    const seen = reachable(plan);
    expect([...seen.values()].some((y) => Math.abs(y - LOOKOUT_Y) < 0.01)).toBe(true);
    const rs = roomSpots(plan, "Mason Gerd");
    const scope = rs.spots.findIndex((s) => s.target.id === "telescope");
    // Under the lookout, right below the telescope: not in reach.
    expect(pickRoomSpot(rs, plan.fixture.x, plan.fixture.z + 0.6, 0, -1)).not.toBe(scope);
    expect(pickRoomSpot(rs, plan.fixture.x, plan.fixture.z + 0.9, LOOKOUT_Y, -1)).toBe(scope);
  });

  it("the castle's stair climbs to a gallery a child can walk under", () => {
    const plan = roomPlan("castle");
    const seen = reachable(plan);
    expect([...seen.values()].some((y) => Math.abs(y - GALLERY_Y) < 0.01)).toBe(true);
    const under = plan.solids.find((c) => c.base > 3)!;
    expect(roomBlocks(under, under.x, under.z, HERO_RADIUS, 0)).toBe(false);
    expect(roomBlocks(under, under.x, under.z, HERO_RADIUS, 2.5)).toBe(true); // jumping into it from below
  });

  it("the throne stands on its dais and is reached from the dais", () => {
    const plan = roomPlan("castle");
    expect(plan.fixture.floor).toBeGreaterThan(0);
    const rs = roomSpots(plan, null);
    const throne = rs.spots.findIndex((s) => s.target.id === "throne");
    expect(edgeDistance(rs.spots[throne], 0, plan.fixture.z + 2)).toBeLessThan(1.5);
    expect(pickRoomSpot(rs, 0, plan.fixture.z + 2, plan.fixture.floor, -1)).toBe(throne);
  });
});

describe("rules of a room", () => {
  const wall: Collider = { x: 0, z: 0, hw: 1, hd: 1, round: false, base: 0, top: 3 };
  const loft: Collider = { x: 0, z: 0, hw: 1, hd: 1, round: false, base: 3.7, top: 4 };

  it("a wall stops you; a loft over your head does not; you can stand on either", () => {
    expect(roomBlocks(wall, 0, 0, 0.5, 0)).toBe(true);
    expect(roomBlocks(loft, 0, 0, 0.5, 0)).toBe(false);
    expect(roomBlocks(loft, 0, 0, 0.5, 3.8)).toBe(false);
    expect(roomBlocks(wall, 0, 0, 0.5, 3)).toBe(false);
  });

  it("walks out only through the doorway, and only walking into it", () => {
    const plan = roomPlan("chapel");
    const z = plan.D / 2 - HERO_RADIUS;
    expect(leavingRoom(plan, 0, z, 1, 0)).toBe(true);
    expect(leavingRoom(plan, 0, z, 0, 0)).toBe(false);
    expect(leavingRoom(plan, 0, z, -1, 0)).toBe(false);
    expect(leavingRoom(plan, 3, z, 1, 0)).toBe(false);
    expect(leavingRoom(plan, 0, z - 2, 1, 0)).toBe(false);
  });

  it("cuts away exactly the walls between the camera and the room", () => {
    const plan = { W: 10, D: 10 };
    const h = makeHidden();
    expect(hiddenWalls(h, plan, 0, 0)).toBe(false);
    expect(h).toEqual({ n: false, s: false, e: false, w: false });
    expect(hiddenWalls(h, plan, 0, 14)).toBe(true);
    expect(h).toEqual({ n: false, s: true, e: false, w: false });
    hiddenWalls(h, plan, 9, -9);
    expect(h).toEqual({ n: true, s: false, e: true, w: false });
    expect(hiddenWalls(h, plan, 9, -9)).toBe(false);
  });
});
