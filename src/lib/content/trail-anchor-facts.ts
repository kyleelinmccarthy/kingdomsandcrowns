/**
 * What is always true of each place a clue can lead to: the facts authors write from and blind
 * readers solve against (slice 5, reading trails). Every fact holds for every child, at every build
 * stage and in every palette, so a clue built on one is never wrong for anybody. Pure, client-safe
 * data; `anchors.test.ts` holds the shape (one to three short facts, no grade word).
 */

import type { AnchorId } from "@/lib/realm/anchors";

/** One to three short facts per anchor, in catalog order. A building's come from its `BUILDINGS` line and its keeper. */
export const TRAIL_ANCHOR_FACTS: Readonly<Record<AnchorId, readonly string[]>> = {
  "landmark:well": ["The Village Well gives clean water for every doorstep.", "Old Bram looks after it."],
  "landmark:mill": ["The Grain Mill makes flour for the baker's ovens.", "Miller Tessa looks after it."],
  "landmark:bridge": ["The River Bridge is a crossing that holds in any weather.", "Carpenter Aldo looks after it."],
  "landmark:chapel": ["The Chapel is a quiet place with a bell that carries.", "Sister Wren looks after it."],
  "landmark:market": ["The Market Square has stalls, songs and the smell of bread.", "Crier Pip looks after it."],
  "landmark:library": ["The Library keeps every scroll in the realm, shelved and safe.", "Librarian Hesper looks after it."],
  "landmark:watchtower": ["The Watchtower has eyes on the hills and a lantern at night.", "Mason Gerd looks after it."],
  "landmark:garden": ["The Royal Garden grows herbs and keeps bees, with a bench in the sun.", "Keeper Ivy looks after it."],
  "landmark:castle-gate": ["The way into the castle, at the north end of the road."],
  "landmark:puzzle-tower": ["A tall stone tower of bonus puzzles, at the south-east edge of the village."],
  "object:notice-board": ["Villagers pin up news and notes here.", "It stands by the road in the south of the village."],
  "object:water-trough": ["Animals drink here.", "It is a long wooden trough filled with water, at the south edge of the village."],
  "object:beehives": ["Bees live here and make honey.", "The hives stand at the south-west edge of the village."],
  "object:hay-cart": ["A farm cart piled with hay.", "It stands at the east edge of the village."],
};

/**
 * Pairs of places whose clues can be mistaken for each other: the words they share. A clue that
 * uses one of a pair's shared words must say something that rules the partner out (`parts`, in the
 * trail pool's format), and an author never writes a clue that fits two places.
 */
export const CONFUSABLE_ANCHORS: readonly { anchors: readonly [AnchorId, AnchorId]; shared: readonly string[] }[] = [
  { anchors: ["landmark:well", "object:water-trough"], shared: ["water", "drink", "drinks", "bucket"] },
  { anchors: ["landmark:garden", "object:beehives"], shared: ["bee", "bees", "honey", "flower", "flowers"] },
  { anchors: ["object:notice-board", "landmark:library"], shared: ["note", "notes", "read", "reading", "scroll", "scrolls", "news"] },
];
