/**
 * THE WAY IN, AND THE WAY BACK OUT — which buildings have an inside, where their doors are on the
 * island, and where a child stands when they come back out of one.
 *
 * The owner, twice: "i cant really enter them - like i go into them but then i just disappear",
 * and "I can't seem to go into any buildings including my own castle". The disappearing was the
 * hero walking into a house that had no collision and being swallowed by its walls; the
 * collision wave fixed that by making every raised building a solid shell. This file is the
 * other half: a raised building now HAS an inside, and the door is how you get there.
 *
 * ## How a child goes in
 *
 * Both ways a child would try, because the owner's own words were "I go into them":
 *
 *   - WALK INTO THE DOOR. Pushing into a lit doorway for a moment takes you in (`doorAhead`).
 *     The door of every house is right behind its villager, so E at the door usually means
 *     "talk to Old Bram" — and a child who is ignored when they walk at a door will conclude,
 *     correctly, that the door is painted on.
 *   - E AT THE BUILDING, from anywhere round it, when nobody is standing in the way. The prompt
 *     says "Go into the Chapel", so what E will do is never a surprise.
 *
 * Only a RAISED building has an inside. A site still going up is a floor with scaffolding over
 * it, so E there still opens its villager's conversation. The well has no inside: it is a
 * shaft of water with a roof over it, and "going into the well" is falling down it.
 *
 * ## How a child comes back out
 *
 * Out of the same door, a step clear of it, FACING AWAY from it so the first press of W walks
 * them into the village rather than back through the wall — and never inside a wall, a villager
 * or anything else solid (`exitSpot`, which is tested against every door in the village).
 *
 * Not a three.js module. Nothing here allocates per frame except `buildDoors`, which runs once.
 */

import { pushOut, overlaps, HERO_RADIUS, type Collider, type Pt } from "./collision";
import type { InteractTarget } from "./hud-bus";

/** Every kind of room there is. The castle's is its great hall. */
export type RoomKind = "mill" | "bridge" | "chapel" | "market" | "library" | "watchtower" | "garden" | "castle";

/** Building id → the room inside it. The well is deliberately absent: it has no inside. */
export const ROOM_OF: Readonly<Record<string, RoomKind>> = {
  mill: "mill",
  bridge: "bridge",
  chapel: "chapel",
  market: "market",
  library: "library",
  watchtower: "watchtower",
  garden: "garden",
};

export function hasRoom(buildingId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROOM_OF, buildingId);
}

/** Where a child is while they are indoors: the room, and the door (site id or "castle") they came in by. */
export type RoomVisit = { room: RoomKind; site: string };

/**
 * What E (or walking into a door) at this target leads into, or null for "it has no inside, do
 * what E always did". A site must be RAISED and have a room; the castle must be the child's.
 */
export function roomFor(
  target: Pick<InteractTarget, "kind" | "id">,
  buildings: readonly { id: string; complete: boolean }[],
  castleUnlocked: boolean,
): RoomVisit | null {
  if (target.kind === "castle") return castleUnlocked ? { room: "castle", site: "castle" } : null;
  if (target.kind !== "site") return null;
  const room = ROOM_OF[target.id];
  if (!room) return null;
  const b = buildings.find((x) => x.id === target.id);
  return b?.complete ? { room, site: target.id } : null;
}

/** The E prompt's verb for a raised building a child can go into. */
export const ENTER_VERB = "Go into";

/* ------------------------------------------------------------------ doors */

/**
 * A door on the island. Every door faces SOUTH (+z): the houses were drawn with their doors on
 * their local +z face and nothing in the village is turned, and the castle's gate faces the road.
 * `face` is the z of the solid face the hero is stopped at, so "at the door" is exact.
 */
export type Door = {
  site: string;
  room: RoomKind;
  /** Centre of the doorway, and the z of the face the hero presses against. */
  x: number;
  face: number;
  /** Half the doorway's width: how far off its middle a push still counts. */
  hw: number;
};

type DoorProp = { id: string; kind: string; position: { x: number; z: number }; size: { w: number; d: number } };

export type DoorInput = {
  props: readonly DoorProp[];
  /** How much wider on the ground the scene re-plots every village site. */
  sitePlan: number;
  /** The castle's gate, in world space, or null when there is no castle to go into. */
  castle: { x: number; face: number; hw: number } | null;
};

/**
 * How far out the solid face of each kind of building is, as a fraction of its re-plotted depth.
 * These are the SAME numbers `buildColliders` uses for its solids — a door is only a door if the
 * hero can actually reach it, and the hero is stopped at exactly the solid's face.
 */
function faceHalf(id: string, d: number): number {
  if (id === "watchtower") return d / 2;
  if (id === "garden") return (d * 1.05) / 2;
  return (d * 1.06) / 2;
}

/** Half the width of each doorway as drawn, plus a little: a push near the frame still counts. */
function doorHalfWidth(id: string): number {
  if (id === "garden") return 1.0;
  if (id === "watchtower") return 0.8;
  return 0.85;
}

