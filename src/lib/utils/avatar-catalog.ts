import { SPELL_ELEMENTS, SPELL_FORMS, SPELL_MODIFIERS, SPELL_CATEGORY } from "./spell-catalog";

// ── Avatar configuration types ───────────────────────────────

export type AvatarConfig = {
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  outfit: string;
  outfitColor: string;
  legwear: string;
  legwearColor: string;
  boots: string;
  bootsColor: string;
  accessory: string | null;
  accessoryColor: string;
  companion: string | null;
  companionColor: string;
  mount: string | null;
  mountColor: string;
  background: string;
  backgroundColor: string;
};

export type UnlockRequirement =
  | { type: "free" }
  | { type: "level"; level: number }
  | { type: "badge"; badgeId: string; badgeName: string }
  | { type: "quest" };

export type AvatarItem = {
  id: string;
  label: string;
  unlock: UnlockRequirement;
};

export type ColorOption = {
  id: string;
  label: string;
  hex: string;
};

// ── Default avatar for new characters ────────────────────────

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: "medium",
  hairStyle: "short",
  hairColor: "#4a3728",
  outfit: "tunic",
  outfitColor: "#3b82f6",
  legwear: "pants",
  legwearColor: "#4a3728",
  boots: "leather-boots",
  bootsColor: "#6b4226",
  accessory: null,
  accessoryColor: "#d4a843",
  companion: null,
  companionColor: "#f0a050",
  mount: null,
  mountColor: "#8b5e3c",
  background: "shield",
  backgroundColor: "#3b82f6",
};

/**
 * Normalizes an avatar config from the database, filling in defaults
 * for any missing fields (e.g. legwear/boots added after initial release).
 */
export function normalizeAvatarConfig(raw: Record<string, unknown>): AvatarConfig {
  return {
    skinTone: (raw.skinTone as string) ?? DEFAULT_AVATAR.skinTone,
    hairStyle: (raw.hairStyle as string) ?? DEFAULT_AVATAR.hairStyle,
    hairColor: (raw.hairColor as string) ?? DEFAULT_AVATAR.hairColor,
    outfit: (raw.outfit as string) ?? DEFAULT_AVATAR.outfit,
    outfitColor: (raw.outfitColor as string) ?? DEFAULT_AVATAR.outfitColor,
    legwear: (raw.legwear as string) ?? DEFAULT_AVATAR.legwear,
    legwearColor: (raw.legwearColor as string) ?? DEFAULT_AVATAR.legwearColor,
    boots: (raw.boots as string) ?? DEFAULT_AVATAR.boots,
    bootsColor: (raw.bootsColor as string) ?? DEFAULT_AVATAR.bootsColor,
    accessory: (raw.accessory as string) ?? null,
    accessoryColor: (raw.accessoryColor as string) ?? DEFAULT_AVATAR.accessoryColor,
    companion: (raw.companion as string) ?? null,
    companionColor: (raw.companionColor as string) ?? DEFAULT_AVATAR.companionColor,
    mount: (raw.mount as string) ?? null,
    mountColor: (raw.mountColor as string) ?? DEFAULT_AVATAR.mountColor,
    background: (raw.background as string) ?? DEFAULT_AVATAR.background,
    backgroundColor: (raw.backgroundColor as string) ?? DEFAULT_AVATAR.backgroundColor,
  };
}

// ── Skin tones ───────────────────────────────────────────────

export const SKIN_TONES: (AvatarItem & { hex: string })[] = [
  { id: "light", label: "Light", hex: "#fde0c4", unlock: { type: "free" } },
  { id: "medium-light", label: "Medium Light", hex: "#e8b98a", unlock: { type: "free" } },
  { id: "medium", label: "Medium", hex: "#d4956b", unlock: { type: "free" } },
  { id: "medium-dark", label: "Medium Dark", hex: "#a0674b", unlock: { type: "free" } },
  { id: "dark", label: "Dark", hex: "#6b4226", unlock: { type: "free" } },
  { id: "pale", label: "Pale", hex: "#fef0e0", unlock: { type: "free" } },
  { id: "olive", label: "Olive", hex: "#c4a265", unlock: { type: "free" } },
  { id: "bronze", label: "Bronze", hex: "#b87333", unlock: { type: "free" } },
];

// ── Hair styles ──────────────────────────────────────────────

