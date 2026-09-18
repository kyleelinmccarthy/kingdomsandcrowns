/**
 * SPIKE — throwaway. The child's `AvatarConfig` reduced to something a low-poly figure can
 * actually wear. Pure arithmetic and lookup tables: no `three` here, so it stays importable
 * from anywhere (the three-shaped half lives in `components/realm3d/hero-figure.tsx`).
 *
 * The honest finding this file encodes: at the Realm's camera distance a hero is about seventy
 * pixels tall. What reads at seventy pixels is COLOUR and SILHOUETTE — the hue of the coat, the
 * shape of the hair, whether there is a cape behind and a crown on top. A belt buckle does not
 * read, a pauldron rivet does not read, and forty bespoke models would buy nothing a child could
 * see. So the catalog's ~120 ids collapse onto a small number of silhouette families, and every
 * colour the child picked is carried through untouched.
 *
 * What a child loses is named in each table's comment. The short version: two outfits in the
 * same family are told apart only by their colour, and a few fine accessories become one
 * generic glowing charm at the chest.
 */

import {
  DEFAULT_AVATAR,
  SKIN_TONES,
  type AvatarConfig,
} from "@/lib/utils/avatar-catalog";
import { crownById } from "@/lib/utils/crown-catalog";

/* --------------------------------------------------------------- families */

/** Seven hair silhouettes. Everything the catalog offers is one of these from behind. */
export type HairShape = "cap" | "long" | "spiky" | "puff" | "tail" | "bun" | "twin";
/** Four body silhouettes: straight, flaring, boxy-with-shoulders, knee-length. */
export type OutfitShape = "tunic" | "robe" | "plate" | "coat";
export type LegShape = "trousers" | "shorts" | "skirt";
export type FootShape = "shoe" | "boot" | "tall";
/** What sits on (or around) the head, over and above the earned crown. */
export type HeadGear = "none" | "circlet" | "horns" | "hood" | "band" | "halo";
export type CompanionShape = "beast" | "flier" | "blob";

