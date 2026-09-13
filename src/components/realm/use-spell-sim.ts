"use client";

import { useRef, useState, type RefObject } from "react";
import type { Prop, Vec2, WorldLayout } from "@/lib/realm/layout";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import { startMana, stepMana, refund } from "@/lib/realm/spells/mana";
import { beginCast, stepCaster, type CasterState } from "@/lib/realm/spells/caster";
import { releaseEffect, stepEffects, barrierColliders, heroShielded, hasStatus, type SpellEffect } from "@/lib/realm/spells/effects";
import { spawnTroubles, stepTroubles, applyHit, startTally, recordClear, type Trouble, type TroubleKind, type ClearTally } from "@/lib/realm/spells/troubles";
import { startFocus, stepFocus, isDazzled, type FocusState } from "@/lib/realm/spells/focus";
import { pickTarget } from "@/lib/realm/targeting";
import type { CastRequest } from "./use-realm-input";

/**
 * Why a cast did not happen. A refusal with no cause used to be safe — a mana shortfall
 * was the only one — but §4.2's out-of-range refusal would otherwise be reported to a
 * child as "Not enough mana yet.", which is false and teaches the wrong lesson.
 */
export type RefusalReason = "mana" | "range";

export type SpellEvent =
  | { kind: "mana"; current: number }
  | { kind: "cleared"; troubleKind: TroubleKind; count: number }
  | { kind: "refused"; reason: RefusalReason }
  | { kind: "focusLost" }
  | { kind: "castState"; casting: boolean };

/** How wide a click counts as "pointing at" a trouble, in world units (§4.2). */
export const POINTER_RADIUS = 1.5;

export type SpellSim = {
  mana: number;
  caster: CasterState;
  effects: SpellEffect[];
  troubles: Trouble[];
  focus: FocusState;
  tally: ClearTally;
  clearedSites: Record<string, number>;
  now: number; // simulation clock, ms, advances only while the world runs
  nextId: number;
  lastManaReported: number;
  lastVanished: Record<string, { x: number; z: number; color: string }>; // effects that ended this frame, for the burst
};

export function startSpellSim(): SpellSim {
  return { mana: startMana(), caster: { selectedSlot: null, casting: null }, effects: [], troubles: [], focus: startFocus(), tally: startTally(), clearedSites: {}, now: 0, nextId: 1, lastManaReported: -1, lastVanished: {} };
}

export type SpellSimInput = {
  layout: WorldLayout;
  hero: Vec2;
  dt: number;
  selectedSpell: SpellDefinition | null;
  selectedSlot: number | null;
  castRequest: CastRequest | null;
  lowStimulus: boolean;
  reducedMotion: boolean;
  seed: number;
};