export const HAIR_STYLES: AvatarItem[] = [
  { id: "short", label: "Short", unlock: { type: "free" } },
  { id: "long", label: "Long", unlock: { type: "free" } },
  { id: "spiky", label: "Spiky", unlock: { type: "free" } },
  { id: "curly", label: "Curly", unlock: { type: "free" } },
  { id: "braided", label: "Braided", unlock: { type: "level", level: 3 } },
  { id: "mohawk", label: "Mohawk", unlock: { type: "level", level: 3 } },
  { id: "ponytail", label: "Ponytail", unlock: { type: "level", level: 5 } },
  { id: "bun", label: "Bun", unlock: { type: "level", level: 5 } },
  { id: "wavy", label: "Wavy", unlock: { type: "level", level: 10 } },
  { id: "pigtails", label: "Pigtails", unlock: { type: "level", level: 10 } },
  { id: "afro", label: "Afro", unlock: { type: "level", level: 15 } },
  { id: "dreadlocks", label: "Dreadlocks", unlock: { type: "level", level: 15 } },
  { id: "side-shave", label: "Side Shave", unlock: { type: "level", level: 20 } },
  { id: "topknot", label: "Topknot", unlock: { type: "level", level: 25 } },
  { id: "flowing", label: "Flowing", unlock: { type: "level", level: 35 } },
  { id: "warrior-braid", label: "Warrior Braid", unlock: { type: "level", level: 50 } },
  { id: "phoenix-crest", label: "Phoenix Crest", unlock: { type: "level", level: 70 } },
  { id: "celestial-locks", label: "Celestial Locks", unlock: { type: "level", level: 90 } },
  { id: "twin-tails", label: "Twin Tails", unlock: { type: "quest" } },
  { id: "battle-braids", label: "Battle Braids", unlock: { type: "quest" } },
];

// ── Hair colors ──────────────────────────────────────────────

// Shared color palette — used for hair, outfit, and legwear so the
// picker always looks the same and colors appear in the same order.
const SHARED_COLORS: ColorOption[] = [
  { id: "black", label: "Black", hex: "#1a1a2e" },
  { id: "white", label: "White", hex: "#f0f0f0" },
  { id: "brown", label: "Brown", hex: "#4a3728" },
  { id: "gray", label: "Gray", hex: "#6b7280" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "crimson", label: "Crimson", hex: "#dc143c" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "gold", label: "Gold", hex: "#d4a843" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "forest", label: "Forest", hex: "#1a5c2a" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "navy", label: "Navy", hex: "#1e3a5f" },
  { id: "purple", label: "Purple", hex: "#a855f7" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "silver", label: "Silver", hex: "#c0c0c0" },
  { id: "bronze", label: "Bronze", hex: "#cd7f32" },
  { id: "copper", label: "Copper", hex: "#b87333" },
];

export const HAIR_COLORS: ColorOption[] = SHARED_COLORS;

// ── Outfits ──────────────────────────────────────────────────

export const OUTFITS: AvatarItem[] = [
  { id: "tunic", label: "Tunic", unlock: { type: "free" } },
  { id: "robe", label: "Robe", unlock: { type: "free" } },
  { id: "vest", label: "Vest", unlock: { type: "free" } },
  { id: "armor", label: "Armor", unlock: { type: "level", level: 3 } },
  { id: "cloak", label: "Cloak", unlock: { type: "level", level: 5 } },
  { id: "cape", label: "Cape", unlock: { type: "level", level: 8 } },
  { id: "chain-mail", label: "Chain Mail", unlock: { type: "level", level: 12 } },
  { id: "ranger-coat", label: "Ranger Coat", unlock: { type: "level", level: 15 } },
  { id: "knight-plate", label: "Knight Plate", unlock: { type: "level", level: 20 } },
  { id: "battle-dress", label: "Battle Dress", unlock: { type: "level", level: 25 } },
  { id: "shadow-cloak", label: "Shadow Cloak", unlock: { type: "level", level: 30 } },
  { id: "paladin-armor", label: "Paladin Armor", unlock: { type: "level", level: 35 } },
  { id: "mystic-robes", label: "Mystic Robes", unlock: { type: "level", level: 40 } },
  { id: "dragonscale", label: "Dragonscale", unlock: { type: "level", level: 50 } },
  { id: "phoenix-armor", label: "Phoenix Armor", unlock: { type: "level", level: 60 } },
  { id: "archmage-vestments", label: "Archmage Vestments", unlock: { type: "level", level: 75 } },
  { id: "celestial-raiment", label: "Celestial Raiment", unlock: { type: "level", level: 90 } },
  { id: "titans-plate", label: "Titan's Plate", unlock: { type: "level", level: 100 } },
  { id: "royal-garb", label: "Royal Garb", unlock: { type: "quest" } },
  { id: "wizard-robes", label: "Wizard Robes", unlock: { type: "quest" } },
  { id: "nature-weave", label: "Nature Weave", unlock: { type: "quest" } },
  { id: "frost-mail", label: "Frost Mail", unlock: { type: "badge", badgeId: "badge-streak-60", badgeName: "60-Day Streak" } },
  { id: "inferno-plate", label: "Inferno Plate", unlock: { type: "badge", badgeId: "badge-streak-90", badgeName: "90-Day Streak" } },
];

