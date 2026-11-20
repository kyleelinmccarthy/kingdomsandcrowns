/**
 * THE WORLD'S LOCKS: the chests and vault doors a hero opens by solving a puzzle, and what they
 * give. Pure data and rules, client-safe; the one record of where each stands (and the decorations
 * they leave at set spots) so the scene, the interact spots, the server and the tests all read the
 * same table. `world-objects.test.ts` holds every spot to the clearance rules of the village.
 *
 *   chests   stand at fixed village spots and in two rooms, and refill every `CHEST_RESET_DAYS`.
 *            Each opening gives the first reward in its list the hero does not yet own (`nextRewards`).
 *   doors    stand beside the five authored places and open once, giving everything at once:
 *            a map to a generated place and the lore page that tells of it.
 *
 * Rewards are never materials. A decoration stands at its own fixed spot in the village (`DECOR`),
 * a lore page goes into the Chronicle (`lore.ts`), and a fragment is a generated place id the hero
 * now has on their map.
 */

import { CHEST_LABEL, DOOR_LABEL } from "@/lib/utils/world-lock-copy";
import type { RoomKind } from "@/lib/realm3d/doorways";
import { placeById } from "./layout";
import type { LoreId } from "./lore";

/** A chest locks again this many local days after it was opened. */
export const CHEST_RESET_DAYS = 7;

/** A chest's or door's footprint radius, and how far from its edge a hero may stand and open it: what E's reach is measured from. */
export const LOCK_SPOT = { radius: 0.6, reach: 1.8 } as const;

export type DecorId =
  | "stone-bench"
  | "sundial"
  | "flower-cart"
  | "bird-bath"
  | "weather-vane"
  | "hay-bales"
  | "scarecrow"
  | "barrel-stack"
  | "herb-planter"
  | "story-post";

/** Where each decoration stands once found, and how it faces. `label` is what a reward line calls it. */
export const DECOR: Readonly<Record<DecorId, { label: string; x: number; z: number; ry: number }>> = {
  "stone-bench": { label: "a stone bench", x: -18, z: 8, ry: Math.PI / 2 },
  sundial: { label: "a sundial", x: -20.5, z: 16, ry: 0 },
  "flower-cart": { label: "a flower cart", x: 18.5, z: 6.5, ry: -Math.PI / 2 },
  "bird-bath": { label: "a bird bath", x: 20.5, z: 13.5, ry: 0 },
  // Moved from (19, -5): a wild bush stood on its square.
  "weather-vane": { label: "a weather vane", x: 18.25, z: -5, ry: 0 },
  "hay-bales": { label: "a stack of hay bales", x: 22, z: 1.5, ry: 0 },
  scarecrow: { label: "a scarecrow", x: 5, z: 17, ry: Math.PI },
  "barrel-stack": { label: "a stack of barrels", x: -3.25, z: 26.5, ry: 0 },
  "herb-planter": { label: "an herb planter", x: 7.5, z: -10.25, ry: 0 },
  "story-post": { label: "a story post", x: -15, z: -31, ry: 0 },
};

export const DECOR_IDS = Object.keys(DECOR) as DecorId[];

export type WorldReward = { kind: "decor"; id: DecorId } | { kind: "lore"; id: LoreId } | { kind: "fragment"; placeId: string };

/** A reward's name in the set of what a hero owns: `decor:<id>` and `lore:<id>` are their world-state rows, `place:<id>` their found place. */
export function rewardKey(r: WorldReward): string {
  return r.kind === "fragment" ? `place:${r.placeId}` : `${r.kind}:${r.id}`;
}

export type WorldObject = {
  /** `chest:<name>` or `door:<place>`. */
  id: string;
  type: "chest" | "door";
  label: string;
  /** In the world, or local to the room when `room` is set. */
  x: number;
  z: number;
  /** The turn about the vertical (0 faces +z). */
  ry: number;
  room?: RoomKind;
  /** A chest refills this many local days after it opens; a door, with none, stays open for good. */
  resetAfterDays?: number;
  /** The area the lock's puzzle draws from (`worldLockSkill`). */
  draws: "logic" | "language" | "science";
  /** In the order given. */
  rewards: readonly WorldReward[];
};

