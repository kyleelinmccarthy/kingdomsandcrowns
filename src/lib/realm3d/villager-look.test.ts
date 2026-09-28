import { describe, expect, it } from "vitest";
import { VILLAGERS, villagerAvatar } from "@/lib/realm/villagers";
import { SKIN_TONES } from "@/lib/utils/avatar-catalog";
import { heroLook } from "./hero-look";
import { villagerLook } from "./villager-look";

/** Hue-free lightness and saturation of a #rrggbb, for "reads as grey" and "reads as flour". */
function hsl(hex: string): { s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

describe("villagerLook — the eight villagers are people, drawn with the hero's own figure", () => {
  it("gives every villager a look, and none to a name the village does not know", () => {
    for (const v of VILLAGERS) {
      const look = villagerLook(v.id);
      expect(look, v.id).not.toBeNull();
      expect(look!.skin, v.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(villagerLook("nobody")).toBeNull();
  });

  it("dresses each one exactly as the flat Realm draws them: the same config the talk panel's portrait uses", () => {
    for (const v of VILLAGERS) {
      const look = villagerLook(v.id)!;
      expect(look).toEqual(heroLook(villagerAvatar(v)));
      expect(look.skin).toBe(SKIN_TONES.find((t) => t.id === v.figure.skinTone)!.hex);
      expect(look.hair.id).toBe(v.figure.hairStyle);
      expect(look.outfit.id).toBe(v.figure.outfit);
      expect(look.gear?.id ?? null).toBe(v.figure.accessory);
      // A villager never has the hero's pet or an earned crown.
      expect(look.companion).toBeNull();
      expect(look.crown).toBeNull();
    }
  });

  it("never dresses two villagers alike", () => {
    const seen = new Map<string, string>();
    for (const v of VILLAGERS) {
      const key = JSON.stringify(villagerLook(v.id));
      expect(seen.get(key), `${v.id} is dressed exactly like ${seen.get(key)}`).toBeUndefined();
      seen.set(key, v.id);
    }
    expect(seen.size).toBe(VILLAGERS.length);
  });

  it("is the same object each time it is asked, so a scene can memoise on it", () => {
    expect(villagerLook("bram")).toBe(villagerLook("bram"));
  });

  it("makes Old Bram read as old: silver hair, not a dark head", () => {
    const hair = hsl(villagerLook("bram")!.hair.color);
    expect(hair.s).toBeLessThan(0.15);
    expect(hair.l).toBeGreaterThan(0.7);
  });

  it("makes Miller Tessa read as a miller: floury, pale working clothes with the sleeves off, and a kerchief over her hair", () => {
    const tessa = villagerLook("tessa")!;
    expect(tessa.outfit.sleeves).toBe("bare");
    expect(hsl(tessa.outfit.color).l).toBeGreaterThan(0.75);
    expect(tessa.gear?.id).toBe("bandana");
  });
});
