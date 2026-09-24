/**
 * A MOUNT'S BODY — the muzzle stops at a wall, the mount shuffles when it turns beside one, and
 * the saddle keeps every guarantee it had (`ride-escape.test.ts`): nobody is left embedded,
 * nobody is frozen.
 */

import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { MOUNTS } from "@/lib/utils/avatar-catalog";
import { castlePlan } from "./castle-plan";
import { buildColliders, overlaps, slideMove, HERO_RADIUS, type Collider, type Pt } from "./collision";
import { turnToward } from "./controls";
import { doorAhead, freeSpot } from "./doorways";
import { clearPark, makeRideBus, rideSpeed, RIDE_RADIUS, type RideBus } from "./riding";
import { bodyFor, bodyReach, endsDepth, fitParked, mountBody, slideBody, turnBody, ENDS_SLACK, MOUNT_SCALE, type MountBody } from "./mount-body";

const OPTS = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };
const IDS = MOUNTS.map((m) => m.id);
const FASTEST = Math.max(...MOUNTS.map((m) => rideSpeed(m)));

function villageSolids(): Collider[] {
  const buildings = BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: true }));
  const layout = buildWorldLayout({ castleType: "castle", buildings, objectiveIds: [] });
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), layout.scenery, OPTS);
  const c = layout.props.find((p) => p.kind === "castle")!;
  for (const b of castlePlan("castle").solids) built.solids.push({ ...b, x: c.position.x + b.x, z: c.position.z + b.z });
  return built.solids;
}

/** The wilderness's trunks are 7.6 apart at the closest; this wood is 4.2, and jittered. */
function wood(): Collider[] {
  const out: Collider[] = [];
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      const jx = Math.sin(i * 12.9898 + j * 78.233) * 0.3;
      const jz = Math.cos(i * 39.425 + j * 11.135) * 0.3;
      out.push({ x: 400 + i * 4.2 + jx, z: 400 + j * 4.2 + jz, hw: 0.42, hd: 0.42, round: true, base: 0, top: 6 });
    }
  return out;
}

const pt = (): Pt => ({ x: 0, z: 0 });
/** A long wall, its south face at z = 0. */
const WALL: Collider = { x: 0, z: -3, hw: 12, hd: 3, round: false, base: 0, top: 3.1 };
/** A cottage, in the open. */
const HOUSE: Collider = { x: 0, z: 0, hw: 3, hd: 2.5, round: false, base: 0, top: 3.1 };

function saddleIn(solids: readonly Collider[], x: number, z: number, slack = 0.01): boolean {
  return solids.some((c) => overlaps(c, x, z, RIDE_RADIUS - slack));
}

/**
 * The mover, as `spike-scene.tsx` runs it riding: step along `a` with the whole body at the
 * facing it has, then turn toward `a` at the mover's rate through `turnBody`.
 */
function rideFrame(q: Pt & { yaw: number }, a: number, speed: number, dt: number, solids: readonly Collider[], body: MountBody, out: Pt): void {
  slideBody(out, q.x, q.z, q.x + Math.sin(a) * speed * dt, q.z + Math.cos(a) * speed * dt, q.yaw, solids, RIDE_RADIUS, body);
  q.x = out.x;
  q.z = out.z;
  q.yaw = turnBody(out, q.x, q.z, q.yaw, turnToward(q.yaw, a, 12, dt), solids, RIDE_RADIUS, body);
  q.x = out.x;
  q.z = out.z;
}

describe("the body", () => {
  it("is drawn and fitted at the same scale, longest for the wyrm and shortest for the boar", () => {
    expect(MOUNT_SCALE).toBeGreaterThan(1);
    const nose = (id: string) => mountBody(id).fore + mountBody(id).foreR;
    expect(nose("pony")).toBeCloseTo((1.29 + 0.36) * MOUNT_SCALE);
    expect(Math.max(...IDS.map(nose))).toBe(nose("wyrm"));
    expect(Math.min(...IDS.map(nose))).toBe(nose("boar"));
    expect(mountBody("nope")).toEqual(mountBody("pony"));
  });

  it("is the mover's only while fully in the saddle and steering", () => {
    const pony = MOUNTS.find((m) => m.id === "pony")!;
    const bus: RideBus = makeRideBus({ id: "pony", label: pony.label, color: "#8b5e3c", speed: pony.speed, tack: "#333" });
    expect(bodyFor(bus)).toBeNull();
    bus.phase = "up";
    expect(bodyFor(bus)).toBeNull();
    bus.phase = "on";
    expect(bodyFor(bus)).toEqual(mountBody("pony"));
    bus.travelling = true;
    expect(bodyFor(bus)).toBeNull();
    expect(bodyFor(null)).toBeNull();
  });

  it("reaches as far as its nose ahead, its rump behind, and the saddle to the side", () => {
    const b = mountBody("pony");
    expect(bodyReach(b, 0, 0, 1, RIDE_RADIUS)).toBeCloseTo(b.fore + b.foreR);
    expect(bodyReach(b, 0, 0, -1, RIDE_RADIUS)).toBeCloseTo(Math.max(RIDE_RADIUS, b.hind + b.hindR));
    expect(bodyReach(b, 0, 1, 0, RIDE_RADIUS)).toBe(RIDE_RADIUS);
    expect(bodyReach(null, 0, 0, 1, HERO_RADIUS)).toBe(HERO_RADIUS);
  });
});

