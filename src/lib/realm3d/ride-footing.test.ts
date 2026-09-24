/**
 * A mount's feet on a steep road — the fast-travel ride whose legs folded up the whole climb.
 *
 * The gait used to call the mount "in the air" whenever the rider rose or fell faster than
 * 1.5 units a second, and on the island's steepest road banks (a slope near 3.3, ridden at three
 * times a gallop) that is every frame of the climb. Now the gait asks the feet (`RideBus.air`,
 * how long they have been off the ground), and a ridden mount keeps its feet going downhill
 * (`keepFooting`), so the feet are the truth both ways.
 */

import { describe, expect, it } from "vitest";
import { makeVertical, stepVertical, tryJump } from "./jump";
import { AIR_GRACE, boostJump, holdDrop, keepFooting, makeRideBus, MOUNT_HOLD_SLOPE, MOUNT_JUMP_SPEED, offTheGround, rideSpeed, stepRide, toggleRide, writeAir } from "./riding";

const pony = { id: "pony", label: "Pony", color: "#8b5e3c", speed: 4.5, tack: "#3b82f6" };

function riding(travelling = false) {
  const ride = makeRideBus(pony);
  toggleRide(ride);
  for (let t = 0; t < 1.5; t += 0.05) stepRide(ride, 0.05, 0);
  ride.travelling = travelling;
  return ride;
}

/**
 * Ride along a straight slope (`slope` up per unit across; negative is downhill) at `speed`,
 * as the mover does: gravity and the ground (`stepVertical`), then the footing, then the feet
 * written for the gait. Returns how many frames the gait would have called "in the air".
 */
function ride(slope: number, speed: number, travelling: boolean, footing: boolean, jumpAt = -1) {
  const r = riding(travelling);
  const ground = (x: number) => x * slope;
  const v = makeVertical(0);
  const dt = 1 / 60;
  let x = 0;
  let aloft = 0;
  let oldRule = 0;
  let lastY = 0;
  for (let f = 0; f < 90; f++) {
    x += speed * dt;
    if (f === jumpAt && tryJump(v)) boostJump(v, MOUNT_JUMP_SPEED);
    const footed = v.grounded;
    stepVertical(v, dt, x, 0, ground(x), []);
    if (footing && footed && !v.grounded) keepFooting(v, footed, ground(x), holdDrop(r, dt));
    writeAir(r, v.grounded, v.airborne);
    if (offTheGround(r.air.s)) aloft++;
    if (Math.abs((v.y - lastY) / dt) > 1.5) oldRule++;
    lastY = v.y;
  }
  return { aloft, oldRule };
}

describe("a mount's feet on a steep road", () => {
  const travel = rideSpeed(pony) * 3;

  it("the old rule folded the legs for the whole of a steep fast-travel climb; the feet do not", () => {
    const up = ride(2.3, travel, true, true);
    expect(up.oldRule).toBeGreaterThan(80);
    expect(up.aloft).toBe(0);
  });

  it("going down a road bank at fast-travel speed, the mount keeps its feet; without the footing it flew", () => {
    expect(ride(-3.3, travel, true, false).aloft).toBeGreaterThan(20);
    expect(ride(-3.3, travel, true, true).aloft).toBe(0);
  });

  it("galloping down a hill it keeps its feet, up to the slope it holds", () => {
    const gallop = rideSpeed(pony);
    expect(ride(-MOUNT_HOLD_SLOPE * 0.95, gallop, false, true).aloft).toBe(0);
    // Off a real drop, it falls.
    expect(ride(-MOUNT_HOLD_SLOPE * 2, gallop, false, true).aloft).toBeGreaterThan(20);
  });

  it("a jump is still a jump, uphill or down", () => {
    const flat = ride(0, rideSpeed(pony), false, true, 10);
    expect(flat.aloft).toBeGreaterThan(30); // 0.74 s of hang, less the grace
    expect(ride(-2, rideSpeed(pony), false, true, 10).aloft).toBeGreaterThan(30);
    expect(ride(0.4, rideSpeed(pony), false, true, 10).aloft).toBeGreaterThan(20);
  });

  it("a lip over a crest is not a leap", () => {
    expect(offTheGround(0)).toBe(false);
    expect(offTheGround(AIR_GRACE)).toBe(false);
    expect(offTheGround(AIR_GRACE + 0.02)).toBe(true);
  });

  it("holds the ground only while riding; the whole way on a fast-travel ride", () => {
    expect(holdDrop(makeRideBus(pony), 1 / 60)).toBe(0);
    expect(holdDrop(null, 1 / 60)).toBe(0);
    expect(holdDrop(riding(), 1 / 60)).toBeGreaterThan(0.5);
    expect(holdDrop(riding(true), 1 / 60)).toBe(Number.POSITIVE_INFINITY);
  });

  it("never pulls down a mover on the way up, or one who was not on the ground", () => {
    const v = { y: 1, vy: 3, grounded: false, airborne: 0.1 };
    keepFooting(v, true, 0, 10);
    expect(v.y).toBe(1);
    const w = { y: 1, vy: -3, grounded: false, airborne: 0.1 };
    keepFooting(w, false, 0, 10);
    expect(w.y).toBe(1);
    keepFooting(w, true, 0, 0.5);
    expect(w.y).toBe(1);
    keepFooting(w, true, 0, 2);
    expect(w).toEqual({ y: 0, vy: 0, grounded: true, airborne: 0 });
  });
});
