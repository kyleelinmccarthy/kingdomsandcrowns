import type { GameIconName } from "@/components/game-icon";

export type Building = { id: string; label: string; description: string; deedsToBuild: number; icon: GameIconName };

/** Deeds raise these in order of story, not difficulty; any building can be worked at any time. */
export const BUILDINGS: Building[] = [
  { id: "well", label: "Village Well", description: "Clean water for every doorstep.", deedsToBuild: 5, icon: "box" },
  { id: "mill", label: "Grain Mill", description: "Flour for the baker's ovens.", deedsToBuild: 5, icon: "compass" },
  { id: "bridge", label: "River Bridge", description: "A crossing that holds in any weather.", deedsToBuild: 5, icon: "link" },
  { id: "chapel", label: "Chapel", description: "A quiet place with a bell that carries.", deedsToBuild: 5, icon: "temple" },
  { id: "market", label: "Market Square", description: "Stalls, songs, and the smell of bread.", deedsToBuild: 5, icon: "gift" },
  { id: "library", label: "Library", description: "Every scroll in the realm, shelved and safe.", deedsToBuild: 5, icon: "book" },
  { id: "watchtower", label: "Watchtower", description: "Eyes on the hills and a lantern at night.", deedsToBuild: 5, icon: "watchtower" },
  { id: "garden", label: "Royal Garden", description: "Herbs, bees, and a bench in the sun.", deedsToBuild: 5, icon: "flower" },
];

export function findBuilding(id: string): Building | null {
  return BUILDINGS.find((b) => b.id === id) ?? null;
}

export function buildingProgress(deedsDone: number, building: Building): { done: number; total: number; complete: boolean } {
  const done = Math.min(Math.max(0, deedsDone), building.deedsToBuild);
  return { done, total: building.deedsToBuild, complete: done >= building.deedsToBuild };
}