describe("riding at a wall", () => {
  for (const id of IDS) {
    it(`${id}: ridden head-on, the muzzle stops at the wall rather than in it`, () => {
      const body = mountBody(id);
      const q = { x: 0, z: 8, yaw: Math.PI };
      const out = pt();
      for (let f = 0; f < 120; f++) rideFrame(q, Math.PI, FASTEST, 1 / 60, [WALL], body, out);
      expect(endsDepth([WALL], q.x, q.z, q.yaw, body)).toBeLessThanOrEqual(1e-9);
      // Stopped with its nose within a stride of the face — at the wall, not held off it.
      expect(q.z - (body.fore + body.foreR)).toBeLessThan(FASTEST / 60 + 1e-6);
    });
  }

  it("still slides along a wall ridden at an angle", () => {
    const body = mountBody("pony");
    const q = { x: 0, z: 3, yaw: -Math.PI * 0.75 };
    const out = pt();
    const a = -Math.PI * 0.75; // north-west, into the wall at an angle
    for (let f = 0; f < 60; f++) rideFrame(q, a, 14, 1 / 60, [WALL], body, out);
    expect(q.x).toBeLessThan(-4);
    expect(endsDepth([WALL], q.x, q.z, q.yaw, body)).toBeLessThanOrEqual(ENDS_SLACK);
  });

  it("with no body is exactly the walk's solver", () => {
    const a = slideBody(pt(), 0, 3, 0, -1, 0, [WALL], HERO_RADIUS, null);
    const b = slideMove(pt(), 0, 3, 0, -1, [WALL], HERO_RADIUS);
    expect(a).toEqual(b);
  });

  it("jumps over what the feet clear, as the saddle does", () => {
    const bed: Collider = { x: 0, z: 0, hw: 2, hd: 1, round: false, base: 0, top: 1 };
    const out = slideBody(pt(), 0, 3, 0, 2, Math.PI, [bed], RIDE_RADIUS, mountBody("pony"), 1.2);
    expect(out.z).toBe(2);
  });
});

