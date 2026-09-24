/**
 * RIDING IN THE 3D REALM — the rules, as arithmetic. No three.js, so every one of them is tested.
 *
 * The flat Realm's riding (`realm-shell.tsx`, `lib/realm/movement.ts`) is the rulebook, ported:
 *
 *   - **Who rides.** The mount on the child's avatar, if the child has earned it
 *     (`bundle.mounts.unlocked`) and the child is the one playing. A visiting grown-up never
 *     rides — the flat Realm drew their Ride button disabled; here the wizard walks.
 *   - **How fast.** The mount's own `MountItem.speed` instead of the walk. The catalog's numbers
 *     are in the flat Realm's units (a hero walks 3.5 there); the island walks at 11, so every
 *     mount keeps its exact RATIO to walking — a Pony is still 1.29x a child's legs, a Wyrm 2x.
 *   - **No casting from the saddle.** The flat Realm refused a spell key while riding with
 *     "Dismount to cast." and so does this one, with the key that fixes it named.
 *   - **Mounting drops what you were doing.** 2D's `setMounted` cleared the walk target and the
 *     selected spell; here the short mount-up moment holds the mover still for the same reason.
 *
 * And what 3D adds, because the island has things the flat board did not:
 *
 *   - **A jump.** A mount's is higher and carries further: `MOUNT_JUMP_SPEED`, `MOUNT_AIR_CARRY`.
 *   - **Water.** A mount wades deeper than a child (`RIDE_WADE_DEPTH` against the walk's 1.3),
 *     because its legs are longer and it is the whole point of a horse at a ford — and it slows
 *     less in it. A child is never set down in water deeper than they could have walked into.
 *   - **Doors.** Riding into a building sets the child down at the door; the mount waits outside
 *     where they left it (`parkAt`). Every dismount parks: the mount stands where you got off.
 *
 * `RideBus` is the one mutable object the frame (`realm-game.tsx`, which owns the M key and the
 * words) and the canvas (`riding-scene.tsx`, which owns the hero's position and the frame loop)
 * share, exactly as `HudBus` and `TroubleBus` are shared: built once, never React state, written
 * through the free functions below so no component ever assigns through a prop.
 */

import { findMount, getUnlockDescription, type AvatarConfig, type MountItem } from "@/lib/utils/avatar-catalog";
import type { Collider, Pt } from "./collision";
import { buried, freeSpot } from "./doorways";
import { WADE_DEPTH } from "./shore";

/* ------------------------------------------------------------------ speed */

/** The flat Realm's walk (`lib/realm/movement.ts` HERO_SPEED), which the catalog's speeds are measured against. */
export const FLAT_WALK = 3.5;
/** The island's walk (`spike-scene.tsx` HERO_SPEED). */
export const ISLAND_WALK = 11;
/** Flat-Realm units to island units. Every mount keeps its ratio to walking. */
export const SPEED_SCALE = ISLAND_WALK / FLAT_WALK;

/** A mount's free-roam speed on the island, in world units a second. */
export function rideSpeed(mount: Pick<MountItem, "speed">): number {
  return mount.speed * SPEED_SCALE;
}

/**
 * How deep a mount will wade. A pony's belly is about 1.2 off the ground and the rider's boots
 * hang a little under it, so at 1.9 the water is over its knees and lapping the stirrups — a
 * real ford, and plainly still not swimming. A child on foot stops at `WADE_DEPTH` (1.3).
 */
export const RIDE_WADE_DEPTH = 1.9;

/** A mount's pace through water, as a multiplier: it loses at most a third, where a child loses over half. */
export function rideWade(depth: number): number {
  if (depth <= 0) return 1;
  return 1 - 0.33 * Math.min(1, depth / RIDE_WADE_DEPTH);
}

/** A child may only be set down where they could have waded in on foot. */
export function canGetDown(depth: number): boolean {
  return depth <= WADE_DEPTH;
}

/* ------------------------------------------------------------------ the jump */

/**
 * A mount's jump. The walk's is 10 (`jump.ts`: a 1.5-unit hop, 0.6 s in the air); a mount's is
 * 12.5 — 2.3 units up and 0.74 s in the air — so it clears a garden bed a child cannot, and
 * with `MOUNT_AIR_CARRY` it carries about half as far again. Higher AND longer, as asked.
 */
export const MOUNT_JUMP_SPEED = 12.5;
/** How much faster a mount carries forward while its feet are off the ground. */
export const MOUNT_AIR_CARRY = 1.2;

/* ------------------------------------------------------------------ the body */

