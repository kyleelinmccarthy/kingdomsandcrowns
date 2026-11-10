/**
 * THE RIDDLE STONES: one standing stone at each of the five named places, where E reads a short
 * review run — three riddles from what the hero has already learned (`actions/review.ts`).
 *
 * Pure data. Each stone stands at its place's position plus `offset`, chosen so it is clear of
 * the place's own furnishing (the ring, the cairn, the boat, the scarecrow, the cart), off the
 * track that arrives there, out of the hitching post's reach, and on dry ground —
 * `riddle-stones.test.ts` holds every one of them to that. The Ringstones' stands inside the
 * circle, across from the doorway: the track fills the side toward the village.
 *
 * `line` is what is carved on it, shown on the stone's board under its title.
 */

import type { Collider } from "@/lib/realm3d/collision";
import { placeById } from "./layout";

export type RiddleStone = { placeId: string; offset: { x: number; z: number }; line: string };

export const RIDDLE_STONES: readonly RiddleStone[] = [
  { placeId: "ringstones", offset: { x: -4.6, z: 0 }, line: "Moss fills the old letters, but they still read true." },
  { placeId: "highcairn", offset: { x: 6, z: 2 }, line: "The wind has worn it smooth, but the riddles stay." },
  { placeId: "longwater", offset: { x: 0, z: 6.5 }, line: "Its letters shine wet, as if the lake wrote them." },
  { placeId: "farfurrow", offset: { x: -3, z: -5 }, line: "Someone ploughs round it every year, and never moves it." },
  { placeId: "appleway", offset: { x: -3.5, z: -6 }, line: "Carved at the road's end, for anyone who walks this far." },
];

/** The stone's footprint radius: what E's reach is measured from, and what the hero is stopped by. */
export const RIDDLE_STONE_RADIUS = 0.6;

const BY_PLACE = new Map(RIDDLE_STONES.map((s) => [s.placeId, s]));

export function riddleStoneById(placeId: string): RiddleStone | null {
  return BY_PLACE.get(placeId) ?? null;
}

/** Where a place's stone stands. Throws for a place without one: that is a typo, not a state. */
export function riddleStonePosition(placeId: string): { x: number; z: number } {
  const stone = BY_PLACE.get(placeId);
  const place = placeById(placeId);
  if (!stone || !place) throw new Error(`No riddle stone at ${placeId}`);
  return { x: place.position.x + stone.offset.x, z: place.position.z + stone.offset.z };
}

/** Every stone where it stands, built once: what the scene draws and E reaches (`buildSpots`' `stones`). */
export const RIDDLE_STONE_SPOTS: readonly { placeId: string; x: number; z: number }[] = RIDDLE_STONES.map((s) => ({ placeId: s.placeId, ...riddleStonePosition(s.placeId) }));

/** How tall a stone stands above the ground. */
export const RIDDLE_STONE_HEIGHT = 2.2;

/** What stops the hero at each stone: a round solid on the ground it stands on. */
export function riddleStoneColliders(heightAt: (x: number, z: number) => number): Collider[] {
  return RIDDLE_STONE_SPOTS.map((s) => {
    const ground = heightAt(s.x, s.z);
    return { x: s.x, z: s.z, hw: RIDDLE_STONE_RADIUS, hd: RIDDLE_STONE_RADIUS, round: true, base: ground - 1, top: ground + RIDDLE_STONE_HEIGHT };
  });
}