// ── Outfit colors ────────────────────────────────────────────

export const OUTFIT_COLORS: ColorOption[] = SHARED_COLORS;

// ── Legwear (NEW — full body) ──────────────────────────────

export const LEGWEAR: AvatarItem[] = [
  { id: "pants", label: "Pants", unlock: { type: "free" } },
  { id: "shorts", label: "Shorts", unlock: { type: "free" } },
  { id: "skirt", label: "Skirt", unlock: { type: "free" } },
  { id: "leather-pants", label: "Leather Pants", unlock: { type: "level", level: 5 } },
  { id: "armored-leggings", label: "Armored Leggings", unlock: { type: "level", level: 10 } },
  { id: "chain-leggings", label: "Chain Leggings", unlock: { type: "level", level: 15 } },
  { id: "plate-greaves", label: "Plate Greaves", unlock: { type: "level", level: 20 } },
  { id: "ranger-leggings", label: "Ranger Leggings", unlock: { type: "level", level: 25 } },
  { id: "shadow-pants", label: "Shadow Pants", unlock: { type: "level", level: 30 } },
  { id: "mystic-wraps", label: "Mystic Wraps", unlock: { type: "level", level: 40 } },
  { id: "dragon-greaves", label: "Dragon Greaves", unlock: { type: "level", level: 50 } },
  { id: "champion-greaves", label: "Champion Greaves", unlock: { type: "level", level: 60 } },
  { id: "celestial-leggings", label: "Celestial Leggings", unlock: { type: "level", level: 80 } },
  { id: "titan-greaves", label: "Titan Greaves", unlock: { type: "level", level: 100 } },
  { id: "royal-leggings", label: "Royal Leggings", unlock: { type: "quest" } },
  { id: "battle-kilt", label: "Battle Kilt", unlock: { type: "quest" } },
];

// ── Legwear colors ───────────────────────────────────────────

export const LEGWEAR_COLORS: ColorOption[] = SHARED_COLORS;

// ── Boots (NEW — full body) ─────────────────────────────────

export const BOOTS: AvatarItem[] = [
  { id: "leather-boots", label: "Leather Boots", unlock: { type: "free" } },
  { id: "sandals", label: "Sandals", unlock: { type: "free" } },
  { id: "cloth-shoes", label: "Cloth Shoes", unlock: { type: "free" } },
  { id: "iron-boots", label: "Iron Boots", unlock: { type: "level", level: 8 } },
  { id: "traveler-boots", label: "Traveler Boots", unlock: { type: "level", level: 12 } },
  { id: "plated-boots", label: "Plated Boots", unlock: { type: "level", level: 18 } },
  { id: "knight-sabatons", label: "Knight Sabatons", unlock: { type: "level", level: 25 } },
  { id: "ranger-boots", label: "Ranger Boots", unlock: { type: "level", level: 30 } },
  { id: "shadow-steps", label: "Shadow Steps", unlock: { type: "level", level: 40 } },
  { id: "dragon-boots", label: "Dragon Boots", unlock: { type: "level", level: 55 } },
  { id: "arcane-slippers", label: "Arcane Slippers", unlock: { type: "level", level: 65 } },
  { id: "celestial-boots", label: "Celestial Boots", unlock: { type: "level", level: 80 } },
  { id: "titan-boots", label: "Titan Boots", unlock: { type: "level", level: 100 } },
  { id: "winged-boots", label: "Winged Boots", unlock: { type: "quest" } },
  { id: "royal-boots", label: "Royal Boots", unlock: { type: "quest" } },
];

// ── Accessories ──────────────────────────────────────────────

