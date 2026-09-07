import type { Vec2 } from "../layout";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import { canCast, spend } from "./mana";

export type CastTarget = Vec2;
export type Casting = { spell: SpellDefinition; slot: number; target: CastTarget; startedAt: number; releaseAt: number };
export type CasterState = { selectedSlot: number | null; casting: Casting | null };
export type Refusal = "mana" | "busy" | null;

export function selectSlot(state: CasterState, slot: number | null): CasterState {
  return { ...state, selectedSlot: slot };
}

/** Unit vector from the hero to a point; a tap on the hero itself fires north. */
export function directionFrom(hero: Vec2, target: Vec2): Vec2 {
  const dx = target.x - hero.x;
  const dz = target.z - hero.z;
  const len = Math.hypot(dx, dz);
  return len < 1e-6 ? { x: 0, z: -1 } : { x: dx / len, z: dz / len };
}

/** Where a spell lands for its shape: areas and walls within range, beams at full range, self spells on the hero. */
export function castTargetFor(spell: SpellDefinition, hero: Vec2, tap: Vec2): CastTarget {
  const dir = directionFrom(hero, tap);
  const d = Math.hypot(tap.x - hero.x, tap.z - hero.z);
  switch (spell.shape) {
    case "self":
      return { ...hero };
    case "beam":
      return { x: hero.x + dir.x * spell.range, z: hero.z + dir.z * spell.range };
    case "area":
    case "barrier": {
      const r = Math.min(d, spell.range);
      return { x: hero.x + dir.x * r, z: hero.z + dir.z * r };
    }
    case "projectile":
    case "summon":
      return { ...tap };
  }
}

export function beginCast(state: CasterState, spell: SpellDefinition, slot: number, hero: Vec2, tap: Vec2, mana: number, now: number): { state: CasterState; mana: number; refused: Refusal } {
  if (state.casting) return { state, mana, refused: "busy" };
  if (!canCast(mana, spell)) return { state, mana, refused: "mana" };
  const target = castTargetFor(spell, hero, tap);
  return {
    state: { ...state, casting: { spell, slot, target, startedAt: now, releaseAt: now + spell.castMs } },
    mana: spend(mana, spell),
    refused: null,
  };
}

export function stepCaster(state: CasterState, now: number): { state: CasterState; released: Casting | null } {
  if (!state.casting || now < state.casting.releaseAt) return { state, released: null };
  return { state: { ...state, casting: null }, released: state.casting };
}