describe("turning in place beside a wall", () => {
  for (const id of IDS) {
    for (const side of ["front", "flank", "rump"] as const) {
      it(`${id}, ${side} to the wall: two full spins, never embedded, and the spin is not refused`, () => {
        const body = mountBody(id);
        // Start touching the wall with that part: nose, flank or rump to its face.
        const yaw = side === "front" ? Math.PI : side === "flank" ? Math.PI / 2 : 0;
        const reach = bodyReach(body, yaw, 0, -1, RIDE_RADIUS);
        const q = { x: 0, z: reach + 0.001, yaw };
        const out = pt();
        let turned = 0;
        const dt = 1 / 60;
        for (let f = 0; f < 600 && turned < Math.PI * 4; f++) {
          // A right-drag spin: the camera goes round, and the rider turns to face where it looks.
          const want = q.yaw + 0.25;
          const next = turnBody(out, q.x, q.z, q.yaw, turnToward(q.yaw, want, 12, dt), [WALL], RIDE_RADIUS, body);
          turned += Math.abs(Math.atan2(Math.sin(next - q.yaw), Math.cos(next - q.yaw)));
          q.x = out.x;
          q.z = out.z;
          q.yaw = next;
          expect(saddleIn([WALL], q.x, q.z)).toBe(false);
          expect(endsDepth([WALL], q.x, q.z, q.yaw, body)).toBeLessThanOrEqual(ENDS_SLACK);
        }
        expect(turned).toBeGreaterThanOrEqual(Math.PI * 4);
        // It shuffled no further from the wall than its own length.
        expect(q.z).toBeLessThan(body.fore + body.foreR + 0.5);
      });
    }
  }

  it("turns round in a cottage's corner, too", () => {
    const body = mountBody("wyrm");
    const q = { x: 3 + RIDE_RADIUS + 0.01, z: 2.5 + RIDE_RADIUS + 0.01, yaw: 0 };
    const out = pt();
    let turned = 0;
    for (let f = 0; f < 600 && turned < Math.PI * 2; f++) {
      const next = turnBody(out, q.x, q.z, q.yaw, turnToward(q.yaw, q.yaw - 0.25, 12, 1 / 60), [HOUSE], RIDE_RADIUS, body);
      turned += Math.abs(Math.atan2(Math.sin(next - q.yaw), Math.cos(next - q.yaw)));
      q.x = out.x;
      q.z = out.z;
      q.yaw = next;
      expect(saddleIn([HOUSE], q.x, q.z)).toBe(false);
      expect(endsDepth([HOUSE], q.x, q.z, q.yaw, body)).toBeLessThanOrEqual(ENDS_SLACK);
    }
    expect(turned).toBeGreaterThanOrEqual(Math.PI * 2);
  });

  it("in a slot narrower than the animal is long, holds the turn back but never traps the rider", () => {
    const body = mountBody("pony");
    const half = RIDE_RADIUS + 0.4; // a lane 2.4 wide, running north-south
    const slot: Collider[] = [
      { x: -half - 2, z: 0, hw: 2, hd: 30, round: false, base: 0, top: 3 },
      { x: half + 2, z: 0, hw: 2, hd: 30, round: false, base: 0, top: 3 },
    ];
    const q = { x: 0, z: 0, yaw: 0 };
    const out = pt();
    // Asked to face across the lane: it cannot, and nothing goes into the walls trying.
    for (let f = 0; f < 60; f++) {
      q.yaw = turnBody(out, q.x, q.z, q.yaw, turnToward(q.yaw, Math.PI / 2, 12, 1 / 60), slot, RIDE_RADIUS, body);
      q.x = out.x;
      q.z = out.z;
      expect(saddleIn(slot, q.x, q.z)).toBe(false);
      expect(endsDepth(slot, q.x, q.z, q.yaw, body)).toBeLessThanOrEqual(ENDS_SLACK);
    }
    expect(Math.abs(q.yaw)).toBeLessThan(Math.PI / 2);
    // ...and it still rides out of either end.
    const fwd = { ...q };
    for (let f = 0; f < 30; f++) rideFrame(fwd, 0, 14, 1 / 60, slot, body, out);
    expect(fwd.z).toBeGreaterThan(q.z + 3);
    const back = { ...q };
    for (let f = 0; f < 60; f++) {
      // Backing up keeps the facing (`rideFace`): step south, facing north.
      slideBody(out, back.x, back.z, back.x, back.z - 14 / 60, back.yaw, slot, RIDE_RADIUS, body);
      back.x = out.x;
      back.z = out.z;
    }
    expect(back.z).toBeLessThan(q.z - 3);
  });

  it("eases out ends it was already in, and a turn that would take them deeper is held", () => {
    const body = mountBody("pony");
    // Knocked nose-first 0.4 into the wall.
    const q = { x: 0, z: body.fore + body.foreR - 0.4, yaw: Math.PI };
    const out = pt();
    const yaw = turnBody(out, q.x, q.z, q.yaw, q.yaw, [WALL], RIDE_RADIUS, body);
    expect(yaw).toBe(Math.PI);
    expect(endsDepth([WALL], out.x, out.z, yaw, body)).toBeLessThanOrEqual(1e-9);
  });

  it("a mount parked facing a wall is stood with its nose out of it", () => {
    const pony = MOUNTS.find((m) => m.id === "pony")!;
    const bus: RideBus = makeRideBus({ id: "pony", label: pony.label, color: "#8b5e3c", speed: pony.speed, tack: "#333" });
    Object.assign(bus.parked, { on: true, x: 0, z: RIDE_RADIUS + 0.2, yaw: Math.PI });
    clearPark(bus, [WALL]);
    expect(endsDepth([WALL], bus.parked.x, bus.parked.z, Math.PI, mountBody("pony"))).toBeLessThanOrEqual(1e-9);
  });

  it("ridden nose-first at a door, the push counts from the nose, so the door still opens", () => {
    const body = mountBody("stag");
    const q = { x: 0, z: 8, yaw: Math.PI };
    const out = pt();
    for (let f = 0; f < 90; f++) rideFrame(q, Math.PI, FASTEST, 1 / 60, [WALL], body, out);
    const door = { site: "mill", room: "mill" as const, x: 0, face: 0, hw: 0.85 };
    expect(doorAhead([door], q.x, q.z, 0, -1, bodyReach(body, q.yaw, 0, -1, HERO_RADIUS))).toBe(0);
    // From the saddle it would not have: the nose holds the saddle a whole neck off the door.
    expect(doorAhead([door], q.x, q.z, 0, -1, HERO_RADIUS)).toBe(-1);
  });

  it("parks with its whole body clear", () => {
    const body = mountBody("stag");
    const out = fitParked(pt(), 0, RIDE_RADIUS + 0.01, Math.PI, [WALL], RIDE_RADIUS, body);
    expect(endsDepth([WALL], out.x, out.z, Math.PI, body)).toBeLessThanOrEqual(1e-9);
    expect(saddleIn([WALL], out.x, out.z)).toBe(false);
  });
});

