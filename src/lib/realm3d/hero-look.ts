/**
 * SPIKE — throwaway. The child's `AvatarConfig` described precisely enough for a low-poly figure
 * to wear it. Pure arithmetic and lookup tables: no `three` here, so it stays importable from
 * anywhere (the three-shaped half lives in `components/realm3d/hero-figure.tsx`).
 *
 * An earlier pass collapsed the catalog into silhouette families — 33 accessories onto 8 shapes,
 * 23 companions onto 3 gaits — on the theory that nothing finer survives the camera distance.
 * That was an effort decision wearing a rendering decision's clothes, and it was wrong. These
 * items are EARNED: levels, badges and quests are spent on them, and they are the strongest
 * reward the Realm hands a child. A quill that renders as a gem tells a child their hundred hours
 * bought them the same thing as everyone else's.
 *
 * So this file names the real object. Each table below carries the catalog id through to the
 * geometry, with only the parts that genuinely differ spelled out — a quill is a shaft and a
 * vane, a fox is a snout and a brush tail. Where two ids honestly ARE the same object in two
 * colours, the table says so out loud rather than pretending otherwise.
 *
 * Every colour the child picked is carried through with its hue untouched.
 */

import {
  DEFAULT_AVATAR,
  SKIN_TONES,
  type AvatarConfig,
} from "@/lib/utils/avatar-catalog";
import { crownById } from "@/lib/utils/crown-catalog";

/* --------------------------------------------------------------- the look */

/**
 * Hair, as parts rather than as one of seven families. Twenty-two styles are a handful of
 * decisions — is there a cap or a cloud, what hangs at the back, what stands up on top, is one
 * side shaved — and spelling them out that way costs less than twenty-two bespoke models while
 * still telling a mohawk from a topknot.
 */
export type HairShape = {
  base: "cap" | "puff";
  /** Swells the puff, or widens the cap's sides. 1 is ordinary. */
  volume: number;
  back: "none" | "slab" | "tail" | "braid" | "dreads" | "twin-puff" | "twin-tail" | "bun" | "flare";
  /** Multiplies whatever hangs at the back. */
  length: number;
  top: "none" | "spikes" | "mohawk" | "crest" | "knot";
  /** One side cut to the scalp. */
  shaved: boolean;
  /** Celestial Locks catch their own light. */
  glow: boolean;
};

/** The base silhouette a body reads as from across the village. Detail hangs off it. */
export type OutfitShape = "tunic" | "robe" | "plate" | "coat";

/** The mark that separates one outfit from the rest of its family, drawn in `accent`. */
export type OutfitMark =
  | "none" | "sash" | "wizard" | "runes" | "gems" | "stars" | "leaves" | "royal" | "bodice"
  | "scales" | "flame" | "lava" | "frost" | "chain" | "emblem" | "sunburst" | "slab" | "strap"
  | "clasp" | "collar" | "vee";

export type Pauldron = "none" | "round" | "square" | "spiked" | "huge" | "shard" | "winged" | "leaf";

export type OutfitLook = {
  id: string;
  shape: OutfitShape;
  /** The child's pick, hue untouched. Everything else is built around it. */
  color: string;
  /** Grey steel body with the child's colour kept as tabard and trim. */
  metal: boolean;
  mark: OutfitMark;
  /** The item's signature hue — gold braid, lava orange, ice white. */
  accent: string;
  sleeves: "normal" | "wide" | "bare";
  pauldrons: Pauldron;
  /** A hem band at the waist, in this colour, or none. */
  hem: string | null;
  /** Inferno seams and celestial stars light themselves. */
  glow: boolean;
  /** How far the body falls: 1 is a tunic, 2 is a floor-length robe. */
  length: number;
  /** Darkens the body without moving its hue — the Shadow Cloak is the child's colour, at night. */
  tone: number;
};

export type LegShape = "trousers" | "shorts" | "skirt";
export type FootShape = "shoe" | "boot" | "tall";

export type FootLook = {
  id: string;
  shape: FootShape;
  color: string;
  /** Sandals: a bare foot under two straps. */
  strap: boolean;
  /** A folded-over cuff at the top — traveller, ranger, royal. */
  cuff: boolean;
  /** Toe claws — dragon and titan. */
  claw: boolean;
  winged: boolean;
  glow: boolean;
  metal: boolean;
};