const decor = (id: DecorId): WorldReward => ({ kind: "decor", id });
const lore = (id: LoreId): WorldReward => ({ kind: "lore", id });

type ChestSpec = { name: string; x: number; z: number; ry: number; room?: RoomKind; draws: WorldObject["draws"]; rewards: readonly WorldReward[] };

const CHESTS: readonly ChestSpec[] = [
  { name: "west-lane", x: -19.5, z: 12, ry: Math.PI / 2, draws: "logic", rewards: [decor("stone-bench"), decor("sundial"), lore("the-first-lock")] },
  { name: "east-lane", x: 19.5, z: 10, ry: -Math.PI / 2, draws: "logic", rewards: [decor("flower-cart"), decor("bird-bath"), lore("the-locksmith")] },
  { name: "castle-back", x: 14.25, z: -41, ry: 0, draws: "logic", rewards: [decor("weather-vane"), decor("hay-bales"), lore("the-castle-cellar")] },
  // The room chests face the room's middle.
  { name: "library", x: 2, z: 3, ry: Math.atan2(-2, -3), room: "library", draws: "language", rewards: [decor("story-post"), decor("barrel-stack"), lore("the-scribes-cipher")] },
  { name: "garden", x: 0, z: 1, ry: Math.PI, room: "garden", draws: "science", rewards: [decor("herb-planter"), decor("scarecrow"), lore("the-glasshouse-key")] },
];

/**
 * Where each vault door stands from its place's centre, and the page and map it gives. Chosen so
 * the door is on dry ground, off the track that arrives there, away from the place's own furnishing
 * and out of reach of everything else E acts on; the tests hold every door to that. A door faces
 * its place.
 */
const DOORS: readonly { place: string; offset: { x: number; z: number }; fragment: string; lore: LoreId }[] = [
  // Moved from (0, 7): a standing stone of the wild stood within a step of it.
  { place: "ringstones", offset: { x: -2, z: 5 }, fragment: "summit-7", lore: "ringstones-map" },
  { place: "highcairn", offset: { x: -6, z: 3 }, fragment: "summit-6", lore: "highcairn-map" },
  { place: "longwater", offset: { x: 7, z: 0 }, fragment: "cove-12", lore: "longwater-map" },
  { place: "farfurrow", offset: { x: 3, z: 6 }, fragment: "deepwood-10", lore: "farfurrow-map" },
  { place: "appleway", offset: { x: 5, z: -3 }, fragment: "deepwood-9", lore: "appleway-map" },
];

function doorObject(d: (typeof DOORS)[number]): WorldObject {
  const place = placeById(d.place);
  if (!place) throw new Error(`No place ${d.place} for its vault door`);
  return {
    id: `door:${d.place}`,
    type: "door",
    label: DOOR_LABEL,
    x: place.position.x + d.offset.x,
    z: place.position.z + d.offset.z,
    // `|| 0` keeps a zero offset from turning the half-turn into its negative.
    ry: Math.atan2(-d.offset.x || 0, -d.offset.z || 0),
    draws: "logic",
    rewards: [{ kind: "fragment", placeId: d.fragment }, lore(d.lore)],
  };
}

export const WORLD_OBJECTS: readonly WorldObject[] = [
  ...CHESTS.map(
    (c): WorldObject => ({
      id: `chest:${c.name}`,
      type: "chest",
      label: CHEST_LABEL,
      x: c.x,
      z: c.z,
      ry: c.ry,
      ...(c.room ? { room: c.room } : {}),
      resetAfterDays: CHEST_RESET_DAYS,
      draws: c.draws,
      rewards: c.rewards,
    })
  ),
  ...DOORS.map(doorObject),
];

const BY_ID: ReadonlyMap<string, WorldObject> = new Map(WORLD_OBJECTS.map((o) => [o.id, o]));

/** The object with this id, or null: own entries only, so "toString" and "__proto__" are nothing. */
export function worldObjectById(id: string | null | undefined): WorldObject | null {
  return typeof id === "string" ? (BY_ID.get(id) ?? null) : null;
}

export function isWorldObjectId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