export const ACCESSORIES: AvatarItem[] = [
  { id: "bandana", label: "Bandana", unlock: { type: "level", level: 3 } },
  { id: "glasses", label: "Glasses", unlock: { type: "level", level: 5 } },
  { id: "crown", label: "Crown", unlock: { type: "level", level: 8 } },
  { id: "necklace", label: "Necklace", unlock: { type: "level", level: 10 } },
  { id: "cape-pin", label: "Cape Pin", unlock: { type: "level", level: 12 } },
  { id: "monocle", label: "Monocle", unlock: { type: "level", level: 15 } },
  { id: "shoulder-guard", label: "Shoulder Guard", unlock: { type: "level", level: 20 } },
  { id: "war-paint", label: "War Paint", unlock: { type: "level", level: 25 } },
  { id: "face-mask", label: "Face Mask", unlock: { type: "level", level: 30 } },
  { id: "flower-crown", label: "Flower Crown", unlock: { type: "level", level: 35 } },
  { id: "enchanted-ring", label: "Enchanted Ring", unlock: { type: "level", level: 45 } },
  { id: "dragon-fang", label: "Dragon Fang", unlock: { type: "level", level: 55 } },
  { id: "angel-wings", label: "Angel Wings", unlock: { type: "level", level: 70 } },
  { id: "champions-laurel", label: "Champion's Laurel", unlock: { type: "level", level: 85 } },
  { id: "titans-circlet", label: "Titan's Circlet", unlock: { type: "level", level: 100 } },
  { id: "eyepatch", label: "Eyepatch", unlock: { type: "badge", badgeId: "badge-streak-3", badgeName: "3-Day Streak" } },
  { id: "horns", label: "Horns", unlock: { type: "badge", badgeId: "badge-streak-7", badgeName: "Week Warrior" } },
  { id: "halo", label: "Halo", unlock: { type: "badge", badgeId: "badge-volume-50", badgeName: "Busy Bee" } },
  { id: "battle-scars", label: "Battle Scars", unlock: { type: "badge", badgeId: "badge-streak-30", badgeName: "Monthly Master" } },
  { id: "wisdom-orb", label: "Wisdom Orb", unlock: { type: "badge", badgeId: "badge-volume-100", badgeName: "Century Club" } },
  { id: "phoenix-feather", label: "Phoenix Feather", unlock: { type: "badge", badgeId: "badge-streak-180", badgeName: "Half-Year Hero" } },
  { id: "third-eye", label: "Third Eye", unlock: { type: "badge", badgeId: "badge-polymath", badgeName: "Polymath" } },
  { id: "star-map", label: "Star Map", unlock: { type: "badge", badgeId: "badge-explorer-subjects-3", badgeName: "Curious Mind" } },
  { id: "lightning-bolt", label: "Lightning Bolt", unlock: { type: "badge", badgeId: "badge-explorer-blitz", badgeName: "Knowledge Blitz" } },
  { id: "moon-charm", label: "Moon Charm", unlock: { type: "badge", badgeId: "badge-special-night-owl", badgeName: "Night Owl" } },
  { id: "sun-pendant", label: "Sun Pendant", unlock: { type: "badge", badgeId: "badge-special-early-bird", badgeName: "Early Bird" } },
  { id: "chrono-gauntlet", label: "Chrono Gauntlet", unlock: { type: "badge", badgeId: "badge-timer-100", badgeName: "Chrono Champion" } },
  { id: "scholars-quill", label: "Scholar's Quill", unlock: { type: "badge", badgeId: "badge-time-100hr", badgeName: "Centurion of Learning" } },
  { id: "scarf", label: "Scarf", unlock: { type: "quest" } },
  { id: "tiara", label: "Tiara", unlock: { type: "quest" } },
  { id: "wings", label: "Wings", unlock: { type: "quest" } },
  { id: "shield-badge", label: "Shield Badge", unlock: { type: "quest" } },
];

// ── Companions ──────────────────────────────────────────────

export const COMPANIONS: AvatarItem[] = [
  { id: "cat", label: "Cat", unlock: { type: "free" } },
  { id: "dog", label: "Dog", unlock: { type: "free" } },
  { id: "owl", label: "Owl", unlock: { type: "level", level: 3 } },
  { id: "fox", label: "Fox", unlock: { type: "level", level: 3 } },
  { id: "wolf", label: "Wolf", unlock: { type: "level", level: 5 } },
  { id: "slime", label: "Slime", unlock: { type: "level", level: 5 } },
  { id: "rabbit", label: "Rabbit", unlock: { type: "level", level: 8 } },
  { id: "frog", label: "Frog", unlock: { type: "level", level: 10 } },
  { id: "hawk", label: "Hawk", unlock: { type: "level", level: 15 } },
  { id: "turtle", label: "Turtle", unlock: { type: "level", level: 18 } },
  { id: "snake", label: "Snake", unlock: { type: "level", level: 22 } },
  { id: "bear", label: "Bear", unlock: { type: "level", level: 28 } },
  { id: "bat", label: "Bat", unlock: { type: "level", level: 35 } },
  { id: "dragon", label: "Dragon", unlock: { type: "level", level: 40 } },
  { id: "unicorn", label: "Unicorn", unlock: { type: "level", level: 50 } },
  { id: "griffin", label: "Griffin", unlock: { type: "level", level: 65 } },
  { id: "hydra", label: "Hydra", unlock: { type: "level", level: 80 } },
  { id: "celestial-dragon", label: "Celestial Dragon", unlock: { type: "level", level: 100 } },
  { id: "phoenix", label: "Phoenix", unlock: { type: "badge", badgeId: "badge-streak-7", badgeName: "Week Warrior" } },
  { id: "spirit-wolf", label: "Spirit Wolf", unlock: { type: "badge", badgeId: "badge-streak-30", badgeName: "Monthly Master" } },
  { id: "fairy", label: "Fairy", unlock: { type: "quest" } },
  { id: "baby-dragon", label: "Baby Dragon", unlock: { type: "quest" } },
  { id: "pegasus", label: "Pegasus", unlock: { type: "quest" } },
];