/**
 * The mounted body in the collision solver. Wider than a child (0.55), so a horse does not poke
 * its whole head through a cottage wall, but not the full length of the animal: a radius that big
 * would stop a pony in every lane of the village, and a lane a child could walk and cannot ride
 * is a lane they will get stuck in.
 */
export const RIDE_RADIUS = 0.8;

/** The camera, riding: how far up (world units) and how much further back (a fraction of the boom). */
export const RIDE_CAM_LIFT = 1.15;
export const RIDE_CAM_PULL = 0.14;
/** And on a fast-travel ride, further again, so the island goes past underneath. */
export const TRAVEL_CAM_LIFT = 2.4;
export const TRAVEL_CAM_PULL = 0.7;

/* ------------------------------------------------------------------ who rides */

export type RideAccess =
  | { ok: true; mount: MountItem; color: string }
  /** `visitor`: a grown-up walking; `none`: no mount chosen; `locked`: chosen, not yet earned. */
  | { ok: false; reason: "visitor" | "none" | "locked"; mount: MountItem | null };

/** Whether this walker rides, and on what — the flat Realm's `canRide`, with its reasons kept. */
export function rideAccess(avatar: Pick<AvatarConfig, "mount" | "mountColor"> | null, unlocked: readonly string[], viewer: "child" | "parent"): RideAccess {
  const mount = avatar?.mount ? findMount(avatar.mount) : null;
  if (viewer === "parent") return { ok: false, reason: "visitor", mount };
  if (!mount) return { ok: false, reason: "none", mount: null };
  if (!unlocked.includes(mount.id)) return { ok: false, reason: "locked", mount };
  return { ok: true, mount, color: avatar?.mountColor || "#8b5e3c" };
}

/**
 * What pressing M says when there is nothing to ride. Kind, and it says how a mount is EARNED —
 * which is the real rule: the Pony and the Donkey are free to everyone and are chosen on the
 * Mount tab of the hero's look in the Tavern; the rest come from levels, a streak badge and
 * quest rewards (`MOUNTS` in the avatar catalog).
 */
export function rideRefusal(access: Exclude<RideAccess, { ok: true }>, heroName: string): string {
  if (access.reason === "visitor") return `Visitors walk. The mount is ${heroName}'s to ride.`;
  if (access.reason === "locked" && access.mount) {
    const how = getUnlockDescription(access.mount);
    const earn = how === "Quest Reward" ? "Finish the quest that gives it" : how ? `${how}` : "Earn it";
    return `Your ${access.mount.label} isn't yours to ride yet. ${earn}, and it's yours.`;
  }
  return "You don't have a mount yet! In the Tavern, open your hero's look and pick one on the Mount tab. The Pony and the Donkey are free, and more come with levels, streaks and quests.";
}

/** The flat Realm's "Dismount to cast.", with the key that does it. */
export const CAST_FROM_SADDLE = "Get down to cast a spell. Press M.";
/** Pressing M indoors. */
export function waitingOutside(label: string): string {
  return `Your ${label} is waiting outside.`;
}
export const TOO_DEEP_TO_GET_DOWN = "Too deep to get down here. Ride to the shallows first.";

/* ------------------------------------------------------------------ the bus */

/**
 * `off` walking; `up` the mount-up moment (a puff, the mount steps in, the child swings up);
 * `on` riding; `down` getting off (the child hops down beside it, and it stays there).
 */
export type RidePhase = "off" | "up" | "on" | "down";

/** How long getting on takes. Short enough never to be a wait, long enough to be SEEN. */
export const MOUNT_UP_S = 0.6;
export const DISMOUNT_S = 0.4;
/** The same moments under reduced motion: a blink, so the change still reads as a change. */
export const CALM_MOMENT_S = 0.12;

/** What is ridden: the catalog mount, the child's colour for it, and their banner colour for its tack. */
export type RideMount = { id: string; label: string; color: string; speed: number; tack: string };

/** Where the mount stands when nobody is on it. */
export type Parked = { on: boolean; x: number; z: number; yaw: number };

