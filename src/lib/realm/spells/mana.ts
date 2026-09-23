import type { SpellDefinition } from "@/lib/utils/spell-catalog";

/**
 * MANA, tuned for an 8- and an 11-year-old (owner, 2026-09: "the bar barely moves, so mana means
 * nothing"). The numbers come from how long a child should wait, not from the other way round.
 *
 * Before: 100 mana, 5 a second, Ember Bolt 10 with a 0.9 s cooldown. A bolt took a tenth of the
 * bar and the bar earned half of it back before the key was ready again, so a child mashing 1
 * lost 6% a second and never saw it empty. Mana was decoration.
 *
 * Now the bar is a thing a child spends and gets back, and both halves are legible:
 *
 *   - **A flurry drains it.** `MANA_MAX` 50, so Ember Bolt (10, the cheapest spell in the
 *     catalog) is a fifth of the bar — a chunk you can see go. Five bolts at the 0.9 s cooldown
 *     empty it in 3.6 s, because regeneration waits `MANA_REGEN_DELAY_MS` after a cast and the
 *     cooldown (0.9 s) is shorter than that wait: while the child keeps casting, nothing flows
 *     back. Two keys at once empty it faster.
 *   - **It never keeps them waiting.** Stop casting and it starts filling a second later, at
 *     `MANA_REGEN_PER_S` 12.5: one bolt's worth in 0.8 s, the whole bar in 4 s — from empty to
 *     full in 5 s, which is about the time it takes to walk (at 11 units a second) to the next
 *     trouble. An empty bar is a breath, not a sulk.
 *   - **Every spell is castable, and none is free.** The catalog's costs run from 10 (a bolt)
 *     to 45 (a Sprite of Binding: 30 + 15), so the dearest spell takes 90% of a full bar — a
 *     big spell is an event you save up for — and the cheapest still costs a fifth.
 *   - **Hitting pays.** Clearing a trouble gives back `MANA_PER_CLEAR`, one Ember Bolt's worth,
 *     so a child who lands their shots can keep a fight going; one who sprays at nothing drains.
 *     (A `mended` spell still refunds its whole cost on every hit, as in the flat Realm.)
 *
 * The flat Realm's `stepMana` has no regen delay (it was the only caster there, and it is no
 * longer rendered); the 3D caster (`lib/realm3d/casting.ts`) applies it.
 */
export const MANA_MAX = 50;
export const MANA_REGEN_PER_S = 12.5;
/** How long after a cast mana starts to flow back. Longer than a bolt's 0.9 s cooldown, on purpose. */
export const MANA_REGEN_DELAY_MS = 1000;
/** Clearing a trouble: one Ember Bolt back. */
export const MANA_PER_CLEAR = 10;

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
