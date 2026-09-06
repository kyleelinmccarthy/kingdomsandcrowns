import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { Vec2 } from "./layout";

/** The visual half of an avatar config: what the villager wears, never a crest or companion. */
export type VillagerFigureConfig = Pick<AvatarConfig, "skinTone" | "hairStyle" | "hairColor" | "outfit" | "outfitColor" | "legwear" | "legwearColor" | "boots" | "bootsColor" | "accessory" | "accessoryColor">;

export type Villager = { id: string; buildingId: string; name: string; greeting: string; figure: VillagerFigureConfig };

const base: VillagerFigureConfig = {
  skinTone: "medium", hairStyle: "short", hairColor: "#4a3728", outfit: "tunic", outfitColor: "#8c7a6b",
  legwear: "pants", legwearColor: "#4a3728", boots: "leather-boots", bootsColor: "#6b4226", accessory: null, accessoryColor: "#d4a843",
};

/** One villager per building, in BUILDINGS order. Greetings are gentle; the monsters toggle changes deed stories, not greetings. */
export const VILLAGERS: Villager[] = [
  { id: "bram", buildingId: "well", name: "Old Bram", greeting: "The bucket's dry again. Have you a moment for the well?", figure: { ...base, skinTone: "medium-dark", hairStyle: "short", hairColor: "#6b7280", outfit: "tunic", outfitColor: "#5b8fb9" } },
  { id: "tessa", buildingId: "mill", name: "Miller Tessa", greeting: "Sacks everywhere and no one to count them. Lend a hand?", figure: { ...base, skinTone: "light", hairStyle: "bun", hairColor: "#b87333", outfit: "vest", outfitColor: "#b08a5a" } },
  { id: "aldo", buildingId: "bridge", name: "Carpenter Aldo", greeting: "Planks to measure and a river that won't wait. Help me?", figure: { ...base, skinTone: "olive", hairStyle: "curly", hairColor: "#1a1a2e", outfit: "vest", outfitColor: "#8c7a6b", accessory: "bandana", accessoryColor: "#c0563d" } },
  { id: "wren", buildingId: "chapel", name: "Sister Wren", greeting: "The bell wants numbers and the scroll wants reading. Will you?", figure: { ...base, skinTone: "pale", hairStyle: "long", hairColor: "#f0f0f0", outfit: "robe", outfitColor: "#d8cfc0" } },
  { id: "pip", buildingId: "market", name: "Crier Pip", greeting: "Prices, words, and a market that opens at noon. Join me?", figure: { ...base, skinTone: "medium-light", hairStyle: "spiky", hairColor: "#f97316", outfit: "tunic", outfitColor: "#c0563d" } },
  { id: "hesper", buildingId: "library", name: "Librarian Hesper", greeting: "Every scroll has a place. Shall we find them?", figure: { ...base, skinTone: "dark", hairStyle: "braided", hairColor: "#1a1a2e", outfit: "robe", outfitColor: "#6f5a8a", accessory: "glasses", accessoryColor: "#c0c0c0" } },
  { id: "gerd", buildingId: "watchtower", name: "Mason Gerd", greeting: "Stones to count before the lantern's lit. Are you willing?", figure: { ...base, skinTone: "bronze", hairStyle: "short", hairColor: "#4a3728", outfit: "armor", outfitColor: "#7d7d7d" } },
  { id: "ivy", buildingId: "garden", name: "Keeper Ivy", greeting: "The bees have questions. Come see the beds?", figure: { ...base, skinTone: "medium", hairStyle: "ponytail", hairColor: "#22c55e", outfit: "tunic", outfitColor: "#5aa55a", accessory: "flower-crown", accessoryColor: "#ec4899" } },
];

export function villagerForBuilding(buildingId: string): Villager | null {
  return VILLAGERS.find((v) => v.buildingId === buildingId) ?? null;
}

export function villagerById(id: string): Villager | null {
  return VILLAGERS.find((v) => v.id === id) ?? null;
}

/** A full avatar config the figure components accept; the crest and companion are never drawn on a villager. */
export function villagerAvatar(villager: Villager): AvatarConfig {
  return { ...DEFAULT_AVATAR, ...villager.figure, companion: null };
}

/** Units toward spawn (positive z) from the site's south edge. */
export const VILLAGER_OFFSET = 1.5;
/** A hero this close (or closer) can talk. */
export const REACH = 2.5;

export function villagerPosition(slot: Vec2, footprint: { d: number }): Vec2 {
  return { x: slot.x, z: slot.z + footprint.d / 2 + VILLAGER_OFFSET };
}

/** The id of the nearest villager within REACH, ties resolved to array order; null when none is close enough. */
export function nearestVillager(hero: Vec2, villagers: { id: string; position: Vec2 }[]): string | null {
  let best: { id: string; d: number } | null = null;
  for (const v of villagers) {
    const d = Math.hypot(v.position.x - hero.x, v.position.z - hero.z);
    if (d > REACH) continue;
    if (!best || d < best.d) best = { id: v.id, d };
  }
  return best?.id ?? null;
}