/**
 * Where an accessory hangs. `head` is the one slot an earned crown can take away; everything
 * else is worn alongside it, exactly as the 2D avatar layers them.
 */
export type GearSlot =
  | "head" | "cowl" | "ear" | "face" | "neck" | "chest" | "shoulder" | "hand" | "back" | "aura";

/** Kept for the callers that only ask "what is on the head": the head-slot accessory kinds. */
export type HeadGear = "none" | "circlet" | "horns" | "hood" | "band" | "halo";

export type GearLook = {
  /** The catalog id. The figure draws THIS, not a family it was sorted into. */
  id: string;
  slot: GearSlot;
  color: string;
};

/** One archetype per creature the catalog names, minus the ones that are honestly the same beast. */
export type CompanionShape =
  | "cat" | "dog" | "fox" | "wolf" | "bear" | "rabbit" | "frog" | "turtle" | "snake"
  | "slime" | "owl" | "hawk" | "bat" | "dragon" | "hydra" | "griffin" | "horse"
  | "phoenix" | "fairy";

export type CompanionLook = {
  id: string;
  shape: CompanionShape;
  gait: "trot" | "hop" | "fly" | "slither" | "bob";
  color: string;
  horn: boolean;
  wings: boolean;
  glow: boolean;
  /** Spirit Wolf is the same wolf, seen through. */
  ghost: boolean;
  scale: number;
};

export type HeroLook = {
  skin: string;
  hair: HairShape & { id: string; color: string };
  outfit: OutfitLook;
  cape: { on: boolean; color: string };
  legs: { id: string; shape: LegShape; color: string; metal: boolean; glow: boolean };
  feet: FootLook;
  /** The one accessory being worn, as itself. Null when the child has none on. */
  gear: GearLook | null;
  /** The earned crown — its own field in the config, and the loudest "that is mine" here. */
  crown: { color: string; points: number } | null;
  companion: CompanionLook | null;
};

/* ---------------------------------------------------------------- colours */

/** A picked colour, floored off pure black so it still catches the sun. Hue is never moved. */
function wear(hex: string, floor = 0.17): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (l >= floor) return hex;
  const k = l < 0.02 ? 1 : floor / l;
  const up = (v: number) => Math.round(Math.min(255, v * k + 26));
  return `#${((up(r) << 16) | (up(g) << 8) | up(b)).toString(16).padStart(6, "0")}`;
}

function skinHex(id: string): string {
  return SKIN_TONES.find((s) => s.id === id)?.hex ?? "#d4956b";
}

const GOLD = "#d4a843";

/* ------------------------------------------------------------------- hair */

const PLAIN: HairShape = {
  base: "cap", volume: 1, back: "none", length: 1, top: "none", shaved: false, glow: false,
};

/**
 * All 22 styles. Honestly identical pairs, said out loud: `cropped` is `short` (a cap either
 * way), and `wavy` is `long` (the wave is a texture, and texture is the one thing a flat-shaded
 * low-poly slab cannot carry). Everything else earned its own parts.
 */
const HAIR: Record<string, Partial<HairShape>> = {
  short: {},
  cropped: {},                                            // ← the same cap as `short`
  "side-shave": { shaved: true },
  long: { back: "slab" },
  wavy: { back: "slab" },                                 // ← the same slab as `long`
  flowing: { back: "slab", length: 1.5, volume: 1.15 },
  "celestial-locks": { back: "slab", length: 1.3, glow: true },
  dreadlocks: { back: "dreads", length: 1.15 },
  spiky: { top: "spikes" },
  mohawk: { top: "mohawk", shaved: true },
  "phoenix-crest": { top: "crest", glow: true },
  curly: { base: "puff", volume: 0.86 },
  afro: { base: "puff", volume: 1.18 },
  shag: { back: "flare", volume: 1.1 },
  ponytail: { back: "tail" },
  braided: { back: "braid" },
  "warrior-braid": { back: "braid", length: 1.35, shaved: true },
  "battle-braids": { back: "twin-tail", length: 0.9 },
  bun: { back: "bun" },
  topknot: { top: "knot", shaved: true },
  pigtails: { back: "twin-puff" },
  "twin-tails": { back: "twin-tail", length: 1.4 },
};