/* ------------------------------------------------------------------ the property */

function blockedAt(solids: readonly Collider[], x: number, z: number, r: number): boolean {
  for (const c of solids) if (overlaps(c, x, z, r)) return true;
  return false;
}

/** Where a walking child ends up pushing into `c` from bearing `a` (as `ride-escape.test.ts`). */
function walkedUpTo(c: Collider, a: number, solids: readonly Collider[]): Pt | null {
  const reach = Math.max(c.hw, c.hd) + 3;
  const p = { x: c.x + Math.sin(a) * reach, z: c.z + Math.cos(a) * reach };
  if (blockedAt(solids, p.x, p.z, HERO_RADIUS)) return null;
  const out = pt();
  for (let f = 0; f < 120; f++) {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    slideMove(out, p.x, p.z, p.x + (dx / d) * 11 / 60, p.z + (dz / d) * 11 / 60, solids, HERO_RADIUS);
    if (out.x === p.x && out.z === p.z) break;
    p.x = out.x;
    p.z = out.z;
  }
  return overlaps(c, p.x, p.z, HERO_RADIUS + 0.1) ? p : null;
}

const SETS: [string, Collider[]][] = [
  ["the village", villageSolids()],
  ["a close wood", wood()],
];

describe("a mounted rider is never frozen and never left embedded (the whole body)", () => {
  for (const [name, solids] of SETS) {
    const spots: { c: Collider; p: Pt }[] = [];
    for (const c of solids)
      for (let k = 0; k < 8; k++) {
        const p = walkedUpTo(c, (k / 8) * Math.PI * 2, solids);
        // Mounted where they stood: the saddle settles clear first (`settleRider`), so start there.
        if (!p) continue;
        const q = freeSpot(pt(), p.x, p.z, solids, RIDE_RADIUS);
        if (Math.hypot(q.x - p.x, q.z - p.z) < 1) spots.push({ c, p: q });
      }

    it(`finds spots against ${name}`, () => {
      expect(spots.length).toBeGreaterThan(name === "the village" ? 60 : 30);
    });

    for (const id of ["pony", "wyrm"]) {
      it(`${name}, ${id}: from every spot and facing, some way out rides clear, and nothing is ever deeper than touching`, () => {
        const body = mountBody(id);
        const stuck: string[] = [];
        const deep: string[] = [];
        const out = pt();
        for (const { c, p } of spots) {
          const away = Math.atan2(p.x - c.x, p.z - c.z);
          for (let k = 0; k < 6; k++) {
            const yaw0 = (k / 6) * Math.PI * 2 - Math.PI + 0.3;
            // First, whatever the facing, the body is fitted where it stands (a turn of nothing).
            const q = { x: p.x, z: p.z, yaw: yaw0 };
            q.yaw = turnBody(out, q.x, q.z, q.yaw, q.yaw, solids, RIDE_RADIUS, body);
            q.x = out.x;
            q.z = out.z;
            let best = 0;
            for (const off of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
              const r = { ...q };
              const a = away + off;
              for (let f = 0; f < 48; f++) {
                rideFrame(r, a, FASTEST, 1 / 60, solids, body, out);
                if (saddleIn(solids, r.x, r.z, 0.02)) deep.push(`saddle (${r.x.toFixed(2)}, ${r.z.toFixed(2)})`);
              }
              best = Math.max(best, Math.hypot(r.x - p.x, r.z - p.z));
              if (endsDepth(solids, r.x, r.z, r.yaw, body) > ENDS_SLACK + 0.02) deep.push(`ends ${endsDepth(solids, r.x, r.z, r.yaw, body).toFixed(2)} at (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) yaw ${r.yaw.toFixed(2)} from (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) yaw0 ${yaw0.toFixed(2)} fitted (${q.x.toFixed(2)}, ${q.z.toFixed(2)}, ${q.yaw.toFixed(2)}) d0 ${endsDepth(solids, q.x, q.z, q.yaw, body).toFixed(2)} a ${a.toFixed(2)}`);
            }
            if (best < 0.75) stuck.push(`(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) facing ${yaw0.toFixed(2)} got ${best.toFixed(2)}`);
          }
        }
        expect(stuck).toEqual([]);
        expect(deep.slice(0, 5)).toEqual([]);
      }, 60_000);
    }
  }
});
