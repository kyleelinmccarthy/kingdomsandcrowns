/**
 * Who each villager IS, as the hero's own figure wears it.
 *
 * The island's villagers used to be one faceless robed doll with a status-coloured tunic, eight
 * times over — no eyes, no hands, and nothing to tell Old Bram from Keeper Ivy but a nameplate.
 * They are people, and the realm already has a person: the hero's figure (`hero-figure.tsx`),
 * with a face, hands, hair, clothes and gear. So a villager is that figure, wearing the look the
 * flat Realm has always given them — `villagerAvatar` over `VILLAGERS`, the same config the talk
 * panel's portrait is drawn from — pushed through the same `heroLook` the child's avatar goes
 * through. One mapping, one figure, and the portrait and the person always agree.
 *
 * Pure and `three`-free, like `hero-look.ts`. Each look is built once and handed back as the same
 * object every time, so a scene can memoise on it.
 */

import { VILLAGERS, villagerAvatar } from "@/lib/realm/villagers";
import { heroLook, type HeroLook } from "./hero-look";

const LOOKS: ReadonlyMap<string, HeroLook> = new Map(VILLAGERS.map((v) => [v.id, heroLook(villagerAvatar(v))]));

/** A villager's look by their id (`"bram"`), or null for a name the village does not know. */
export function villagerLook(id: string): HeroLook | null {
  return LOOKS.get(id) ?? null;
}
