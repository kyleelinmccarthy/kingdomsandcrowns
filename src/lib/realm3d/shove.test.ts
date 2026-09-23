import { describe, expect, it } from "vitest";
import { HERO_RADIUS, overlaps, slideMove, type Collider } from "./collision";
import { makeRideBus, rideRadius, wadeLimit, RIDE_RADIUS, RIDE_WADE_DEPTH, type RideBus } from "./riding";
import { WADE_DEPTH } from "./shore";
import { shoveMove } from "./shove";
import { KNOCK_SPEED } from "./troubles3d";

const SEA = 0;
/** A seabed sloping away to the west: dry east of x = 0, a unit deeper every 4 units west. */
const bed = (x: number) => x * 0.25;
const level = () => SEA;
const depthAt = (x: number) => Math.max(0, SEA - bed(x));

function riding(): RideBus {
  const r = makeRideBus({ id: "pony", label: "Pony", color: "#8b5e3c", speed: 4.5, tack: "#333" });
  r.phase = "on";
  return r;
}

/** A 350 ms knock at `KNOCK_SPEED`, stepped as the scene steps it. */
function knock(x: number, z: number, dx: number, dz: number, solids: Collider[], r: number, wade: number, hz = 60) {
  const p = { x, z };
  const out = { x: 0, z: 0 };
  const dt = 1 / hz;
  for (let f = 0; f < Math.round(0.35 * hz); f++) {
    const step = KNOCK_SPEED * dt;
    shoveMove(out, p.x, p.z, p.x + dx * step, p.z + dz * step, bed, level, solids, r, wade, -Infinity, 1000);
    p.x = out.x;
    p.z = out.z;
  }
  return p;
}

describe("a shove (a knock, a stone's push) goes through the same water and walls as a walk", () => {
  it("a rider wading at 1.5 is not knocked out past the mount's depth", () => {
    const ride = riding();
    const x = -6; // depth 1.5
    expect(depthAt(x)).toBeCloseTo(1.5);
    const p = knock(x, 0, -1, 0, [], rideRadius(ride, HERO_RADIUS), wadeLimit(ride));
    expect(depthAt(p.x)).toBeLessThanOrEqual(RIDE_WADE_DEPTH + 1e-9);
  });

  it("someone already out of their depth for the limit given is never shoved deeper", () => {
    // The old bug: the walk's limit (1.3) against a rider at 1.5 let the whole knock through.
    const p = knock(-6, 0, -1, 0, [], HERO_RADIUS, WADE_DEPTH);
    expect(depthAt(p.x)).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it("a shove toward the shore still runs from out of depth", () => {
    const p = knock(-10, 0, 1, 0, [], HERO_RADIUS, WADE_DEPTH);
    expect(p.x).toBeGreaterThan(-10);
  });

  it("a rider shoved into a wall ends no deeper in it than the ride body allows, and can ride away", () => {
    const wall: Collider = { x: 10, z: 0, hw: 1, hd: 5, round: false, base: 0, top: 4 };
    const start = 10 - 1 - RIDE_RADIUS - 0.02;
    const p = knock(start, 0, 1, 0, [wall], RIDE_RADIUS, RIDE_WADE_DEPTH);
    expect(overlaps(wall, p.x, p.z, RIDE_RADIUS)).toBe(false);
    const out = { x: 0, z: 0 };
    slideMove(out, p.x, p.z, p.x - 0.1, p.z, [wall], RIDE_RADIUS);
    expect(out.x).toBeLessThan(p.x);
  });

  it("the edge of the walkable world holds", () => {
    const out = { x: 0, z: 0 };
    shoveMove(out, 99.5, 0, 101, 0, () => 5, level, [], HERO_RADIUS, WADE_DEPTH, -Infinity, 100);
    expect(out.x).toBe(100);
  });
});