// ── Mounts ───────────────────────────────────────────────────

/** A mount carries the hero through the Realm faster than walking (HERO_SPEED 3.5). Ids never overlap companion ids. */
export type MountItem = AvatarItem & { speed: number };

export const MOUNTS: MountItem[] = [
  { id: "pony", label: "Pony", speed: 4.5, unlock: { type: "free" } },
  { id: "donkey", label: "Donkey", speed: 4.2, unlock: { type: "free" } },
  { id: "goat", label: "Goat", speed: 4.8, unlock: { type: "level", level: 3 } },
  { id: "stag", label: "Stag", speed: 5.5, unlock: { type: "level", level: 8 } },
  { id: "boar", label: "Boar", speed: 5.2, unlock: { type: "badge", badgeId: "badge-streak-7", badgeName: "Week Warrior" } },
  { id: "direwolf", label: "Direwolf", speed: 5.8, unlock: { type: "level", level: 15 } },
  { id: "gryphon", label: "Gryphon", speed: 6.5, unlock: { type: "quest" } },
  { id: "wyrm", label: "Wyrm", speed: 7, unlock: { type: "quest" } },
];

export const MOUNT_COLORS: ColorOption[] = SHARED_COLORS;

export function findMount(id: string): MountItem | null {
  return MOUNTS.find((m) => m.id === id) ?? null;
}

// ── Boot & Accessory colors (shared palette) ────────────────

export const BOOTS_COLORS: ColorOption[] = SHARED_COLORS;
export const ACCESSORY_COLORS: ColorOption[] = SHARED_COLORS;

// ── Companion color palettes (per-creature) ─────────────────

