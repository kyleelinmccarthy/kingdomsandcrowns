import type { SpellDefinition } from "@/lib/utils/spell-catalog";

export const MANA_MAX = 100;
export const MANA_REGEN_PER_S = 5;

export function startMana(): number {
  return MANA_MAX;
}

export function stepMana(mana: number, dt: number): number {
  return Math.min(MANA_MAX, mana + MANA_REGEN_PER_S * dt);
}

export function canCast(mana: number, spell: SpellDefinition): boolean {
  return mana >= spell.manaCost;
}

export function spend(mana: number, spell: SpellDefinition): number {
  return Math.max(0, mana - spell.manaCost);
}

export function refund(mana: number, spell: SpellDefinition): number {
  return Math.min(MANA_MAX, mana + spell.manaCost);
}