export type RideBus = {
  /** What this walker rides, or null (a grown-up, or no mount). Fixed for the visit. */
  mount: RideMount | null;
  phase: RidePhase;
  /** Seconds into the current `up` / `down`. */
  t: number;
  /** 0 walking, 1 fully in the saddle. The rider's pose and height ride on it. */
  seat: number;
  /** The mover's speed while mounted, or 0 while walking. */
  speed: number;
  /** True while the mover must take no input: getting on or off, or a fast-travel ride. */
  hold: boolean;
  /** 0 walking, 1 riding, up to 2 on a fast-travel ride: the camera eases toward it. */
  cam: number;
  /** A request from the frame, eaten by the scene: true get on, false get off. */
  want: boolean | null;
  /** Where the mount waits when nobody is on it. */
  parked: Parked;
  /** The hero, as the scene last saw them: what the frame parks at when the child goes indoors. */
  at: { x: number; z: number; yaw: number; depth: number };
  /** Reduced motion: the moments are a blink, and a fast-travel ride is an arrival. */
  calm: boolean;
  /** The companion is carried on a fast-travel ride rather than drawn sprinting. */
  away: { current: boolean };
  /** A fast-travel request from the frame (a destination id), and a stop request. Eaten by the scene. */
  travelTo: string | null;
  stop: boolean;
  /** Whether a fast-travel ride is running (written by the scene). */
  travelling: boolean;
  /** Where the running fast-travel ride is going, or null (written by the scene with `travelling`). */
  travelDest: string | null;
  /** Places the child has stood in, by landmark id, as the scene sees them. */
  visited: Set<string>;

  /** Fired when riding starts or stops (the HUD redraws its Ride button). */
  onRiding: (riding: boolean) => void;
  /** Fired when the scene refuses something the frame should say out loud. */
  onSay: (line: string) => void;
  /** Fired the first time the child stands in a place this visit (the frame stores it). */
  onVisit: (id: string) => void;
  /** Fired when a fast-travel ride starts and ends. */
  onTravel: (state: "start" | "arrive" | "stop", to: string) => void;
  /** What the sound hears (`realm-sound.tsx`), installed with `setRideSound`; silent until then. */
  sound: RideSound;
};

const noop = () => {};

/**
 * The riding's sounds, as events: a mount's foot down (or a gallop's three), a wingbeat, the
 * mount-up and getting-off moments (and a mount called in from afar), fast travel's start and
 * end, and a refusal the words are saying. Mutated in place, like the hero's `feet`: the scene
 * holds `ride.sound` and calls through it.
 */
export type RideSound = {
  onFootfall: (x: number, z: number, gallop: boolean) => void;
  onWingbeat: (air: boolean) => void;
  onMoment: (kind: "summon" | "up" | "down") => void;
  onTravel: (state: "start" | "arrive" | "stop") => void;
  onRefuse: () => void;
};

export function makeRideSound(): RideSound {
  return { onFootfall: noop, onWingbeat: noop, onMoment: noop, onTravel: noop, onRefuse: noop };
}

/** Installs the sound's handlers; any left out go quiet. */
export function setRideSound(ride: RideBus, h: Partial<RideSound>): void {
  ride.sound.onFootfall = h.onFootfall ?? noop;
  ride.sound.onWingbeat = h.onWingbeat ?? noop;
  ride.sound.onMoment = h.onMoment ?? noop;
  ride.sound.onTravel = h.onTravel ?? noop;
  ride.sound.onRefuse = h.onRefuse ?? noop;
}

export function makeRideBus(mount: RideMount | null, calm = false, visited: Iterable<string> = []): RideBus {
  return {
    mount,
    phase: "off",
    t: 0,
    seat: 0,
    speed: 0,
    hold: false,
    cam: 0,
    want: null,
    parked: { on: false, x: 0, z: 0, yaw: 0 },
    at: { x: 0, z: 0, yaw: 0, depth: 0 },
    calm,
    away: { current: false },
    travelTo: null,
    stop: false,
    travelling: false,
    travelDest: null,
    visited: new Set(visited),
    onRiding: noop,
    onSay: noop,
    onVisit: noop,
    onTravel: noop,
    sound: makeRideSound(),
  };
}

export type RideHandlers = Pick<RideBus, "onRiding" | "onSay" | "onVisit" | "onTravel">;

export function setRideHandlers(ride: RideBus, h: Partial<RideHandlers>): void {
  if (h.onRiding) ride.onRiding = h.onRiding;
  if (h.onSay) ride.onSay = h.onSay;
  if (h.onVisit) ride.onVisit = h.onVisit;
  if (h.onTravel) ride.onTravel = h.onTravel;
}

/** In the saddle, or on the way into it. */
export function isRiding(ride: RideBus | null | undefined): boolean {
  return !!ride && (ride.phase === "on" || ride.phase === "up");
}

/** Whether a spell may go off right now: never from the saddle, never mid-moment. */
export function castBlocked(ride: RideBus | null | undefined): boolean {
  return !!ride && ride.phase !== "off";
}

