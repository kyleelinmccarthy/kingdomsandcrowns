"use client";

import { useRef, useState, type RefObject } from "react";
import type { Prop, Vec2, WorldLayout } from "@/lib/realm/layout";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import { startMana, stepMana, refund } from "@/lib/realm/spells/mana";
import { beginCast, stepCaster, type CasterState } from "@/lib/realm/spells/caster";
import { releaseEffect, stepEffects, barrierColliders, heroShielded, hasStatus, type SpellEffect } from "@/lib/realm/spells/effects";
import { spawnTroubles, stepTroubles, applyHit, startTally, recordClear, type Trouble, type TroubleKind, type ClearTally } from "@/lib/realm/spells/troubles";
import { startFocus, stepFocus, isDazzled, type FocusState } from "@/lib/realm/spells/focus";
import type { CastRequest } from "./use-realm-input";

export type SpellEvent =
  | { kind: "mana"; current: number }
  | { kind: "cleared"; troubleKind: TroubleKind; count: number }
  | { kind: "refused" }
  | { kind: "focusLost" }
  | { kind: "castState"; casting: boolean };

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

  // A cast request becomes a wind-up when a page is selected.
  if (input.castRequest && input.selectedSpell && input.selectedSlot !== null) {
    const tap = "target" in input.castRequest ? input.castRequest.target : nearestTroubleOrAhead(troubles, input.hero, input.selectedSpell.range);
    const begun = beginCast(caster, input.selectedSpell, input.selectedSlot, input.hero, tap, mana, now);
    caster = begun.state;
    mana = begun.mana;
    if (begun.refused === "mana") emit({ kind: "refused" });
    if (begun.refused === null) emit({ kind: "castState", casting: true });
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

function nearestTroubleOrAhead(troubles: Trouble[], hero: Vec2, range: number): Vec2 {
  let best: Trouble | null = null;
  let bestD = range;
  for (const t of troubles) {
    const d = Math.hypot(t.position.x - hero.x, t.position.z - hero.z);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best ? best.position : { x: hero.x, z: hero.z - Math.max(1, range) };
}

/** Keeps the simulation in a ref for the frame loop; created once, never re-created on re-render. */
export function useSpellSimRef(): RefObject<SpellSim> {
  const [initial] = useState<SpellSim>(startSpellSim);
  return useRef<SpellSim>(initial);
}