/* ----------------------------------------------------------------- outfit */

const OUTFIT_BASE: Record<OutfitShape, Omit<OutfitLook, "id" | "color" | "accent">> = {
  tunic: { shape: "tunic", metal: false, mark: "none", sleeves: "normal", pauldrons: "none", hem: null, glow: false, length: 1, tone: 0 },
  robe: { shape: "robe", metal: false, mark: "sash", sleeves: "wide", pauldrons: "none", hem: null, glow: false, length: 2, tone: 0 },
  plate: { shape: "plate", metal: true, mark: "emblem", sleeves: "normal", pauldrons: "round", hem: null, glow: false, length: 1, tone: 0 },
  coat: { shape: "coat", metal: false, mark: "strap", sleeves: "normal", pauldrons: "none", hem: null, glow: false, length: 1.4, tone: 0 },
};

/**
 * All 23 outfits. The family is the silhouette the eye reads at a distance; the rest is what
 * tells a child who spent level 100 on Titan's Plate that they are not wearing level 3 Armor.
 * `accent` is the item's signature hue and it is the ONLY place a fixed colour appears — the
 * child's own pick still owns the body, the tabard or the trim in every single row.
 */
const OUTFIT: Record<string, Partial<OutfitLook> & { shape: OutfitShape }> = {
  // plain cloth
  tunic: { shape: "tunic" },
  vest: { shape: "tunic", sleeves: "bare", mark: "vee" },

  // robes — all flare to the floor; the trim is the whole difference and there is a lot of it
  robe: { shape: "robe" },
  "mystic-robes": { shape: "robe", mark: "runes", accent: GOLD, glow: true },
  "wizard-robes": { shape: "robe", mark: "wizard", accent: "#ffd700", glow: true, length: 2.05 },
  "archmage-vestments": { shape: "robe", mark: "gems", accent: GOLD, glow: true },
  "celestial-raiment": { shape: "robe", mark: "stars", accent: GOLD, glow: true },
  "nature-weave": { shape: "robe", mark: "leaves", accent: "#8a6642", pauldrons: "leaf" },
  "royal-garb": { shape: "robe", mark: "royal", accent: GOLD, hem: GOLD, length: 1.7 },
  "battle-dress": { shape: "robe", mark: "bodice", accent: GOLD, length: 1.55, sleeves: "normal" },

  // steel. Every one of these is a box with shoulders; every one of them now says which box.
  armor: { shape: "plate", pauldrons: "round", hem: null },
  "chain-mail": { shape: "plate", mark: "chain", pauldrons: "none" },
  "knight-plate": { shape: "plate", mark: "slab", pauldrons: "square" },
  "paladin-armor": { shape: "plate", mark: "sunburst", accent: GOLD, pauldrons: "winged", hem: GOLD },
  dragonscale: { shape: "plate", mark: "scales", accent: GOLD, pauldrons: "spiked", hem: GOLD },
  "phoenix-armor": { shape: "plate", mark: "flame", accent: "#ffcc00", pauldrons: "spiked", hem: GOLD, glow: true },
  "titans-plate": { shape: "plate", mark: "slab", accent: "#ffd700", pauldrons: "huge", hem: "#ffd700" },
  "frost-mail": { shape: "plate", mark: "frost", accent: "#d6f2ff", pauldrons: "shard" },
  "inferno-plate": { shape: "plate", mark: "lava", accent: "#ff4400", pauldrons: "spiked", glow: true },

  // coats and cloaks
  cloak: { shape: "coat", mark: "clasp", accent: GOLD },
  // A cape is a cape, not a coat: the body under it is a plain tunic, and the cape does the work.
  cape: { shape: "tunic", mark: "clasp", accent: GOLD },
  "ranger-coat": { shape: "coat", mark: "strap", accent: "#8a6642" },
  "shadow-cloak": { shape: "coat", mark: "collar", accent: "#4a4a6e", length: 1.6, tone: 0.45 },
};

