import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { Vec2 } from "./layout";
import type { MaterialId } from "./materials";

/** The visual half of an avatar config: what the villager wears, never a crest or companion. */
export type VillagerFigureConfig = Pick<AvatarConfig, "skinTone" | "hairStyle" | "hairColor" | "outfit" | "outfitColor" | "legwear" | "legwearColor" | "boots" | "bootsColor" | "accessory" | "accessoryColor">;

/**
 * What a villager says when the hero has finished a real quest in their trade (`pickMention`):
 * 2 to 3 lines per material they care about, each with one `{quest}` token for the quest's title,
 * bare: `mentionLine` puts the title in, wrapped once in its own quotes.
 * Warm and curious, never a judgement of pace.
 */
export type VillagerMentions = Partial<Record<MaterialId, string[]>>;

export type Villager = { id: string; buildingId: string; name: string; greeting: string; figure: VillagerFigureConfig; mentions: VillagerMentions };

const base: VillagerFigureConfig = {
  skinTone: "medium", hairStyle: "short", hairColor: "#4a3728", outfit: "tunic", outfitColor: "#8c7a6b",
  legwear: "pants", legwearColor: "#4a3728", boots: "leather-boots", bootsColor: "#6b4226", accessory: null, accessoryColor: "#d4a843",
};

/**
 * One villager per building, in BUILDINGS order. Greetings are gentle; the monsters toggle changes deed stories, not greetings.
 *
 * `figure` is the ONE place a villager's look lives: the talk panel's portrait and the 3D Realm's
 * figure (`lib/realm3d/villager-look.ts`) both wear it. Each is dressed to read as who they are from
 * across the green — Old Bram's hair has gone silver; the miller works in floury pale clothes, her
 * sleeves off and a kerchief over her hair.
 */
export const VILLAGERS: Villager[] = [
  { id: "bram", buildingId: "well", name: "Old Bram", greeting: "The bucket's dry again. Have you a moment for the well?", figure: { ...base, skinTone: "medium-dark", hairStyle: "short", hairColor: "#d6d6d2", outfit: "tunic", outfitColor: "#5b8fb9" },
    mentions: {
      stone: [
        "Word reached the well that you finished {quest}. Numbers like to be counted, don't they?",
        "I hear you worked through {quest}. Tell me one thing that surprised you.",
        "Ah, {quest}! The well and I were wondering how it went.",
      ],
    },
  },
  { id: "tessa", buildingId: "mill", name: "Miller Tessa", greeting: "Sacks everywhere and no one to count them. Lend a hand?", figure: { ...base, skinTone: "light", hairStyle: "bun", hairColor: "#b87333", outfit: "vest", outfitColor: "#efe6d3", accessory: "bandana", accessoryColor: "#faf6ec" },
    mentions: {
      timber: [
        "The mill hears everything, and it says you finished {quest}. What was it like?",
        "{quest}, is it? Come and tell me about it while I fill these sacks.",
        "A little bird flew by with news of {quest}. I'd love to hear the rest.",
      ],
      herbs: [
        "I hear you finished {quest}. The flour and I are curious what you found out.",
        "{quest} sounds like a good one. What did you learn?",
      ],
    },
  },
  { id: "aldo", buildingId: "bridge", name: "Carpenter Aldo", greeting: "Planks to measure and a river that won't wait. Help me?", figure: { ...base, skinTone: "olive", hairStyle: "curly", hairColor: "#1a1a2e", outfit: "vest", outfitColor: "#8c7a6b", accessory: "bandana", accessoryColor: "#c0563d" },
    mentions: {
      timber: [
        "Word on the bridge is you finished {quest}. Show me what you made of it sometime!",
        "{quest}! I like a job that gets done. What was the trickiest part?",
        "I heard you finished {quest}. Every plank in this bridge started as something like that.",
      ],
    },
  },
  { id: "wren", buildingId: "chapel", name: "Sister Wren", greeting: "The bell wants numbers and the scroll wants reading. Will you?", figure: { ...base, skinTone: "pale", hairStyle: "long", hairColor: "#f0f0f0", outfit: "robe", outfitColor: "#d8cfc0" },
    mentions: {
      dye: [
        "The chapel bell rang softly for {quest}. I hear you finished it. How did it feel?",
        "I hear you finished {quest}. Tell me what colours it brought to your day.",
        "{quest}, they say. I would love to hear about it.",
      ],
      ink: [
        "I hear you finished {quest}. Read me a little of it sometime?",
        "A scroll's worth of work, {quest}. What was your favourite part?",
      ],
    },
  },
  { id: "pip", buildingId: "market", name: "Crier Pip", greeting: "Prices, words, and a market that opens at noon. Join me?", figure: { ...base, skinTone: "medium-light", hairStyle: "spiky", hairColor: "#f97316", outfit: "tunic", outfitColor: "#c0563d" },
    mentions: {
      thread: [
        "Hear ye! I hear you finished {quest}! What's the tale of it?",
        "News on the market green: {quest} is finished! Tell me everything.",
        "I cried it through the stalls just now: you finished {quest}. What did you find?",
      ],
      ink: [
        "I hear you finished {quest}. Give me one good word from it for my next cry!",
        "{quest}! A fine thing to have finished. What was it about?",
      ],
    },
  },
  { id: "hesper", buildingId: "library", name: "Librarian Hesper", greeting: "Every scroll has a place. Shall we find them?", figure: { ...base, skinTone: "dark", hairStyle: "braided", hairColor: "#1a1a2e", outfit: "robe", outfitColor: "#6f5a8a", accessory: "glasses", accessoryColor: "#c0c0c0" },
    mentions: {
      ink: [
        "I hear you finished {quest}. Tell me what you learned sometime!",
        "{quest}, I heard. Would you tell me about it? I do love a good tale.",
        "A new page for the library: you finished {quest}. What was the best part?",
      ],
      thread: [
        "I hear you finished {quest}. I'd love to know who and what you met in it.",
        "{quest}! Come and tell me which part of the story you remember best.",
      ],
    },
  },
  { id: "gerd", buildingId: "watchtower", name: "Mason Gerd", greeting: "Stones to count before the lantern's lit. Are you willing?", figure: { ...base, skinTone: "bronze", hairStyle: "short", hairColor: "#4a3728", outfit: "armor", outfitColor: "#7d7d7d" },
    mentions: {
      stone: [
        "I hear you finished {quest}. Solid work builds solid walls. What was it like?",
        "{quest}, they say! Stone by stone, you get there. What did you find?",
        "The watchtower saw you finished {quest}. Tell me how you worked it out.",
      ],
    },
  },
  { id: "ivy", buildingId: "garden", name: "Keeper Ivy", greeting: "The bees have questions. Come see the beds?", figure: { ...base, skinTone: "medium", hairStyle: "ponytail", hairColor: "#22c55e", outfit: "tunic", outfitColor: "#5aa55a", accessory: "flower-crown", accessoryColor: "#ec4899" },
    mentions: {
      herbs: [
        "The bees buzzed about it: you finished {quest}! What did you discover?",
        "I hear you finished {quest}. Tell me something new you learned, and I'll plant it in my head.",
        "{quest}! My garden grows on good questions. What was yours?",
      ],
      dye: [
        "I hear you finished {quest}. The flowers are curious what colours you used.",
        "{quest}, the bees say. I'd love to hear about it.",
      ],
    },
  },
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
