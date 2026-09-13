import { describe, it, expect } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { startSpellSim, stepSpellSim, type SpellEvent } from "./use-spell-sim";

const layout = buildWorldLayout({ castleType: "keep", buildings: [] });
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!;
const base = { layout, dt: 1 / 60, selectedSpell: bolt, selectedSlot: 0, lowStimulus: false, reducedMotion: false, seed: 1 };

describe("stepSpellSim", () => {
  it("spawns troubles, casts at a tapped one, clears it, and reports mana and the clear", () => {
    const events: SpellEvent[] = [];
    const emit = (e: SpellEvent) => events.push(e);
    let sim = startSpellSim();
    let r = stepSpellSim(sim, { ...base, hero: layout.spawn, castRequest: null }, emit);
    sim = r.sim;
    expect(sim.troubles.length).toBeGreaterThan(0);
    const target = sim.troubles.find((t) => t.kind === "fog")!; // fog clears in one hit
    const hero = { x: target.position.x, z: target.position.z + 3 };
    r = stepSpellSim(sim, { ...base, hero, castRequest: { target: target.position } }, emit);
    sim = r.sim;
    expect(r.casting).toBe(true);
    expect(events.some((e) => e.kind === "castState" && e.casting)).toBe(true);
    for (let i = 0; i < 180 && !events.some((e) => e.kind === "cleared"); i++) {
      r = stepSpellSim(sim, { ...base, hero, castRequest: null }, emit);
      sim = r.sim;
    }
    expect(events.find((e) => e.kind === "cleared")).toMatchObject({ kind: "cleared", troubleKind: "fog", count: 1 });
    expect(sim.tally.session).toBe(1);
    expect(sim.clearedSites[target.siteId]).toBeGreaterThan(0);
    expect(sim.troubles.some((t) => t.id === target.id)).toBe(false);
    expect(events.some((e) => e.kind === "mana" && e.current <= 90)).toBe(true);
  });

  it("refuses a cast when mana is short and says the shortfall is the reason", () => {
    const events: SpellEvent[] = [];
    // One frame to populate the world, then stand beside a trouble so the ONLY thing
    // wrong with this cast is the empty mana strip.
    const seeded = stepSpellSim(startSpellSim(), { ...base, hero: layout.spawn, castRequest: null }, () => {}).sim;
    const beside = { x: seeded.troubles[0].position.x, z: seeded.troubles[0].position.z + 2 };
    const r = stepSpellSim({ ...seeded, mana: 0 }, { ...base, hero: beside, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events).toContainEqual({ kind: "refused", reason: "mana" });
  });

  it("refuses a NUMBER-KEY cast when nothing is in range, and spends no mana on the grass", () => {
    const events: SpellEvent[] = [];
    const seeded = stepSpellSim(startSpellSim(), { ...base, hero: layout.spawn, castRequest: null }, () => {}).sim;
    expect(seeded.troubles.length).toBeGreaterThan(0); // there ARE troubles; they are simply miles off
    const nowhere = { x: 1000, z: 1000 };
    const r = stepSpellSim(seeded, { ...base, hero: nowhere, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events).toContainEqual({ kind: "refused", reason: "range" });
    // The whole point: a cast into nothing is free. Mana only ever went up (regeneration).
    expect(r.sim.mana).toBeGreaterThanOrEqual(seeded.mana);
    expect(r.sim.effects).toHaveLength(0);
  });

  it("still casts a self spell with nothing in range, because a ward needs no trouble", () => {
    // The targeting rule keys on SHAPE. Shield (range 0) would otherwise refuse every cast
    // it ever made, and Aura (range 5) would refuse whenever the hero was not already stood
    // next to something — a reward that silently does nothing the day it unlocks.
    for (const formId of ["shield", "aura"] as const) {
      const ward = resolveSpell({ elementId: "ember", formId, modifierId: null })!;
      expect(ward.shape).toBe("self");
      const events: SpellEvent[] = [];
      const seeded = stepSpellSim(startSpellSim(), { ...base, hero: layout.spawn, castRequest: null }, () => {}).sim;
      const nowhere = { x: 1000, z: 1000 }; // miles from every trouble in the world
      const r = stepSpellSim(seeded, { ...base, selectedSpell: ward, hero: nowhere, castRequest: { nearest: true } }, (e) => events.push(e));
      expect(r.casting).toBe(true);
      expect(events.some((e) => e.kind === "refused")).toBe(false);
      expect(r.sim.caster.casting!.target).toMatchObject(nowhere); // it lands on the caster
    }
  });

  it("refuses a POINTER cast at open grass when nothing is in range", () => {
    const events: SpellEvent[] = [];
    const seeded = stepSpellSim(startSpellSim(), { ...base, hero: layout.spawn, castRequest: null }, () => {}).sim;
    const nowhere = { x: 1000, z: 1000 };
    const r = stepSpellSim(seeded, { ...base, hero: nowhere, castRequest: { target: { x: 1001, z: 1000 } } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events).toContainEqual({ kind: "refused", reason: "range" });
    expect(r.sim.mana).toBeGreaterThanOrEqual(seeded.mana);
  });

  it("sends a pointer cast at open grass to the nearest trouble in range instead of the grass", () => {
    const seeded = stepSpellSim(startSpellSim(), { ...base, hero: layout.spawn, castRequest: null }, () => {}).sim;
    const target = seeded.troubles[0];
    const hero = { x: target.position.x, z: target.position.z + 3 };
    // Two units to the side of the hero: open grass, nowhere near the trouble.
    const r = stepSpellSim(seeded, { ...base, hero, castRequest: { target: { x: hero.x + 2, z: hero.z } } }, () => {});
    expect(r.casting).toBe(true);
    // Troubles wander before the cast resolves, so compare against this frame's position.
    const moved = r.sim.troubles.find((t) => t.id === target.id)!;
    expect(r.sim.caster.casting!.target).toMatchObject({ x: moved.position.x, z: moved.position.z });
  });

  it("does nothing with a request when no page is selected", () => {
    const events: SpellEvent[] = [];
    const r = stepSpellSim(startSpellSim(), { ...base, selectedSpell: null, selectedSlot: null, hero: layout.spawn, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events.some((e) => e.kind === "refused" || e.kind === "castState")).toBe(false);
  });
});