export const COMPANION_COLOR_PALETTES: Record<string, ColorOption[]> = {
  cat: [
    { id: "orange", label: "Orange Tabby", hex: "#f0a050" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "white", label: "White", hex: "#f0f0f0" },
    { id: "gray", label: "Gray", hex: "#8a8a9a" },
    { id: "siamese", label: "Siamese", hex: "#d4c5a0" },
  ],
  dog: [
    { id: "brown", label: "Brown", hex: "#b07840" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "golden", label: "Golden", hex: "#d4a843" },
    { id: "white", label: "White", hex: "#f0f0f0" },
    { id: "gray", label: "Gray", hex: "#8a8a9a" },
  ],
  owl: [
    { id: "brown", label: "Brown", hex: "#a07850" },
    { id: "snowy", label: "Snowy", hex: "#f0f0f0" },
    { id: "gray", label: "Gray", hex: "#8a8a9a" },
    { id: "tawny", label: "Tawny", hex: "#c4873a" },
  ],
  fox: [
    { id: "red", label: "Red Fox", hex: "#e06820" },
    { id: "arctic", label: "Arctic", hex: "#f0f0f0" },
    { id: "silver", label: "Silver", hex: "#8a8a9a" },
    { id: "marble", label: "Marble", hex: "#c4873a" },
  ],
  wolf: [
    { id: "gray", label: "Gray", hex: "#808090" },
    { id: "white", label: "White", hex: "#f0f0f0" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "brown", label: "Brown", hex: "#8a5a2a" },
    { id: "timber", label: "Timber", hex: "#a09070" },
  ],
  slime: [
    { id: "green", label: "Green", hex: "#44cc44" },
    { id: "blue", label: "Blue", hex: "#4488ee" },
    { id: "pink", label: "Pink", hex: "#ee66aa" },
    { id: "purple", label: "Purple", hex: "#aa55dd" },
    { id: "gold", label: "Gold", hex: "#d4a843" },
  ],
  rabbit: [
    { id: "white", label: "White", hex: "#f0f0f0" },
    { id: "brown", label: "Brown", hex: "#a07850" },
    { id: "gray", label: "Gray", hex: "#8a8a9a" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "tan", label: "Tan", hex: "#d4b88c" },
  ],
  frog: [
    { id: "green", label: "Green", hex: "#44aa44" },
    { id: "blue", label: "Blue Dart", hex: "#3388cc" },
    { id: "red", label: "Red-Eyed", hex: "#cc4444" },
    { id: "golden", label: "Golden", hex: "#d4a843" },
  ],
  hawk: [
    { id: "brown", label: "Brown", hex: "#8a5a2a" },
    { id: "red-tail", label: "Red-Tailed", hex: "#a04020" },
    { id: "white", label: "White", hex: "#f0f0f0" },
    { id: "gray", label: "Gray", hex: "#808090" },
  ],
  turtle: [
    { id: "green", label: "Green", hex: "#558844" },
    { id: "brown", label: "Brown", hex: "#8a6642" },
    { id: "red-eared", label: "Red-Eared", hex: "#6a8a4a" },
    { id: "dark", label: "Dark", hex: "#3a4a2a" },
  ],
  snake: [
    { id: "green", label: "Green", hex: "#448844" },
    { id: "red", label: "Red", hex: "#cc4444" },
    { id: "gold", label: "Gold", hex: "#d4a843" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
  ],
  bear: [
    { id: "brown", label: "Brown", hex: "#8a5a2a" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "polar", label: "Polar", hex: "#f0f0f0" },
    { id: "grizzly", label: "Grizzly", hex: "#6a4a2a" },
  ],
  bat: [
    { id: "brown", label: "Brown", hex: "#5a3a2a" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "gray", label: "Gray", hex: "#6a6a7a" },
    { id: "white", label: "Albino", hex: "#f0e0e0" },
  ],
  dragon: [
    { id: "red", label: "Red", hex: "#cc3333" },
    { id: "green", label: "Green", hex: "#33aa33" },
    { id: "blue", label: "Blue", hex: "#3366cc" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "gold", label: "Gold", hex: "#d4a843" },
  ],
  unicorn: [
    { id: "white", label: "White", hex: "#f0f0ff" },
    { id: "pink", label: "Pink", hex: "#f0a0c0" },
    { id: "silver", label: "Silver", hex: "#c0c0d0" },
    { id: "golden", label: "Golden", hex: "#d4c080" },
  ],
  griffin: [
    { id: "gold", label: "Golden", hex: "#c4a040" },
    { id: "brown", label: "Brown", hex: "#8a5a2a" },
    { id: "white", label: "White", hex: "#f0f0f0" },
    { id: "dark", label: "Dark", hex: "#4a3a2a" },
  ],
  hydra: [
    { id: "green", label: "Green", hex: "#338833" },
    { id: "blue", label: "Blue", hex: "#336688" },
    { id: "purple", label: "Purple", hex: "#664488" },
    { id: "red", label: "Red", hex: "#883333" },
  ],
  "celestial-dragon": [
    { id: "starlight", label: "Starlight", hex: "#e0e0ff" },
    { id: "nebula", label: "Nebula", hex: "#8080cc" },
    { id: "solar", label: "Solar", hex: "#ffd080" },
    { id: "void", label: "Void", hex: "#2a2a4e" },
  ],
  phoenix: [
    { id: "fire", label: "Fire", hex: "#ff6622" },
    { id: "gold", label: "Golden", hex: "#d4a843" },
    { id: "blue", label: "Blue Flame", hex: "#4488ff" },
    { id: "white", label: "White", hex: "#f0f0f0" },
  ],
  "spirit-wolf": [
    { id: "blue", label: "Spirit Blue", hex: "#6688cc" },
    { id: "white", label: "Ghost", hex: "#e0e0f0" },
    { id: "purple", label: "Phantom", hex: "#8866aa" },
    { id: "green", label: "Forest Spirit", hex: "#66aa88" },
  ],
  fairy: [
    { id: "pink", label: "Pink", hex: "#ee88bb" },
    { id: "blue", label: "Blue", hex: "#88bbee" },
    { id: "green", label: "Green", hex: "#88cc88" },
    { id: "gold", label: "Gold", hex: "#d4c080" },
  ],
  "baby-dragon": [
    { id: "red", label: "Red", hex: "#cc5544" },
    { id: "green", label: "Green", hex: "#55aa55" },
    { id: "blue", label: "Blue", hex: "#5588cc" },
    { id: "purple", label: "Purple", hex: "#8855aa" },
  ],
  pegasus: [
    { id: "white", label: "White", hex: "#f0f0ff" },
    { id: "gray", label: "Gray", hex: "#a0a0b0" },
    { id: "black", label: "Black", hex: "#2a2a3e" },
    { id: "golden", label: "Golden", hex: "#d4c080" },
  ],
};

export function getCompanionColors(companionId: string | null): ColorOption[] {
  if (!companionId) return [];
  return COMPANION_COLOR_PALETTES[companionId] ?? [];
}

// ── Backgrounds ──────────────────────────────────────────────

export const BACKGROUNDS: AvatarItem[] = [
  { id: "shield", label: "Shield", unlock: { type: "free" } },
  { id: "circle", label: "Circle", unlock: { type: "free" } },
  { id: "diamond", label: "Diamond", unlock: { type: "level", level: 3 } },
  { id: "hexagon", label: "Hexagon", unlock: { type: "level", level: 5 } },
  { id: "flame", label: "Flame", unlock: { type: "level", level: 5 } },
  { id: "stars", label: "Stars", unlock: { type: "level", level: 8 } },
  { id: "crescent", label: "Crescent", unlock: { type: "level", level: 15 } },
  { id: "crown-crest", label: "Crown Crest", unlock: { type: "level", level: 25 } },
  { id: "dragon-crest", label: "Dragon Crest", unlock: { type: "level", level: 40 } },
  { id: "crossed-swords", label: "Crossed Swords", unlock: { type: "level", level: 55 } },
  { id: "crystal", label: "Crystal", unlock: { type: "level", level: 70 } },
  { id: "celestial", label: "Celestial", unlock: { type: "level", level: 90 } },
  { id: "rainbow", label: "Rainbow", unlock: { type: "quest" } },
  { id: "castle", label: "Castle", unlock: { type: "quest" } },
  { id: "enchanted-forest", label: "Enchanted Forest", unlock: { type: "quest" } },
];

// ── Background colors ───────────────────────────────────────

export const BACKGROUND_COLORS: ColorOption[] = [
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "purple", label: "Purple", hex: "#a855f7" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "gold", label: "Gold", hex: "#d4a843" },
  { id: "black", label: "Black", hex: "#1a1a2e" },
  { id: "white", label: "White", hex: "#f0f0f0" },
  { id: "crimson", label: "Crimson", hex: "#dc143c" },
  { id: "navy", label: "Navy", hex: "#1e3a5f" },
  { id: "silver", label: "Silver", hex: "#c0c0c0" },
  { id: "forest", label: "Forest", hex: "#1a5c2a" },
];

