import { describe, expect, it } from "vitest";
import { MOUNTS, DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { WADE_DEPTH, wadeSpeed } from "./shore";
import { JUMP_SPEED, GRAVITY } from "./jump";
import {
  askStop,
  camOffsets,
  canGetDown,
  castBlocked,
  CAST_FROM_SADDLE,
  DISMOUNT_S,
  isRiding,
  jumpSpeed,
  makeRideBus,
  MOUNT_AIR_CARRY,
  MOUNT_JUMP_SPEED,
  MOUNT_UP_S,
  pace,
  parkNow,
  readVisited,
  rideAccess,
  rideFace,
  rideRadius,
  rideRefusal,
  rideSpeed,
  rideWade,
  RIDE_WADE_DEPTH,
  SPEED_SCALE,
  stepRide,
  toggleRide,
  wadeLimit,
} from "./riding";

const pony = { id: "pony", label: "Pony", color: "#8b5e3c", speed: 4.5, tack: "#3b82f6" };

function run(ride: ReturnType<typeof makeRideBus>, seconds: number, depth = 0) {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 0.05) {
    const e = stepRide(ride, 0.05, depth);
    if (e) events.push(e);
  }
  return events;
}

describe("who rides", () => {
  it("a child on a mount they have earned", () => {
    const a = rideAccess({ mount: "stag", mountColor: "#123456" }, ["pony", "stag"], "child");
    expect(a.ok && a.mount.id).toBe("stag");
    expect(a.ok && a.color).toBe("#123456");
  });

  it("never a visiting grown-up", () => {
    const a = rideAccess({ mount: "pony", mountColor: "#000" }, ["pony"], "parent");
    expect(a.ok).toBe(false);
    expect(!a.ok && a.reason).toBe("visitor");
  });

  it("no mount chosen, and a mount chosen but not earned, are different answers", () => {
    const none = rideAccess(DEFAULT_AVATAR, ["pony", "donkey"], "child");
    expect(!none.ok && none.reason).toBe("none");
    const locked = rideAccess({ mount: "gryphon", mountColor: "#fff" }, ["pony"], "child");
    expect(!locked.ok && locked.reason).toBe("locked");
  });

  it("says kindly how a mount is earned", () => {
    const none = rideAccess(DEFAULT_AVATAR, [], "child");
    if (none.ok) throw new Error("expected a refusal");
    const line = rideRefusal(none, "Emma");
    expect(line).toMatch(/Tavern/);
    expect(line).toMatch(/Pony and the Donkey are free/);
    const goat = rideAccess({ mount: "goat", mountColor: "#fff" }, [], "child");
    if (goat.ok) throw new Error("expected a refusal");
    expect(rideRefusal(goat, "Emma")).toMatch(/Reach Level 3/);
    const visitor = rideAccess({ mount: "pony", mountColor: "#fff" }, ["pony"], "parent");
    if (visitor.ok) throw new Error("expected a refusal");
    expect(rideRefusal(visitor, "Emma")).toMatch(/Emma's to ride/);
  });
});

describe("speed", () => {
  it("every mount keeps its flat-Realm ratio to walking, and every one is faster than walking", () => {
    for (const m of MOUNTS) {
      expect(rideSpeed(m) / 11).toBeCloseTo(m.speed / 3.5);
      expect(rideSpeed(m)).toBeGreaterThan(11);
    }
    expect(SPEED_SCALE).toBeCloseTo(11 / 3.5);
  });

  it("the mover's pace is the mount's, less the water, more in the air", () => {
    const ride = makeRideBus(pony);
    expect(pace(ride, 11, 0, false, wadeSpeed)).toBe(11);
    toggleRide(ride);
    run(ride, 1);
    expect(pace(ride, 11, 0, false, wadeSpeed)).toBeCloseTo(rideSpeed(pony));
    expect(pace(ride, 11, 0, true, wadeSpeed)).toBeCloseTo(rideSpeed(pony) * MOUNT_AIR_CARRY);
    expect(pace(ride, 11, 1, false, wadeSpeed)).toBeLessThan(rideSpeed(pony));
  });
});

describe("water", () => {
  it("a mount wades deeper than a child, and slows less", () => {
    expect(RIDE_WADE_DEPTH).toBeGreaterThan(WADE_DEPTH);
    expect(rideWade(1.2)).toBeGreaterThan(wadeSpeed(1.2));
    const ride = makeRideBus(pony);
    expect(wadeLimit(ride)).toBe(WADE_DEPTH);
    toggleRide(ride);
    run(ride, 1);
    expect(wadeLimit(ride)).toBe(RIDE_WADE_DEPTH);
  });

  it("never sets a child down deeper than they could wade", () => {
    expect(canGetDown(WADE_DEPTH)).toBe(true);
    expect(canGetDown(WADE_DEPTH + 0.1)).toBe(false);
    const ride = makeRideBus(pony);
    toggleRide(ride);
    run(ride, 1);
    toggleRide(ride);
    expect(stepRide(ride, 0.05, 1.7)).toBe("refused-deep");
    expect(ride.phase).toBe("on");
  });
});

describe("getting on and off", () => {
  it("M gets on with a short, held moment, and M again gets off; the mount waits there", () => {
    const ride = makeRideBus(pony);
    const seen: boolean[] = [];
    ride.onRiding = (r) => seen.push(r);
    toggleRide(ride);
    stepRide(ride, 0.05, 0);
    expect(ride.phase).toBe("up");
    expect(ride.hold).toBe(true);
    expect(isRiding(ride)).toBe(true);
    const events = run(ride, MOUNT_UP_S + 0.1);
    expect(events).toContain("mounted");
    expect(ride.phase).toBe("on");
    expect(ride.hold).toBe(false);
    expect(ride.seat).toBe(1);
    ride.at.x = 5;
    ride.at.z = 6;
    toggleRide(ride);
    expect(run(ride, DISMOUNT_S + 0.1)).toContain("dismounted");
    expect(ride.phase).toBe("off");
    expect(ride.parked.on).toBe(true);
    expect(seen).toEqual([true, false]);
  });

  it("reduced motion makes the moment a blink", () => {
    const ride = makeRideBus(pony, true);
    toggleRide(ride);
    expect(run(ride, 0.2)).toContain("mounted");
  });

  it("no mount, no riding", () => {
    const ride = makeRideBus(null);
    toggleRide(ride);
    stepRide(ride, 0.05, 0);
    expect(ride.phase).toBe("off");
  });

  it("going indoors parks the mount at once, where the child stood", () => {
    const ride = makeRideBus(pony);
    toggleRide(ride);
    run(ride, 1);
    ride.at.x = 3;
    ride.at.z = 4;
    expect(parkNow(ride, 2, 0)).toBe(true);
    expect(ride.phase).toBe("off");
    expect(ride.parked).toMatchObject({ on: true, x: 5, z: 4 });
    expect(ride.speed).toBe(0);
  });
});

describe("what riding changes", () => {
  it("no spells from the saddle — the flat Realm's rule", () => {
    const ride = makeRideBus(pony);
    expect(castBlocked(ride)).toBe(false);
    toggleRide(ride);
    stepRide(ride, 0.05, 0);
    expect(castBlocked(ride)).toBe(true);
    expect(CAST_FROM_SADDLE).toMatch(/M/);
  });

  it("a mount's jump is higher and longer", () => {
    const ride = makeRideBus(pony);
    expect(jumpSpeed(ride, JUMP_SPEED)).toBe(JUMP_SPEED);
    toggleRide(ride);
    run(ride, 1);
    expect(jumpSpeed(ride, JUMP_SPEED)).toBe(MOUNT_JUMP_SPEED);
    const rise = (v: number) => (v * v) / (2 * GRAVITY);
    const hang = (v: number) => (2 * v) / GRAVITY;
    expect(rise(MOUNT_JUMP_SPEED)).toBeGreaterThan(rise(JUMP_SPEED) * 1.4);
    // Distance covered in the air, at a run: riding goes much further.
    expect(hang(MOUNT_JUMP_SPEED) * rideSpeed(pony) * MOUNT_AIR_CARRY).toBeGreaterThan(hang(JUMP_SPEED) * 11 * 1.5);
  });

  it("a wider body, and the camera up and back", () => {
    const ride = makeRideBus(pony);
    expect(rideRadius(ride, 0.55)).toBe(0.55);
    toggleRide(ride);
    run(ride, 1);
    expect(rideRadius(ride, 0.55)).toBeGreaterThan(0.55);
    const o = camOffsets(1, { lift: 0, pull: 0 });
    expect(o.lift).toBeGreaterThan(0);
    expect(o.pull).toBeGreaterThan(0);
    const t = camOffsets(2, { lift: 0, pull: 0 });
    expect(t.lift).toBeGreaterThan(o.lift);
    expect(t.pull).toBeGreaterThan(o.pull);
  });

  it("a mount turns and goes the way it is going, rather than crabbing sideways", () => {
    const ride = makeRideBus(pony);
    const strafe = { x: 1, z: 0, face: Math.PI, back: false };
    expect(rideFace(ride, strafe)).toBe(Math.PI);
    toggleRide(ride);
    run(ride, 1);
    expect(rideFace(ride, strafe)).toBeCloseTo(Math.PI / 2);
    expect(rideFace(ride, { x: 0, z: 1, face: Math.PI, back: true })).toBe(Math.PI);
  });

  it("stop asks only while a ride is running", () => {
    const ride = makeRideBus(pony);
    askStop(ride);
    expect(ride.stop).toBe(false);
    ride.travelling = true;
    askStop(ride);
    expect(ride.stop).toBe(true);
  });
});

describe("remembered places", () => {
  it("reads a stored list defensively", () => {
    expect(readVisited(null)).toEqual([]);
    expect(readVisited("nope")).toEqual([]);
    expect(readVisited('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});
