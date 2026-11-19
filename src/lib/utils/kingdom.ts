import type { GameIconName } from "@/components/game-icon";

export type Building = { id: string; label: string; description: string; deedsToBuild: number; icon: GameIconName };

/**
 * Deeds raise these in order of story, not difficulty; any building can be worked at any time.
 * `deedsToBuild` is the number of the building's stories, written out rather than derived (D13.1):
 * `kingdom.test.ts` guards it, so adding a story is a deliberate edit here, and `raised` keeps any
 * building already standing from falling back down.
 */
export const BUILDINGS: Building[] = [
  { id: "well", label: "Village Well", description: "Clean water for every doorstep.", deedsToBuild: 3, icon: "box" },
  { id: "mill", label: "Grain Mill", description: "Flour for the baker's ovens.", deedsToBuild: 3, icon: "compass" },
  { id: "bridge", label: "River Bridge", description: "A crossing that holds in any weather.", deedsToBuild: 2, icon: "link" },
  { id: "chapel", label: "Chapel", description: "A quiet place with a bell that carries.", deedsToBuild: 3, icon: "temple" },
  { id: "market", label: "Market Square", description: "Stalls, songs, and the smell of bread.", deedsToBuild: 2, icon: "gift" },
  { id: "library", label: "Library", description: "Every scroll in the realm, shelved and safe.", deedsToBuild: 3, icon: "book" },
  { id: "watchtower", label: "Watchtower", description: "Eyes on the hills and a lantern at night.", deedsToBuild: 2, icon: "watchtower" },
  { id: "garden", label: "Royal Garden", description: "Herbs, bees, and a bench in the sun.", deedsToBuild: 2, icon: "flower" },
];

export function findBuilding(id: string): Building | null {
  return BUILDINGS.find((b) => b.id === id) ?? null;
}

/**
 * Where one site stands. `distinctDone` is how many of the building's CURRENT stories the hero has
 * finished with a star; `runsDone` is every side-quest run ever finished there (display only, D13.3);
 * `raised` is whether the building was ever completed (`kingdom_progress.completed_at` is set).
 */
export type SiteTally = { distinctDone: number; runsDone: number; raised: boolean };

/**
 * The one place a building's progress is decided (D13.2, D13.4): each story once raises it, replaying
 * a story is practice, and a raised building stays raised whatever any later count says.
 */
export function buildingProgress(tally: SiteTally, building: Building): { done: number; total: number; complete: boolean } {
  const total = building.deedsToBuild;
  const complete = tally.raised || tally.distinctDone >= total;
  const done = complete ? total : Math.min(Math.max(0, tally.distinctDone), total);
  return { done, total, complete };
}
