/**
 * THE RUNE OBJECTS: the broken cart, the dark lantern and the rest, each wanting a word that does
 * what it needs (slice 6, rune spellcraft). Pure data, client-safe; the one record of what each is
 * called, where it stands and how often it breaks again, so the scene, the E spots, the server and
 * the tests all read the same table. A sibling of the locks' `WORLD_OBJECTS` and not part of it: that
 * table's type is lock-only (`draws`, `rewards`, chest or door) and seven readers treat it as "the
 * locks". What they share is the `realm_world_state` table, the id namespace (`rune:` can never
 * collide with `chest:` or `door:`) and the cycling rule, `heldNow` (`world-state.ts`).
 *
 *   village   ten objects, two per effect, which a language side quest sends the hero to.
 *   places    one at each of the five named places, fixed any time; a side quest never asks for them.
 *
 * Each is fixed by building a word at the rune stone, and stays fixed for that child for
 * `RUNE_RESET_DAYS` local days before it breaks again. They are never solid and always drawn while
 * runes are on, in every palette. `rune-objects.test.ts` holds every one to the clearance rules of
 * the village, and to the reach of everything else E acts on.
 */

import { placeById } from "./layout";

/** What a word does to the object. Five, in this order everywhere. */
export type RuneEffect = "mend" | "light" | "water" | "open" | "grow";
export const RUNE_EFFECT_IDS: readonly RuneEffect[] = ["mend", "light", "water", "open", "grow"];

/**
 * A fixed object breaks again this many local days after its fix (the spec's "a few days"). Half a
 * chest's week, so a hero who plays most days always finds some broken.
 */
export const RUNE_RESET_DAYS = 4;

/** A rune object's footprint radius, and how far from its edge a hero may stand and cast: what E's reach is measured from. */
export const RUNE_SPOT = { radius: 0.6, reach: 1.6 } as const;

export type RuneObject = {
  /** `rune:<name>`. */
  id: `rune:${string}`;
  effect: RuneEffect;
  /** What it is called while broken: "the broken wagon". Starts with "the ", then one state word. */
  label: string;
  /** What it is called once fixed: the label without its state word, "the wagon". */
  fixedLabel: string;
  x: number;
  z: number;
  /** The turn about the vertical (0 faces +z). */
  ry: number;
  /** A named place's id, or null in the village. */
  place: string | null;
  /** It breaks again this many local days after it is fixed. */
  resetAfterDays: number;
};

type VillageSpec = { name: string; effect: RuneEffect; label: string; fixedLabel: string; x: number; z: number; ry: number };

/** Ten, in catalog order. Two of each effect, set round the village in open ground (see the test for how each was held clear). */
const VILLAGE: readonly VillageSpec[] = [
  { name: "west-wagon", effect: "mend", label: "the broken wagon", fixedLabel: "the wagon", x: -17.5, z: 15.0, ry: Math.PI / 2 },
  { name: "east-barrow", effect: "mend", label: "the broken barrow", fixedLabel: "the barrow", x: 10.5, z: 21.0, ry: 0 },
  { name: "lane-lantern", effect: "light", label: "the dark lantern", fixedLabel: "the lantern", x: -6.25, z: 18.5, ry: 0 },
  { name: "yard-brazier", effect: "light", label: "the cold brazier", fixedLabel: "the brazier", x: 16.5, z: 15.75, ry: -Math.PI / 2 },
  { name: "flower-bed", effect: "water", label: "the dry flower bed", fixedLabel: "the flower bed", x: -23.0, z: 6.0, ry: Math.PI / 2 },
  { name: "pumpkin-patch", effect: "water", label: "the dry pumpkin patch", fixedLabel: "the pumpkin patch", x: 19.0, z: -14.0, ry: 0 },
  { name: "shed-hatch", effect: "open", label: "the stuck hatch", fixedLabel: "the hatch", x: -21.5, z: -0.5, ry: Math.PI / 2 },
  { name: "store-shed", effect: "open", label: "the stuck shed", fixedLabel: "the shed", x: 22.0, z: 9.0, ry: -Math.PI / 2 },
  { name: "old-tree", effect: "grow", label: "the wilted tree", fixedLabel: "the tree", x: -18.5, z: 18.5, ry: 0 },
  { name: "lane-vine", effect: "grow", label: "the drooping vine", fixedLabel: "the vine", x: 8.5, z: 18.75, ry: 0 },
];

type PlaceSpec = { name: string; place: string; effect: RuneEffect; label: string; fixedLabel: string };

/** Where each place's object stands from its place's centre, as a vault door's does (`DOORS` in `world-objects.ts`). */
const RUNE_PLACE_OFFSETS: Readonly<Record<string, { x: number; z: number }>> = {
  appleway: { x: -5.75, z: 4.25 },
  ringstones: { x: 2, z: -5 },
  highcairn: { x: 6.5, z: 4.5 },
  longwater: { x: -9.25, z: -4 },
  farfurrow: { x: -5.5, z: -5 },
};

/** Five, in catalog order after the village's. */
const PLACES: readonly PlaceSpec[] = [
  { name: "appleway-cart", place: "appleway", effect: "mend", label: "the broken apple cart", fixedLabel: "the apple cart" },
  { name: "ringstones-oak", place: "ringstones", effect: "grow", label: "the wilted oak", fixedLabel: "the oak" },
  { name: "highcairn-beacon", place: "highcairn", effect: "light", label: "the cold beacon", fixedLabel: "the beacon" },
  { name: "longwater-reeds", place: "longwater", effect: "water", label: "the dry reed bed", fixedLabel: "the reed bed" },
  { name: "farfurrow-gate", place: "farfurrow", effect: "open", label: "the stuck field gate", fixedLabel: "the field gate" },
];

function placeObject(s: PlaceSpec): RuneObject {
  const place = placeById(s.place);
  const offset = RUNE_PLACE_OFFSETS[s.place];
  if (!place || !offset) throw new Error(`No place ${s.place} for its rune object`);
  return {
    id: `rune:${s.name}`,
    effect: s.effect,
    label: s.label,
    fixedLabel: s.fixedLabel,
    x: place.position.x + offset.x,
    z: place.position.z + offset.z,
    // Faces its place. `|| 0` keeps a zero offset from turning the half-turn into its negative.
    ry: Math.atan2(-offset.x || 0, -offset.z || 0),
    place: s.place,
    resetAfterDays: RUNE_RESET_DAYS,
  };
}

export const RUNE_OBJECTS: readonly RuneObject[] = [
  ...VILLAGE.map((v): RuneObject => ({ id: `rune:${v.name}`, effect: v.effect, label: v.label, fixedLabel: v.fixedLabel, x: v.x, z: v.z, ry: v.ry, place: null, resetAfterDays: RUNE_RESET_DAYS })),
  ...PLACES.map(placeObject),
];

/** The ten a language side quest may send a hero to: the village's. */
export const VILLAGE_RUNE_OBJECTS: readonly RuneObject[] = RUNE_OBJECTS.filter((o) => o.place === null);

const BY_ID: ReadonlyMap<string, RuneObject> = new Map(RUNE_OBJECTS.map((o) => [o.id, o]));

/** The object with this id, or null: own entries only, so "toString" and "__proto__" are nothing. */
export function runeObjectById(id: string | null | undefined): RuneObject | null {
  return typeof id === "string" ? (BY_ID.get(id) ?? null) : null;
}

export function isRuneObjectId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