/** A cape swinging behind is worth more to an eight-year-old than any amount of detail in front. */
const CAPED = new Set([
  "cloak", "cape", "shadow-cloak", "royal-garb", "celestial-raiment",
  "paladin-armor", "phoenix-armor",
]);

/* ------------------------------------------------------------ legs & feet */

/** 16 legwear ids → 3 shapes. Only "is there a skirt, are the knees bare" survives the distance. */
const LEGS: Record<string, LegShape> = {
  shorts: "shorts",
  skirt: "skirt", "battle-kilt": "skirt",
};

const METAL_LEGS = new Set([
  "armored-leggings", "chain-leggings", "plate-greaves",
  "dragon-greaves", "champion-greaves", "titan-greaves",
]);

const GLOW_LEGS = new Set(["celestial-leggings", "mystic-wraps"]);

/**
 * 15 boots. Height is still the big read, but a cuff, a claw and a glow are three more bits a
 * child can see on their own feet, and they cost four boxes between them.
 */
const FEET: Record<string, Partial<FootLook> & { shape: FootShape }> = {
  "leather-boots": { shape: "boot" },
  sandals: { shape: "shoe", strap: true },
  "cloth-shoes": { shape: "shoe" },
  "iron-boots": { shape: "tall", metal: true },
  "traveler-boots": { shape: "boot", cuff: true },
  "plated-boots": { shape: "tall", metal: true },
  "knight-sabatons": { shape: "tall", metal: true, claw: false },
  "ranger-boots": { shape: "boot", cuff: true },              // ← the traveller's boot, in leather
  "shadow-steps": { shape: "boot", glow: true },
  "dragon-boots": { shape: "tall", claw: true },
  "arcane-slippers": { shape: "shoe", glow: true },
  "celestial-boots": { shape: "tall", glow: true, cuff: true },
  "titan-boots": { shape: "tall", metal: true, claw: true },
  "winged-boots": { shape: "boot", winged: true },
  "royal-boots": { shape: "boot", cuff: true, metal: false },
};

/* -------------------------------------------------------------- accessory */

/**
 * All 33 accessories, each as itself. The slot decides where it hangs and whether an earned
 * crown takes its place; the geometry is in `hero-figure.tsx`, one small case per id.
 *
 * The seven the 2D avatar never drew at all — third eye, star map, lightning bolt, moon charm,
 * sun pendant, chrono gauntlet and Scholar's Quill — are drawn here from their names, because a
 * badge nobody can see is not a reward.
 */
const GEAR_SLOT: Record<string, GearSlot> = {
  bandana: "head", crown: "head", "flower-crown": "head", "champions-laurel": "head",
  "titans-circlet": "head", tiara: "head", horns: "head", halo: "head",
  hood: "cowl",
  "phoenix-feather": "ear", "scholars-quill": "ear",
  glasses: "face", monocle: "face", eyepatch: "face", "third-eye": "face",
  "war-paint": "face", "battle-scars": "face", "face-mask": "face",
  necklace: "neck", "cape-pin": "neck", scarf: "neck", "dragon-fang": "neck",
  "moon-charm": "neck", "sun-pendant": "neck",
  "shield-badge": "chest", "lightning-bolt": "chest",
  "shoulder-guard": "shoulder",
  "enchanted-ring": "hand", "wisdom-orb": "hand", "chrono-gauntlet": "hand",
  "angel-wings": "back", wings: "back",
  "star-map": "aura",
};

/** The head-slot kinds, for callers that only want to know what shape is up there. */
export function headGearOf(look: HeroLook): HeadGear {
  const id = look.gear?.id;
  if (!id) return "none";
  if (id === "hood") return "hood";
  if (id === "halo") return "halo";
  if (id === "horns") return "horns";
  if (id === "bandana") return "band";
  if (GEAR_SLOT[id] === "head") return "circlet";
  return "none";
}

/* ------------------------------------------------------------- companion */

/**
 * All 23 companions. A cat is not a wolf and a dragon is not either of them. Three pairs are
 * honestly one animal twice and are marked as such: Spirit Wolf is the wolf seen through, Baby
 * Dragon and Celestial Dragon are the dragon at other sizes and temperatures, and Pegasus and
 * Unicorn are one horse with the wings or the horn swapped in.
 */
