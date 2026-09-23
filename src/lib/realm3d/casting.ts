/**
 * CASTING — mana, cooldowns and refusals, as one mutable struct stepped by the frame loop.
 *
 * The app already has a mana model and a spell catalog and they are REAL: a child's spells are
 * rows in their spellbook, earned by quests, badges and levels, and `MANA_MAX` / `MANA_REGEN`
 * / `canCast` / `spend` are the flat Realm's own numbers. None of that is re-invented here —
 * this module imports it. What it adds is the one thing the flat Realm's caster does not have
 * and this world needs: a PER-SLOT COOLDOWN a child can see.
 *
 * Why a cooldown at all, when mana already limits casting? Because mana limits the tenth cast
 * and a child needs the second one limited. Holding 1 down fires Ember Bolt ten times in
 * under a second, which looks like a bug and empties the bar before the child has seen a
 * single bolt fly. A cooldown makes each press its own event, and drawn as a wipe across the
 * key it also answers, without a word, the question "why did nothing happen?".
 *
 * Also different from `caster.ts`: there is no "busy" refusal. That caster allowed one cast in
 * flight at a time, because a tap-to-target realm had one crosshair. Here four keys are four
 * keys, and a child pressing 1 then 2 should get a bolt and a burst, not a bolt and a shrug.
 *
 * Everything mutates in place and the clock is handed in as `dt`. No `Date.now()`, no
 * `performance.now()`, no `Math.random()`: the same presses at the same dts give the same
 * numbers, which is the only reason any of this is testable.
 */

import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import { MANA_MAX, MANA_REGEN_DELAY_MS, MANA_REGEN_PER_S, canCast, spend } from "@/lib/realm/spells/mana";

export { MANA_MAX, MANA_REGEN_DELAY_MS, MANA_REGEN_PER_S };

/** Why a press did nothing. Never null in the struct — `refusal` is null when the last press worked. */
export type CastRefusal = "mana" | "cooldown";

export type Caster = {
  mana: number;
  /** Milliseconds since the caster started. Advanced only by `stepCaster`. */
  clock: number;
  /** Per slot (index = slot - 1): the clock reading at which the slot is castable again. */
  readyAt: number[];
  /** Per slot: how long the cooldown that is running was, so a wipe knows its own length. */
  coolMs: number[];
  /** The last press that did nothing, for the bar to shake at. */
  refusal: CastRefusal | null;
  refusedSlot: number;
  refusedAt: number;
  /** The clock reading of the last cast that happened: mana waits `MANA_REGEN_DELAY_MS` after it. */
  castAt: number;
};

export function makeCaster(slots: number): Caster {
  return {
    mana: MANA_MAX,
    clock: 0,
    readyAt: new Array(slots).fill(0),
    coolMs: new Array(slots).fill(1),
    refusal: null,
    refusedSlot: 0,
    refusedAt: -1e9,
    castAt: -1e9,
  };
}

/**
 * How long a slot rests after a cast, from the spell itself so the number is never a literal
 * somewhere a child cannot feel.
 *
 * A cheap bolt (10 mana) rests 900ms and an expensive summon (30) rests 1.5s: pressing the
 * little spell feels quick and the big one feels like an event, which is the read a child
 * should get from the cost without being told it. Clamped so no spell ever rests less than
 * half a second (or the key still machine-guns) or more than two and a half (or it feels
 * broken).
 */
export function cooldownMsFor(spell: SpellDefinition): number {
  const ms = 500 + spell.manaCost * 40;
  const rest = ms < 500 ? 500 : ms > 2500 ? 2500 : ms;
  // Quicken is "cast in a flash": the flat Realm halves the cast (`resolveSpell` halves
  // `castMs`, which the 3D charge already lasts), and here the rest after it halves too — or its
  // +5 mana would make the quick spell the SLOWER key, which is the opposite of its name.
  return quickened(spell) ? Math.max(QUICK_MIN_MS, Math.round(rest / 2)) : rest;
}

/** The floor under a quickened rest: quick, but still one press, one spell. */
export const QUICK_MIN_MS = 400;

function quickened(spell: SpellDefinition): boolean {
  for (const s of spell.statuses) if (s.kind === "quickened") return true;
  return false;
}