/** M, from the frame: get on if walking, off if riding. Ignored mid-moment and mid-ride. */
export function toggleRide(ride: RideBus): void {
  if (!ride.mount || ride.travelling) return;
  if (ride.phase === "off") ride.want = true;
  else if (ride.phase === "on") ride.want = false;
}

/** Ask for a fast-travel ride to a destination id. The scene decides if it can start. */
export function askTravel(ride: RideBus, to: string): void {
  ride.travelTo = to;
}

/** Ask a running fast-travel ride to pull up. */
export function askStop(ride: RideBus): void {
  if (ride.travelling) ride.stop = true;
}

/**
 * Off the mount at once, and it waits where the child is standing — for going indoors, where
 * there is no frame left on the island to play a moment in. `side` is where the mount stands
 * relative to the hero, in world units (the frame passes a step to the side of the door).
 */
export function parkNow(ride: RideBus, dx = 0, dz = 0): boolean {
  if (ride.phase === "off") return false;
  const was = ride.phase === "on" || ride.phase === "up";
  // Through a door mid-way through a fast-travel ride: the ride ends here. Left running, it
  // would carry on when the child came back out — dragging them on foot, through walls, on to
  // the next waypoint, with the mount left at the door. The scene drops its run when it sees
  // `travelling` gone; the frame hears the ride stop, so its banner comes down.
  if (ride.travelling) {
    const to = ride.travelDest;
    ride.travelling = false;
    ride.travelDest = null;
    ride.stop = false;
    ride.away.current = false;
    if (to !== null) ride.onTravel("stop", to);
  }
  ride.phase = "off";
  ride.t = 0;
  ride.seat = 0;
  ride.speed = 0;
  ride.hold = false;
  ride.want = null;
  ride.parked.on = true;
  ride.parked.x = ride.at.x + dx;
  ride.parked.z = ride.at.z + dz;
  ride.parked.yaw = ride.at.yaw;
  if (was) ride.onRiding(false);
  return was;
}

/** What one frame of the state machine did, for the scene to react to. */
export type RideEvent = "mounted" | "dismounted" | "refused-deep" | null;

/**
 * One frame. Eats a pending `want`, runs the mount-up and dismount moments, and keeps `seat`,
 * `speed` and `hold` true to the phase. `depth` is the water the hero is standing in. The camera
 * value is eased by the scene, which knows whether a fast-travel ride is running.
 */
export function stepRide(ride: RideBus, dt: number, depth: number): RideEvent {
  let event: RideEvent = null;
  const m = ride.mount;
  if (!m) {
    ride.want = null;
    return null;
  }
  if (ride.want !== null) {
    const want = ride.want;
    ride.want = null;
    if (want && ride.phase === "off") {
      ride.phase = "up";
      ride.t = 0;
      ride.onRiding(true);
      ride.sound.onMoment("up");
    } else if (!want && ride.phase === "on") {
      if (!canGetDown(depth)) {
        event = "refused-deep";
      } else {
        ride.phase = "down";
        ride.t = 0;
        ride.sound.onMoment("down");
      }
    }
  }
  const upS = ride.calm ? CALM_MOMENT_S : MOUNT_UP_S;
  const downS = ride.calm ? CALM_MOMENT_S : DISMOUNT_S;
  if (ride.phase === "up") {
    ride.t += dt;
    ride.seat = Math.min(1, ride.t / upS);
    if (ride.t >= upS) {
      ride.phase = "on";
      ride.seat = 1;
      event = "mounted";
    }
  } else if (ride.phase === "down") {
    ride.t += dt;
    ride.seat = Math.max(0, 1 - ride.t / downS);
    if (ride.t >= downS) {
      ride.phase = "off";
      ride.seat = 0;
      ride.parked.on = true;
      event = "dismounted";
      ride.onRiding(false);
    }
  }
  ride.speed = ride.phase === "on" ? rideSpeed(m) : 0;
  ride.hold = ride.phase === "up" || ride.phase === "down" || ride.travelling;
  return event;
}

/**
 * The mover's pace, riding or walking: the walk's `base`, the water's cost, and a mount's carry
 * through the air. `walkWade` is the walk's own water rule (`wadeSpeed`), passed in so this file
 * never disagrees with it.
 */
export function pace(ride: RideBus | null | undefined, base: number, depth: number, airborne: boolean, walkWade: (d: number) => number): number {
  if (ride && ride.speed > 0) return ride.speed * rideWade(depth) * (airborne ? MOUNT_AIR_CARRY : 1);
  return base * walkWade(depth);
}