const COMPANION: Record<string, Partial<CompanionLook> & { shape: CompanionShape }> = {
  cat: { shape: "cat", gait: "trot", scale: 0.85 },
  dog: { shape: "dog", gait: "trot" },
  fox: { shape: "fox", gait: "trot", scale: 0.9 },
  wolf: { shape: "wolf", gait: "trot", scale: 1.1 },
  "spirit-wolf": { shape: "wolf", gait: "trot", scale: 1.1, ghost: true, glow: true },
  bear: { shape: "bear", gait: "trot", scale: 1.25 },
  rabbit: { shape: "rabbit", gait: "hop", scale: 0.75 },
  frog: { shape: "frog", gait: "hop", scale: 0.8 },
  turtle: { shape: "turtle", gait: "trot", scale: 0.9 },
  snake: { shape: "snake", gait: "slither" },
  slime: { shape: "slime", gait: "bob" },
  owl: { shape: "owl", gait: "fly", scale: 0.85 },
  hawk: { shape: "hawk", gait: "fly", scale: 0.9 },
  bat: { shape: "bat", gait: "fly", scale: 0.7 },
  dragon: { shape: "dragon", gait: "fly", wings: true, scale: 1.15 },
  "baby-dragon": { shape: "dragon", gait: "fly", wings: true, scale: 0.72 },
  "celestial-dragon": { shape: "dragon", gait: "fly", wings: true, scale: 1.25, glow: true },
  hydra: { shape: "hydra", gait: "trot", scale: 1.05 },
  griffin: { shape: "griffin", gait: "fly", wings: true, scale: 1.05 },
  pegasus: { shape: "horse", gait: "fly", wings: true, scale: 1.1 },
  unicorn: { shape: "horse", gait: "trot", horn: true, scale: 1.1 },
  phoenix: { shape: "phoenix", gait: "fly", glow: true, scale: 0.95 },
  fairy: { shape: "fairy", gait: "fly", glow: true, scale: 0.6 },
};

/* ------------------------------------------------------------------- map */

export function heroLook(config: AvatarConfig | null | undefined): HeroLook {
  const c = config ?? DEFAULT_AVATAR;
  const accId = c.accessory ?? "";
  const crown = c.crown ? crownById(c.crown) : null;
  const outfitColor = wear(c.outfitColor);
  const outfit = OUTFIT[c.outfit] ?? { shape: "tunic" as OutfitShape };
  const foot = FEET[c.boots] ?? { shape: "boot" as FootShape };

  return {
    skin: skinHex(c.skinTone),
    hair: {
      ...PLAIN,
      ...(HAIR[c.hairStyle] ?? {}),
      id: c.hairStyle,
      color: wear(c.hairColor, 0.1),
    },
    outfit: {
      ...OUTFIT_BASE[outfit.shape],
      accent: GOLD,
      ...outfit,
      id: c.outfit,
      color: outfitColor,
    },
    cape: { on: CAPED.has(c.outfit) || accId === "cape-pin", color: wear(c.outfitColor, 0.2) },
    legs: {
      id: c.legwear,
      shape: LEGS[c.legwear] ?? "trousers",
      color: wear(c.legwearColor),
      metal: METAL_LEGS.has(c.legwear),
      glow: GLOW_LEGS.has(c.legwear),
    },
    feet: {
      strap: false, cuff: false, claw: false, winged: false, glow: false, metal: false,
      ...foot,
      id: c.boots,
      color: wear(c.bootsColor),
    },
    gear: accId ? { id: accId, slot: GEAR_SLOT[accId] ?? "chest", color: wear(c.accessoryColor, 0.22) } : null,
    // The 2D avatar draws an earned crown over the accessory; so does this, and it wins the head.
    crown: crown ? { color: crown.color, points: Math.min(7, 3 + Math.floor(crown.ordinal / 3)) } : null,
    companion: c.companion
      ? {
          gait: "trot", horn: false, wings: false, glow: false, ghost: false, scale: 1,
          ...(COMPANION[c.companion] ?? { shape: "dog" as CompanionShape }),
          id: c.companion,
          color: wear(c.companionColor, 0.2),
        }
      : null,
  };
}
