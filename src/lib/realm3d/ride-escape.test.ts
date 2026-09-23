/**
 * NEVER LEFT EMBEDDED — the property behind "I got on my pony by the tree and couldn't move".
 *
 * The body the solver pushes around can GROW while it stands still: the mover's radius jumps
 * from the walk's 0.55 to a mount's 0.8 the moment mount-up starts, and a knock or a stone's
 * push can leave a rider 0.55 from a wall. Whatever did it, a mover who starts a frame
 * overlapping something solid must still be able to move away from it — at any frame rate,
 * at any mount's speed — and the mount-up moment must end with the rider clear.
 *
 * Checked against the real village (every house, the castle, the well, the garden, the stones
 * and landmark oaks) and a wood of trunks far denser than any the wilderness grows.
 */

import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { MOUNTS } from "@/lib/utils/avatar-catalog";
import { castlePlan } from "./castle-plan";
import { buildColliders, overlaps, slideMove, HERO_RADIUS, type Collider, type Pt } from "./collision";
import { makeRideBus, rideRadius, rideSpeed, settleRider, stepRide, RIDE_RADIUS, MOUNT_UP_S, type RideBus } from "./riding";

const OPTS = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };

function villageSolids(): Collider[] {
  const buildings = BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: true }));
  const layout = buildWorldLayout({ castleType: "castle", buildings, objectiveIds: [] });
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), layout.scenery, OPTS);
  const c = layout.props.find((p) => p.kind === "castle")!;
  for (const b of castlePlan("castle").solids) built.solids.push({ ...b, x: c.position.x + b.x, z: c.position.z + b.z });
  return built.solids;
}

/**
 * A wood of trunks on a jittered 2.6-unit grid — far closer than the wilderness ever puts its
 * solid trunks (7.6 apart at the least), with gaps a mount only just fits through. Deterministic.
 */
function wood(): Collider[] {
  const out: Collider[] = [];
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) {
      const jx = Math.sin(i * 12.9898 + j * 78.233) * 0.15;
      const jz = Math.cos(i * 39.425 + j * 11.135) * 0.15;
      out.push({ x: 400 + i * 2.6 + jx, z: 400 + j * 2.6 + jz, hw: 0.42, hd: 0.42, round: true, base: 0, top: 6 });
    }
  return out;
}

const pt = (): Pt => ({ x: 0, z: 0 });

function blockedAt(solids: readonly Collider[], x: number, z: number, r: number): boolean {
  for (const c of solids) if (overlaps(c, x, z, r)) return true;
  return false;
}

/**
 * Where a walking child ends up when they push into `c` from direction `a`: walked in by the
 * solver itself, so the spot is exactly what play produces (touching, a hair off the surface).
 */
function walkedUpTo(c: Collider, a: number, solids: readonly Collider[]): Pt | null {
  const reach = Math.max(c.hw, c.hd) + 3;
  const p = { x: c.x + Math.sin(a) * reach, z: c.z + Math.cos(a) * reach };
  if (blockedAt(solids, p.x, p.z, HERO_RADIUS)) return null;
  const out = pt();
  const speed = 11;
  const dt = 1 / 60;
  for (let f = 0; f < 120; f++) {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    slideMove(out, p.x, p.z, p.x + (dx / d) * speed * dt, p.z + (dz / d) * speed * dt, solids, HERO_RADIUS);
    if (out.x === p.x && out.z === p.z) break;
    p.x = out.x;
    p.z = out.z;
  }
  // Only a spot actually against THIS collider is a test of it.
  return overlaps(c, p.x, p.z, HERO_RADIUS + 0.1) ? p : null;
}

/** Every spot a child can walk up against a solid from, 12 bearings round each. */
function spotsAgainst(solids: readonly Collider[]): { c: Collider; p: Pt }[] {
  const out: { c: Collider; p: Pt }[] = [];
  for (const c of solids)
    for (let k = 0; k < 12; k++) {
      const p = walkedUpTo(c, (k / 12) * Math.PI * 2, solids);
      if (p) out.push({ c, p });
    }
  return out;
}