/** How deep the mover may wade right now. */
export function wadeLimit(ride: RideBus | null | undefined): number {
  return ride && ride.phase !== "off" ? RIDE_WADE_DEPTH : WADE_DEPTH;
}

/** The mover's radius right now. */
export function rideRadius(ride: RideBus | null | undefined, walk: number): number {
  return ride && ride.phase !== "off" ? RIDE_RADIUS : walk;
}

/** The jump's impulse: a walk's, or a mount's. */
export function jumpSpeed(ride: RideBus | null | undefined, walk: number): number {
  return ride && ride.phase === "on" ? MOUNT_JUMP_SPEED : walk;
}

/**
 * Which way the body faces while moving. Walking, `moveIntent`'s rule (a child strafes, still
 * facing where the camera looks). Riding, an animal does not crab sideways: it turns and goes
 * the way it is going — except backing up, which it does facing forward.
 */
export function rideFace(ride: RideBus | null | undefined, intent: { x: number; z: number; face: number; back: boolean }): number {
  if (ride && ride.phase === "on" && !intent.back) return Math.atan2(intent.x, intent.z);
  return intent.face;
}

/** Set a jump's impulse (the mover's vertical state is written through a function, never a prop). */
export function boostJump(v: { vy: number }, speed: number): void {
  v.vy = speed;
}

/** Where the camera wants to be: 0 walking, 1 riding, 2 on a fast-travel ride. */
export function camGoal(ride: RideBus): number {
  if (ride.travelling) return 2;
  return ride.seat;
}

/** The camera's rise and pull for a `cam` value, written into `out`. */
export function camOffsets(cam: number, out: { lift: number; pull: number }): { lift: number; pull: number } {
  const ride = Math.min(1, cam);
  const travel = Math.max(0, cam - 1);
  out.lift = ride * RIDE_CAM_LIFT + travel * (TRAVEL_CAM_LIFT - RIDE_CAM_LIFT);
  out.pull = ride * RIDE_CAM_PULL + travel * (TRAVEL_CAM_PULL - RIDE_CAM_PULL);
  return out;
}

/* ------------------------------------------------------------------ remembering places */

/** The key a child's visited places are kept under on this device. */
export function visitedKey(childId: string): string {
  return `realm3d:visited:${childId}`;
}

/** A stored list, read defensively: anything that is not a list of strings is nothing. */
export function readVisited(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 64) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ never left embedded */

/** How fast an embedded mover is eased out, at the least (units a second). */
const SETTLE_SPEED = 3;
const SETTLE_TO: Pt = { x: 0, z: 0 };

/**
 * One frame of easing a mover out of anything solid their body has grown into where they stood
 * — the mount-up moment is the one that does it: the radius goes from a child's 0.55 to a
 * mount's 0.8 while they stand touching a wall or a trunk. The solver already never FREEZES
 * anyone who is embedded (`slideMove` lets them out); this puts them clear, over the moment,
 * so the mount is never drawn half through a wall. Writes into `out`; a mover who is not
 * embedded (or is standing on top of the thing) is left exactly where they are.
 */
export function settleRider(out: Pt, x: number, z: number, feetY: number, solids: readonly Collider[], r: number, dt: number): Pt {
  out.x = x;
  out.z = z;
  if (!buried(solids, x, z, feetY, r, 0.005)) return out;
  freeSpot(SETTLE_TO, x, z, solids, r);
  const dx = SETTLE_TO.x - x;
  const dz = SETTLE_TO.z - z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const step = Math.max(SETTLE_SPEED * dt, d * Math.min(1, dt * 10));
  if (d <= step) {
    out.x = SETTLE_TO.x;
    out.z = SETTLE_TO.z;
  } else {
    out.x = x + (dx / d) * step;
    out.z = z + (dz / d) * step;
  }
  return out;
}

/**
 * Wherever the mount was parked (a fixed step to the side of a door, the spot a child got off),
 * never INSIDE something: moved to the nearest clear ground for a mount's body. The scene runs
 * this when the parked spot changes, before it draws the mount there.
 */
export function clearPark(ride: RideBus, solids: readonly Collider[]): void {
  const pk = ride.parked;
  if (!pk.on) return;
  freeSpot(SETTLE_TO, pk.x, pk.z, solids, RIDE_RADIUS);
  pk.x = SETTLE_TO.x;
  pk.z = SETTLE_TO.z;
}
