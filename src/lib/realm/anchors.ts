/**
 * THE VILLAGE'S ANCHORS: the fourteen places a reading clue can lead to (slice 5, reading trails).
 * A child reads a clue, walks to the place it describes and searches there. Pure, client-safe data,
 * the one record of what each place is called, which words name it and where its search stake
 * stands, so the scene, the picture-run map, the server and the content tests all read one table.
 *
 * Every anchor looks the same to every child. A building site is named by what it is, who keeps it
 * and what it is for, at every build stage; the castle gate and the Puzzle Tower's base are always
 * drawn; the four small objects are always drawn, in every palette, and are never solid. Not
 * anchors: the hitching post and the Ring's arch (drawn only while riding and recess are on),
 * scenery (hidden in the calm palette) and reward decorations and chests (they differ per child).
 *
 * Ids are `landmark:<id>` for something already in the village and `object:<id>` for one of the four
 * new objects. They are never renamed or reused: stored runs hold them.
 *
 * A stake is where E searches. `anchors.test.ts` holds every one to the village's clearance rules,
 * and no other spot's reach holds a stake and no stake's reach holds another spot.
 */

import type { GameIconName } from "@/components/game-icon";

export type AnchorId =
  | "landmark:well"
  | "landmark:mill"
  | "landmark:bridge"
  | "landmark:chapel"
  | "landmark:market"
  | "landmark:library"
  | "landmark:watchtower"
  | "landmark:garden"
  | "landmark:castle-gate"
  | "landmark:puzzle-tower"
  | "object:notice-board"
  | "object:water-trough"
  | "object:beehives"
  | "object:hay-cart";

export type ObjectAnchorId = Extract<AnchorId, `object:${string}`>;

export type Anchor = {
  id: AnchorId;
  kind: "landmark" | "object";
  /** What a child is told: "the mill". */
  label: string;
  /** The words that name it, lower case; the validator keeps a clue from saying them where it must not. */
  names: readonly string[];
  icon: GameIconName;
  /** Where the search stake stands, in the world. */
  x: number;
  z: number;
  /** A small object's own place and turn about the vertical (0 faces +z). */
  object?: { x: number; z: number; ry: number };
};

const landmark = (id: string, label: string, names: readonly string[], icon: GameIconName, x: number, z: number): Anchor => ({ id: `landmark:${id}` as AnchorId, kind: "landmark", label, names, icon, x, z });
const small = (id: string, label: string, names: readonly string[], icon: GameIconName, x: number, z: number, object: { x: number; z: number; ry: number }): Anchor => ({
  id: `object:${id}` as AnchorId,
  kind: "object",
  label,
  names,
  icon,
  x,
  z,
  object,
});

/**
 * In catalog order. A building's stake stands 2.2 past the north edge of its drawn site (never on
 * the front, where its villager stands), on the slot's own x; the others stand within 3.5 of what
 * they name.
 */
const CATALOG: readonly Anchor[] = [
  landmark("well", "the well", ["well"], "box", -4.5, 3.5),
  landmark("mill", "the mill", ["mill"], "compass", 5.0, 4.1),
  landmark("bridge", "the bridge", ["bridge"], "link", -14.5, -4.5),
  landmark("chapel", "the chapel", ["chapel"], "temple", 14.0, -15.0),
  landmark("market", "the market", ["market"], "gift", -7.5, -8.0),
  landmark("library", "the library", ["library"], "book", 8.5, -9.5),
  landmark("watchtower", "the watchtower", ["watchtower", "watch tower"], "watchtower", -11.0, -13.7),
  landmark("garden", "the garden", ["garden"], "flower", 13.5, -3.0),
  landmark("castle-gate", "the castle gate", ["castle gate", "castle"], "castle", 1.5, -9.25),
  landmark("puzzle-tower", "the Puzzle Tower", ["puzzle tower"], "lock", 25.5, 18.8),
  small("notice-board", "the notice board", ["notice board", "board"], "scroll", 7.0, 15.6, { x: 7.0, z: 14.5, ry: 0 }),
  small("water-trough", "the water trough", ["water trough", "trough"], "droplet", -3.0, 24.1, { x: -3.0, z: 23.0, ry: 0 }),
  small("beehives", "the beehives", ["beehive", "beehives", "hive", "hives"], "bee", -16.0, 19.6, { x: -16.0, z: 18.5, ry: 0 }),
  small("hay-cart", "the hay cart", ["hay cart", "cart"], "sun", 24.5, 3.85, { x: 24.5, z: 2.75, ry: Math.PI / 2 }),
];

export const ANCHOR_IDS: readonly AnchorId[] = CATALOG.map((a) => a.id);
export const ANCHORS: Readonly<Record<AnchorId, Anchor>> = Object.freeze(Object.fromEntries(CATALOG.map((a) => [a.id, a])) as Record<AnchorId, Anchor>);

/** Whether a value is one of the fourteen ids: own keys only, so "toString" and "__proto__" are nothing. */
export function isAnchorId(x: unknown): x is AnchorId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(ANCHORS, x);
}

export function anchorById(id: string | null | undefined): Anchor | null {
  return isAnchorId(id) ? ANCHORS[id] : null;
}

export function anchorLabel(id: AnchorId): string {
  return ANCHORS[id].label;
}

/** A stake's E spot, the same size at every anchor: round, `radius` across its footprint and `reach` from its edge. */
export const ANCHOR_SPOT = { radius: 0.5, reach: 1.4 } as const;

/** The fourteen stakes as E spots, built once: one module constant, so every reader holds the same array. */
export const ANCHOR_SPOTS: readonly { id: AnchorId; label: string; x: number; z: number }[] = CATALOG.map((a) => ({ id: a.id, label: a.label, x: a.x, z: a.z }));

/** The anchors whose stakes stand within `within` of this one's, nearest first, never itself. */
export function nearAnchors(id: AnchorId, within = 10): AnchorId[] {
  const from = ANCHORS[id];
  const dist = (a: Anchor) => Math.hypot(a.x - from.x, a.z - from.z);
  return CATALOG.filter((a) => a.id !== id && dist(a) <= within)
    .sort((p, q) => dist(p) - dist(q))
    .map((a) => a.id);
}