/** Advances every spell system one frame. Pure apart from the id counter; the caller owns the ref. */
export function stepSpellSim(sim: SpellSim, input: SpellSimInput, emit: (e: SpellEvent) => void): { sim: SpellSim; dazzled: boolean; casting: boolean } {
  const now = sim.now + input.dt * 1000;
  let mana = stepMana(sim.mana, input.dt);
  let caster = sim.caster;
  let effects = sim.effects;
  let nextId = sim.nextId;
  const colliders: Prop[] = input.layout.colliders;
  const troubleColliders = colliders.concat(barrierColliders(effects));

  // Troubles first: spawn, then move.
  let troubles = spawnTroubles({ seed: input.seed, now, layout: input.layout, troubles: sim.troubles, clearedSites: sim.clearedSites, lowStimulus: input.lowStimulus });
  const shielded = heroShielded(effects, now);
  const stepped = stepTroubles(troubles, input.hero, input.dt, troubleColliders, { now, lowStimulus: input.lowStimulus, reducedMotion: input.reducedMotion, shielded, dazzled: isDazzled(sim.focus, now) });
  troubles = stepped.troubles;
  const focus = stepFocus(sim.focus, stepped.focusLost, now);
  if (stepped.focusLost) emit({ kind: "focusLost" });

  // A cast request becomes a wind-up when a page is selected. BOTH ways of casting arrive
  // here — the pointer's `{ target }` and a number key's `{ nearest: true }` — so this is
  // the one place §4.2's targeting rule has to live for the refusal to cover both. Aiming
  // happens BEFORE beginCast, so a cast with nothing in range cannot spend a drop of mana.
  if (input.castRequest && input.selectedSpell && input.selectedSlot !== null) {
    const aim = aimFor(input.selectedSpell, input.castRequest, troubles, input.hero);
    if (aim === null) {
      emit({ kind: "refused", reason: "range" });
    } else {
      const begun = beginCast(caster, input.selectedSpell, input.selectedSlot, input.hero, aim, mana, now);
      caster = begun.state;
      mana = begun.mana;
      if (begun.refused === "mana") emit({ kind: "refused", reason: "mana" });
      if (begun.refused === null) emit({ kind: "castState", casting: true });
    }
  }
  const release = stepCaster(caster, now);
  caster = release.state;
  if (release.released) {
    effects = effects.concat(releaseEffect(release.released.spell, input.hero, release.released.target, now, `e${nextId++}`));
    emit({ kind: "castState", casting: false });
  }

  // Effects fly, hit, and expire. Anything that ended this frame is remembered once for the burst.
  const result = stepEffects(effects, troubles, input.hero, colliders, input.dt, now);
  const lastVanished: SpellSim["lastVanished"] = {};
  for (const e of effects) {
    if ((e.kind === "projectile" || e.kind === "area") && !result.effects.some((s) => s.id === e.id)) {
      lastVanished[e.id] = { x: e.position.x, z: e.position.z, color: e.spell.color };
    }
  }
  effects = result.effects.concat(result.spawned);
  let tally = sim.tally;
  const clearedSites = { ...sim.clearedSites };
  for (const hit of result.hits) {
    const index = troubles.findIndex((t) => t.id === hit.troubleId);
    if (index === -1) continue;
    const applied = applyHit(troubles[index], hit.spell, now);
    if (hasStatus(hit.spell, "mended")) mana = refund(mana, hit.spell);
    if (applied.cleared) {
      tally = recordClear(tally, applied.trouble.kind);
      clearedSites[applied.trouble.siteId] = now;
      troubles = troubles.filter((_, i) => i !== index);
      emit({ kind: "cleared", troubleKind: applied.trouble.kind, count: tally.session });
    } else {
      troubles = troubles.map((t, i) => (i === index ? applied.trouble : t));
    }
  }

  let lastManaReported = sim.lastManaReported;
  if (Math.round(mana) !== lastManaReported) {
    lastManaReported = Math.round(mana);
    emit({ kind: "mana", current: lastManaReported });
  }

  return {
    sim: { mana, caster, effects, troubles, focus, tally, clearedSites, now, nextId, lastManaReported, lastVanished },
    dazzled: isDazzled(focus, now),
    casting: caster.casting !== null,
  };
}

/**
 * Where this cast is aimed, or `null` when nothing is in range and it must refuse.
 * Replaces the old `nearestTroubleOrAhead`, which fell back to a point one range north of
 * the hero — the parked bug where a cast with nothing nearby fired into empty grass and
 * still spent the mana.
 */
function aimFor(spell: SpellDefinition, request: CastRequest, troubles: Trouble[], hero: Vec2): Vec2 | null {
  // A self spell lands on the caster and carries `range: 0` by definition, so putting it
  // through the targeting rule would make Shield and Aura permanently uncastable. It needs
  // no trouble and never fires into the grass, so there is nothing here for §4.2 to refuse.
  if (spell.shape === "self") return { ...hero };
  const picked = pickTarget({
    pointer: "target" in request ? request.target : null,
    hero,
    troubles,
    range: spell.range,
    pointerRadius: POINTER_RADIUS,
  });
  return "refused" in picked ? null : picked.position;
}

/** Keeps the simulation in a ref for the frame loop; created once, never re-created on re-render. */
export function useSpellSimRef(): RefObject<SpellSim> {
  const [initial] = useState<SpellSim>(startSpellSim);
  return useRef<SpellSim>(initial);
}
