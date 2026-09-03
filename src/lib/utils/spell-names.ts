import { findElement, findForm, findModifier, type SpellParts } from "./spell-catalog";

/**
 * Spell names come from a word bank tied to the parts, never free text: a
 * hero's spellbook needs no moderation and every name reads in the Realm's
 * voice. Null means the parts are not a real spell.
 */
export function spellNameOptions(parts: SpellParts) {
  const element = findElement(parts.elementId);
  const form = findForm(parts.formId);
  const modifier = parts.modifierId === null ? null : findModifier(parts.modifierId);
  if (!element || !form || (parts.modifierId !== null && !modifier)) return null;
  return { adjectives: [...element.adjectives], nouns: [...form.nouns], suffix: modifier?.suffix ?? null };
}

export function defaultSpellName(parts: SpellParts): { adjective: string; noun: string } | null {
  const options = spellNameOptions(parts);
  if (!options) return null;
  return { adjective: options.adjectives[0], noun: options.nouns[0] };
}

export function isValidSpellName(parts: SpellParts, adjective: string, noun: string): boolean {
  const options = spellNameOptions(parts);
  return !!options && options.adjectives.includes(adjective) && options.nouns.includes(noun);
}

export function displaySpellName(parts: SpellParts, adjective: string, noun: string): string {
  const suffix = spellNameOptions(parts)?.suffix;
  return suffix ? `${adjective} ${noun} ${suffix}` : `${adjective} ${noun}`;
}
