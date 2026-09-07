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

  it("refuses a cast when mana is short and reports it", () => {
    const events: SpellEvent[] = [];
    const sim = { ...startSpellSim(), mana: 0 };
    const r = stepSpellSim(sim, { ...base, hero: layout.spawn, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events.some((e) => e.kind === "refused")).toBe(true);
  });

  it("does nothing with a request when no page is selected", () => {
    const events: SpellEvent[] = [];
    const r = stepSpellSim(startSpellSim(), { ...base, selectedSpell: null, selectedSlot: null, hero: layout.spawn, castRequest: { nearest: true } }, (e) => events.push(e));
    expect(r.casting).toBe(false);
    expect(events.some((e) => e.kind === "refused" || e.kind === "castState")).toBe(false);
  });
});