// ── Castle types (unlock at level 50+) ──────────────────────

export type CastleType = {
  id: string;
  label: string;
  description: string;
  levelRequired: number;
};

export const CASTLE_TYPES: CastleType[] = [
  { id: "campsite", label: "Campsite", description: "A humble camp beneath the stars", levelRequired: 50 },
  { id: "cottage", label: "Cottage", description: "A cozy woodland retreat", levelRequired: 55 },
  { id: "watchtower", label: "Watchtower", description: "A sturdy stone tower overlooking the realm", levelRequired: 60 },
  { id: "keep", label: "Keep", description: "A fortified stronghold with thick walls", levelRequired: 65 },
  { id: "manor", label: "Manor", description: "An elegant estate with grand halls", levelRequired: 70 },
  { id: "castle", label: "Castle", description: "A mighty castle with towers and battlements", levelRequired: 80 },
  { id: "fortress", label: "Fortress", description: "An imposing military stronghold", levelRequired: 90 },
  { id: "citadel", label: "Citadel", description: "A legendary seat of power", levelRequired: 100 },
];

// ── Unlock helpers ───────────────────────────────────────────

export function isUnlocked(
  item: AvatarItem,
  level: number,
  earnedBadgeIds: string[],
  questUnlockedItems?: Set<string>,
): boolean {
  switch (item.unlock.type) {
    case "free":
      return true;
    case "level":
      return level >= item.unlock.level;
    case "badge":
      return earnedBadgeIds.includes(item.unlock.badgeId);
    case "quest":
      return questUnlockedItems?.has(item.id) ?? false;
  }
}

export function getUnlockDescription(item: AvatarItem): string | null {
  switch (item.unlock.type) {
    case "free":
      return null;
    case "level":
      return `Reach Level ${item.unlock.level}`;
    case "badge":
      return `Earn "${item.unlock.badgeName}"`;
    case "quest":
      return "Quest Reward";
  }
}

/** Returns all avatar items that can be unlocked via quest rewards */
export function getQuestUnlockableItems(): { category: string; item: AvatarItem }[] {
  const items: { category: string; item: AvatarItem }[] = [];
  for (const item of OUTFITS) {
    if (item.unlock.type === "quest") items.push({ category: "outfit", item });
  }
  for (const item of LEGWEAR) {
    if (item.unlock.type === "quest") items.push({ category: "legwear", item });
  }
  for (const item of BOOTS) {
    if (item.unlock.type === "quest") items.push({ category: "boots", item });
  }
  for (const item of ACCESSORIES) {
    if (item.unlock.type === "quest") items.push({ category: "accessory", item });
  }
  for (const item of COMPANIONS) {
    if (item.unlock.type === "quest") items.push({ category: "companion", item });
  }
  for (const item of MOUNTS) {
    if (item.unlock.type === "quest") items.push({ category: "mount", item });
  }
  for (const item of BACKGROUNDS) {
    if (item.unlock.type === "quest") items.push({ category: "background", item });
  }
  for (const item of HAIR_STYLES) {
    if (item.unlock.type === "quest") items.push({ category: "hairStyle", item });
  }
  // Spell parts a grown-up may award. Stored in the same unlock table as
  // avatar items, under their own categories, so the reward flow is shared.
  for (const part of SPELL_ELEMENTS) {
    if (part.unlock.type === "quest") items.push({ category: SPELL_CATEGORY.element, item: { id: part.id, label: part.label, unlock: { type: "quest" } } });
  }
  for (const part of SPELL_FORMS) {
    if (part.unlock.type === "quest") items.push({ category: SPELL_CATEGORY.form, item: { id: part.id, label: part.label, unlock: { type: "quest" } } });
  }
  for (const part of SPELL_MODIFIERS) {
    if (part.unlock.type === "quest") items.push({ category: SPELL_CATEGORY.modifier, item: { id: part.id, label: part.label, unlock: { type: "quest" } } });
  }
  return items;
}