/** Ride `secs` along bearing `a` with the rider's body, as the mover does. Returns how far they got. */
function ride(p: Pt, a: number, speed: number, hz: number, secs: number, solids: readonly Collider[]): Pt {
  const q = { x: p.x, z: p.z };
  const out = pt();
  const dt = 1 / hz;
  for (let f = 0; f < Math.round(secs * hz); f++) {
    slideMove(out, q.x, q.z, q.x + Math.sin(a) * speed * dt, q.z + Math.cos(a) * speed * dt, solids, RIDE_RADIUS);
    q.x = out.x;
    q.z = out.z;
  }
  return q;
}

const SETS: [string, Collider[]][] = [
  ["the village", villageSolids()],
  ["a close wood", wood()],
];
const FASTEST = Math.max(...MOUNTS.map((m) => rideSpeed(m)));
const SLOWEST = Math.min(...MOUNTS.map((m) => rideSpeed(m)));

describe("a mover whose body grows where it stands is never frozen", () => {
  for (const [name, solids] of SETS) {
    const spots = spotsAgainst(solids);

    it(`finds plenty of spots against ${name} to test`, () => {
      expect(spots.length).toBeGreaterThan(name === "the village" ? 150 : 100);
    });

    for (const hz of [60, 144, 240]) {
      for (const speed of [SLOWEST, FASTEST]) {
        it(`${name}, ${hz} Hz, ${speed.toFixed(1)} u/s: mounted where they stood, the rider can ride away from every spot`, () => {
          const stuck: string[] = [];
          for (const { c, p } of spots) {
            // Straight away from the thing they were against.
            const away = Math.atan2(p.x - c.x, p.z - c.z);
            // Some bearing away from it gets them clear of it and properly on their way — not a
            // crawl. (Half a second on; the next trunk along may stop them, and that is fair.)
            let best = 0;
            for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
              const q = ride(p, away + off, speed, hz, 0.5, solids);
              if (overlaps(c, q.x, q.z, RIDE_RADIUS)) continue;
              best = Math.max(best, Math.hypot(q.x - p.x, q.z - p.z));
            }
            if (best < 0.75) stuck.push(`(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) got ${best.toFixed(2)}`);
          }
          expect(stuck).toEqual([]);
        });
      }
    }

    it(`${name}: riding INTO the thing they are against never takes them deeper`, () => {
      const out = pt();
      for (const { c, p } of spots) {
        const into = Math.atan2(c.x - p.x, c.z - p.z);
        const step = FASTEST / 144;
        slideMove(out, p.x, p.z, p.x + Math.sin(into) * step, p.z + Math.cos(into) * step, solids, RIDE_RADIUS);
        const before = Math.hypot(p.x - c.x, p.z - c.z);
        const after = Math.hypot(out.x - c.x, out.z - c.z);
        if (c.round) expect(after).toBeGreaterThanOrEqual(before - 1e-9);
      }
    });

    it(`${name}: the mount-up moment ends with the rider clear of everything`, () => {
      const pony = MOUNTS.find((m) => m.id === "pony")!;
      const bad: string[] = [];
      for (const { p } of spots) {
        const bus: RideBus = makeRideBus({ id: pony.id, label: pony.label, color: "#8b5e3c", speed: pony.speed, tack: "#333" });
        const q = { x: p.x, z: p.z };
        bus.want = true;
        const dt = 1 / 144;
        for (let f = 0; f < Math.ceil((MOUNT_UP_S + 0.1) / dt); f++) {
          stepRide(bus, dt, 0);
          settleRider(q, q.x, q.z, 0, solids, rideRadius(bus, HERO_RADIUS), dt);
        }
        expect(bus.phase).toBe("on");
        if (blockedAt(solids, q.x, q.z, RIDE_RADIUS - 0.01)) bad.push(`(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
      }
      expect(bad).toEqual([]);
    });
  }

  it("a walker is left alone: settling never moves a child who is not embedded", () => {
    const solids = wood();
    const q = { x: -50, z: -50 };
    settleRider(q, q.x, q.z, 0, solids, HERO_RADIUS, 1 / 60);
    expect(q).toEqual({ x: -50, z: -50 });
  });

  it("settling ignores what the feet are standing on top of", () => {
    const bed: Collider = { x: 0, z: 0, hw: 2, hd: 2, round: false, base: 0, top: 1 };
    const q = { x: 0, z: 0 };
    settleRider(q, 0, 0, 1, [bed], RIDE_RADIUS, 1 / 60);
    expect(q).toEqual({ x: 0, z: 0 });
  });
});