/**
 * Advances the clock and regenerates mana — but only once `MANA_REGEN_DELAY_MS` has passed since
 * the last cast, so a flurry drains the bar and a pause refills it (`lib/realm/spells/mana.ts`
 * has the reasoning). Mutates; allocates nothing.
 */
export function stepCaster(c: Caster, dt: number): void {
  c.clock += dt * 1000;
  // Only the part of this step that falls after the wait counts.
  const past = c.clock - c.castAt - MANA_REGEN_DELAY_MS;
  if (c.mana < MANA_MAX && past > 0) {
    const ms = past < dt * 1000 ? past : dt * 1000;
    const next = c.mana + (MANA_REGEN_PER_S * ms) / 1000;
    c.mana = next > MANA_MAX ? MANA_MAX : next;
  }
}

/** 0 when the slot is ready, 1 the instant it was cast, falling as the cooldown runs out. */
export function cooldownLeft(c: Caster, slot: number): number {
  const i = slot - 1;
  if (i < 0 || i >= c.readyAt.length) return 0;
  const left = c.readyAt[i] - c.clock;
  if (left <= 0) return 0;
  const span = c.coolMs[i];
  const f = left / (span > 0 ? span : 1);
  return f > 1 ? 1 : f;
}

export function slotReady(c: Caster, slot: number): boolean {
  return cooldownLeft(c, slot) <= 0;
}

/**
 * Tries a cast. Returns the spell when it happened — mana already spent, cooldown already
 * running — and null when it did not, with `refusal` set to why.
 *
 * Cooldown is checked BEFORE mana on purpose: a child hammering a key they cannot afford
 * should be told about the cost, not about the wait, so the wait must not get in first and
 * mask it. Cooldown wins only while it is actually running, which is the shorter state.
 */
export function tryCast(c: Caster, slot: number, spell: SpellDefinition): SpellDefinition | null {
  const i = slot - 1;
  if (i < 0 || i >= c.readyAt.length) return null;
  if (c.clock < c.readyAt[i]) {
    c.refusal = "cooldown";
    c.refusedSlot = slot;
    c.refusedAt = c.clock;
    return null;
  }
  if (!canCast(c.mana, spell)) {
    c.refusal = "mana";
    c.refusedSlot = slot;
    c.refusedAt = c.clock;
    return null;
  }
  c.mana = spend(c.mana, spell);
  c.castAt = c.clock;
  c.coolMs[i] = cooldownMsFor(spell);
  c.readyAt[i] = c.clock + c.coolMs[i];
  c.refusal = null;
  return spell;
}

/** How long a refusal stays on screen as a shake. */
export const REFUSAL_MS = 520;

/** The slot to shake right now, or 0 for none. */
export function shakingSlot(c: Caster): number {
  if (c.refusal === null) return 0;
  return c.clock - c.refusedAt <= REFUSAL_MS ? c.refusedSlot : 0;
}

/* ------------------------------------------------------------- the key queue */

/**
 * Presses waiting for a frame. The key handler cannot cast on its own — a cast is decided
 * against a mana total and a clock the frame loop owns — so it writes the slot here and the
 * driver drains it.
 *
 * Four deep, and a fixed array so a child leaning on the number row allocates nothing. Past
 * four in one frame the extras are dropped, which at sixteen milliseconds a frame is a press
 * rate no hand produces.
 */
export type CastQueue = { n: number; slots: number[] };

export function makeCastQueue(): CastQueue {
  return { n: 0, slots: [0, 0, 0, 0] };
}

export function pushCast(q: CastQueue, slot: number): void {
  if (q.n < q.slots.length) q.slots[q.n++] = slot;
}

/** Empties the queue once a frame has acted on it. */
export function drainCasts(q: CastQueue): void {
  q.n = 0;
}

/** "Digit3" -> 3, and 0 for anything that is not a number-row key. */
export function digitSlot(code: string): number {
  if (!code.startsWith("Digit")) return 0;
  const n = code.charCodeAt(5) - 48;
  return n >= 1 && n <= 9 ? n : 0;
}

/** Mana as a 0..1 fraction, for a bar's width. */
export function manaFraction(c: Caster): number {
  return c.mana / MANA_MAX;
}