/** Map internal category to display label */
const CATEGORY_LABELS: Record<string, string> = {
  outfit: "Armor",
  legwear: "Legwear",
  boots: "Boots",
  accessory: "Flair",
  companion: "Companion",
  mount: "Mount",
  background: "Crest",
  hairStyle: "Hair Style",
  spellElement: "Spell Element",
  spellForm: "Spell Form",
  spellModifier: "Spell Modifier",
};

// Label-only: only `id` and `label` are read from these lists, so avatar
// items and spell parts (which don't share the AvatarItem shape) both fit.
const CATEGORY_ITEMS: Record<string, { id: string; label: string }[]> = {
  outfit: OUTFITS,
  legwear: LEGWEAR,
  boots: BOOTS,
  accessory: ACCESSORIES,
  companion: COMPANIONS,
  mount: MOUNTS,
  background: BACKGROUNDS,
  hairStyle: HAIR_STYLES,
  spellElement: SPELL_ELEMENTS,
  spellForm: SPELL_FORMS,
  spellModifier: SPELL_MODIFIERS,
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** Look up a friendly label for a reward avatar item stored as JSON { category, itemId } */
export function getRewardItemLabel(rewardJson: string): string {
  try {
    const { category, itemId } = JSON.parse(rewardJson) as { category: string; itemId: string };
    const items = CATEGORY_ITEMS[category];
    const item = items?.find((i) => i.id === itemId);
    const catLabel = getCategoryLabel(category);
    return item ? `${catLabel}: ${item.label}` : `${catLabel}: ${itemId}`;
  } catch {
    return "Avatar Item";
  }
}

/** Validate that an AvatarConfig references only valid catalog IDs */
export function isValidAvatarConfig(config: unknown): config is AvatarConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;

  const isHex = (v: unknown) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

  const validSkinTone = SKIN_TONES.some((s) => s.id === c.skinTone);
  const validHairStyle = HAIR_STYLES.some((h) => h.id === c.hairStyle);
  const validHairColor = isHex(c.hairColor);
  const validOutfit = OUTFITS.some((o) => o.id === c.outfit);
  const validOutfitColor = isHex(c.outfitColor);
  const validLegwear =
    c.legwear === undefined || LEGWEAR.some((l) => l.id === c.legwear);
  const validLegwearColor =
    c.legwearColor === undefined || isHex(c.legwearColor);
  const validBoots =
    c.boots === undefined || BOOTS.some((b) => b.id === c.boots);
  const validBootsColor =
    c.bootsColor === undefined || isHex(c.bootsColor);
  const validAccessory =
    c.accessory === null || ACCESSORIES.some((a) => a.id === c.accessory);
  const validAccessoryColor =
    c.accessoryColor === undefined || isHex(c.accessoryColor);
  const validCompanion =
    c.companion === null || c.companion === undefined || COMPANIONS.some((comp) => comp.id === c.companion);
  const validCompanionColor =
    c.companionColor === undefined || isHex(c.companionColor);
  const validMount = c.mount === null || c.mount === undefined || MOUNTS.some((m) => m.id === c.mount);
  const validMountColor = c.mountColor === undefined || isHex(c.mountColor);
  const validBackground = BACKGROUNDS.some((b) => b.id === c.background);
  const validBackgroundColor = isHex(c.backgroundColor);

  return (
    validSkinTone &&
    validHairStyle &&
    validHairColor &&
    validOutfit &&
    validOutfitColor &&
    validLegwear &&
    validLegwearColor &&
    validBoots &&
    validBootsColor &&
    validAccessory &&
    validAccessoryColor &&
    validCompanion &&
    validCompanionColor &&
    validMount &&
    validMountColor &&
    validBackground &&
    validBackgroundColor
  );
}