export type HeroLook = {
  skin: string;
  hair: { shape: HairShape; color: string };
  /** `metal` bodies take a steel cast with the child's colour kept as trim and pauldrons. */
  outfit: { shape: OutfitShape; color: string; metal: boolean };
  cape: { on: boolean; color: string };
  legs: { shape: LegShape; color: string; metal: boolean };
  feet: { shape: FootShape; color: string; winged: boolean };
  gear: {
    head: HeadGear;
    color: string;
    /** A dark bar across the eyes — glasses, a monocle, an eyepatch, a third eye. */
    glasses: boolean;
    /** Flat planes off the back. */
    wings: boolean;
    pauldrons: boolean;
    /** The catch-all: a small lit gem at the chest for every charm too fine to model. */
    charm: boolean;
  };
  /** The earned crown — its own field in the config, and the strongest "that is mine" signal here. */
  crown: { color: string; points: number } | null;
  companion: { shape: CompanionShape; color: string; horn: boolean; glow: boolean } | null;
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

/* ------------------------------------------------------------------- hair */

/**
 * 22 hair ids → 7 shapes. A child who picked "dreadlocks" gets the same long slab as one who
 * picked "wavy"; the hair COLOUR still separates them, and at this size the long/short/spiky
 * decision is the whole of what anyone can see anyway.
 */
const HAIR: Record<string, HairShape> = {
  short: "cap", cropped: "cap", "side-shave": "cap",
  long: "long", wavy: "long", flowing: "long", "celestial-locks": "long", dreadlocks: "long",
  spiky: "spiky", mohawk: "spiky", "phoenix-crest": "spiky",
  curly: "puff", afro: "puff", shag: "puff",
  ponytail: "tail", braided: "tail", "warrior-braid": "tail", "battle-braids": "tail",
  bun: "bun", topknot: "bun",
  pigtails: "twin", "twin-tails": "twin",
};

/* ----------------------------------------------------------------- outfit */

/**
 * 23 outfit ids → 4 shapes. The split is the one the eye makes: does it flare to the floor,
 * is it boxy metal with shoulders, does it hang to the knee, or is it a plain body?
 * Lost: "dragonscale" and "titan's plate" are the same armoured box in different colours.
 */
const OUTFIT: Record<string, OutfitShape> = {
  tunic: "tunic", vest: "tunic",
  robe: "robe", "mystic-robes": "robe", "wizard-robes": "robe", "archmage-vestments": "robe",
  "celestial-raiment": "robe", "nature-weave": "robe", "royal-garb": "robe", "battle-dress": "robe",
  armor: "plate", "chain-mail": "plate", "knight-plate": "plate", "paladin-armor": "plate",
  dragonscale: "plate", "phoenix-armor": "plate", "titans-plate": "plate",
  "frost-mail": "plate", "inferno-plate": "plate",
  cloak: "coat", cape: "coat", "ranger-coat": "coat", "shadow-cloak": "coat",
};

/** The 2D avatar draws these as grey steel with the picked colour as trim. So does this. */
const METAL_OUTFITS = new Set([
  "armor", "chain-mail", "knight-plate", "paladin-armor", "dragonscale",
  "phoenix-armor", "titans-plate", "frost-mail", "inferno-plate",
]);

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

/** 15 boot ids → 3 heights. Sandals and slippers read as bare feet; greaves read as tall boots. */
const FEET: Record<string, FootShape> = {
  sandals: "shoe", "cloth-shoes": "shoe", "arcane-slippers": "shoe",
  "iron-boots": "tall", "plated-boots": "tall", "knight-sabatons": "tall",
  "dragon-boots": "tall", "titan-boots": "tall", "celestial-boots": "tall",
};

/* ------------------------------------------------------------- accessory */

/**
 * 33 accessory ids → five things you can see plus one catch-all. A necklace, a ring, a quill and
 * a star map are all, at seventy pixels, "a small bright thing on the chest" — so that is what
 * they become. A child who earned Scholar's Quill sees a gem in their colour, not a quill: the
 * honest loss, and the alternative was thirty models nobody could resolve.
 */
const HEADGEAR: Record<string, HeadGear> = {
  crown: "circlet", tiara: "circlet", "flower-crown": "circlet",
  "champions-laurel": "circlet", "titans-circlet": "circlet",
  halo: "halo",
  horns: "horns", "dragon-fang": "horns",
  hood: "hood", "face-mask": "hood",
  bandana: "band", scarf: "band", "war-paint": "band", "battle-scars": "band",
};

const GLASSES = new Set(["glasses", "monocle", "eyepatch", "third-eye"]);
const WINGED_ACC = new Set(["wings", "angel-wings", "phoenix-feather"]);

/* ------------------------------------------------------------- companion */

/** 23 companions → 3 gaits. A fox and a wolf differ by colour; a hawk flies, a slime hops. */
const COMPANION: Record<string, CompanionShape> = {
  slime: "blob", frog: "blob", snake: "blob", turtle: "blob", hydra: "blob",
  owl: "flier", hawk: "flier", bat: "flier", dragon: "flier", "baby-dragon": "flier",
  "celestial-dragon": "flier", phoenix: "flier", griffin: "flier", pegasus: "flier", fairy: "flier",
};

const GLOWING = new Set(["fairy", "phoenix", "celestial-dragon", "spirit-wolf"]);

/* ------------------------------------------------------------------- map */

export function heroLook(config: AvatarConfig | null | undefined): HeroLook {
  const c = config ?? DEFAULT_AVATAR;
  const acc = c.accessory ?? "";
  const crown = c.crown ? crownById(c.crown) : null;

  return {
    skin: skinHex(c.skinTone),
    hair: { shape: HAIR[c.hairStyle] ?? "cap", color: wear(c.hairColor, 0.1) },
    outfit: {
      shape: OUTFIT[c.outfit] ?? "tunic",
      color: wear(c.outfitColor),
      metal: METAL_OUTFITS.has(c.outfit),
    },
    cape: { on: CAPED.has(c.outfit) || acc === "cape-pin", color: wear(c.outfitColor, 0.2) },
    legs: {
      shape: LEGS[c.legwear] ?? "trousers",
      color: wear(c.legwearColor),
      metal: METAL_LEGS.has(c.legwear),
    },
    feet: {
      shape: FEET[c.boots] ?? "boot",
      color: wear(c.bootsColor),
      winged: c.boots === "winged-boots",
    },
    gear: {
      head: HEADGEAR[acc] ?? "none",
      color: wear(c.accessoryColor, 0.22),
      glasses: GLASSES.has(acc),
      wings: WINGED_ACC.has(acc),
      pauldrons: acc === "shoulder-guard" || METAL_OUTFITS.has(c.outfit),
      // Anything the catalog offers that is not one of the above still deserves to show up.
      charm:
        acc !== "" &&
        !(acc in HEADGEAR) &&
        !GLASSES.has(acc) &&
        !WINGED_ACC.has(acc) &&
        acc !== "shoulder-guard",
    },
    // The 2D avatar draws an earned crown over the accessory; so does this, and it wins the head.
    crown: crown ? { color: crown.color, points: Math.min(7, 3 + Math.floor(crown.ordinal / 3)) } : null,
    companion: c.companion
      ? {
          shape: COMPANION[c.companion] ?? "beast",
          color: wear(c.companionColor, 0.2),
          horn: c.companion === "unicorn",
          glow: GLOWING.has(c.companion),
        }
      : null,
  };
}