export function buildDoors(input: DoorInput): Door[] {
  const out: Door[] = [];
  for (const p of input.props) {
    if (p.kind !== "building") continue; // a site going up has no inside yet
    const room = ROOM_OF[p.id];
    if (!room) continue;
    const d = p.size.d * input.sitePlan;
    out.push({ site: p.id, room, x: p.position.x, face: p.position.z + faceHalf(p.id, d), hw: doorHalfWidth(p.id) });
  }
  if (input.castle) out.push({ site: "castle", room: "castle", x: input.castle.x, face: input.castle.face, hw: input.castle.hw });
  return out;
}

/**
 * How close the hero's body must be to a door's face for a push to count. The solver stops them
 * anywhere up to one frame's step short of it (it drops a blocked step whole), and on a slow
 * machine a step is half a unit — so the band is a step wide, not a hair.
 */
export const DOOR_BAND = 0.65;
/** How squarely into the door the walk must be: cos of about 50°, so a slide along the wall never counts. */
export const DOOR_PUSH = 0.64;
/** How long the push has to last, in seconds. Long enough to be meant, short enough to feel instant. */
export const DOOR_DWELL = 0.14;

/**
 * The index of the door the hero at (x, z), walking along (mx, mz), is pushing into — or -1.
 * Doors face +z, so "into" is walking toward -z. `(mx, mz)` is the unit walk direction (0, 0 when
 * standing), not the step actually taken: a hero pressed against a door does not move at all.
 */
export function doorAhead(doors: readonly Door[], x: number, z: number, mx: number, mz: number, r: number = HERO_RADIUS): number {
  if (-mz < DOOR_PUSH) return -1;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (Math.abs(x - d.x) > d.hw) continue;
    const gap = z - r - d.face; // 0 when the body touches the face
    if (gap > -0.2 && gap < DOOR_BAND) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ out again */

/** How far in front of the face a child comes out: clear of the door, still on its step. */
export const EXIT_GAP = 1.0;
/** How far from anyone standing outside the door the child is put. Villagers are not solid. */
export const EXIT_CLEAR = 1.25;

/**
 * Where to put a child who has just come out of `door`, and which way they face: out of the
 * doorway, facing away from it (0 is +z, into the village), in the first of a few spots just
 * outside it that touches nothing solid and stands clear of anyone waiting at the door. Writes
 * into `out`; the spots are tried straight out first, then a step to either side.
 */
export function exitSpot(
  out: { x: number; z: number; face: number },
  door: Door,
  solids: readonly Collider[],
  avoid: readonly Pt[] = [],
  r: number = HERO_RADIUS,
): { x: number; z: number; face: number } {
  const z0 = door.face + r + EXIT_GAP;
  const tries: [number, number][] = [
    [0, 0],
    [1.3, 0],
    [-1.3, 0],
    [0, 1.2],
    [1.3, 1.2],
    [-1.3, 1.2],
    [2.4, 0.6],
    [-2.4, 0.6],
  ];
  out.face = 0;
  for (const [dx, dz] of tries) {
    const x = door.x + dx;
    const z = z0 + dz;
    if (blocked(solids, x, z, r)) continue;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < EXIT_CLEAR)) continue;
    out.x = x;
    out.z = z;
    return out;
  }
  // Nothing clean near the door (a village that grew something across its step): the nearest
  // free ground to the first spot. Never inside a wall.
  const free = freeSpot({ x: 0, z: 0 }, door.x, z0, solids, r);
  out.x = free.x;
  out.z = free.z;
  return out;
}

function blocked(solids: readonly Collider[], x: number, z: number, r: number): boolean {
  for (let i = 0; i < solids.length; i++) if (overlaps(solids[i], x, z, r)) return true;
  return false;
}

/**
 * The nearest point to (x, z) where a hero of radius `r` touches nothing solid. `pushOut` first
 * (the shortest way out of whatever they are in), and if that lands them in something else — two
 * buildings close together — a widening ring of candidates until one is clear. Never returns a
 * point inside a solid unless the whole neighbourhood is solid, which the village never is.
 */
export function freeSpot(out: Pt, x: number, z: number, solids: readonly Collider[], r: number = HERO_RADIUS): Pt {
  if (!blocked(solids, x, z, r)) {
    out.x = x;
    out.z = z;
    return out;
  }
  pushOut(out, x, z, solids, r);
  if (!blocked(solids, out.x, out.z, r)) return out;
  for (let ring = 1; ring <= 24; ring++) {
    const rad = ring * 0.5;
    const n = 8 + ring * 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const cx = x + Math.sin(a) * rad;
      const cz = z + Math.cos(a) * rad;
      if (!blocked(solids, cx, cz, r)) {
        out.x = cx;
        out.z = cz;
        return out;
      }
    }
  }
  return out;
}

/**
 * True when a hero standing at (x, z) with their feet at `feetY` is INSIDE something solid they
 * could not have walked into — the one state that makes a child "just disappear". `slack` shrinks
 * the hero a little, so a hero legitimately touching a wall (the solver leaves them exactly at
 * the edge) never counts.
 */
export function buried(solids: readonly Collider[], x: number, z: number, feetY: number, r: number = HERO_RADIUS, slack = 0.12): boolean {
  for (let i = 0; i < solids.length; i++) {
    const c = solids[i];
    if (feetY >= c.top - 0.3) continue; // standing on it, not in it
    if (overlaps(c, x, z, r - slack)) return true;
  }
  return false;
}
