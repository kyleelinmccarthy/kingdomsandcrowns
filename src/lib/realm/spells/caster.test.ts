import { describe, it, expect } from "vitest";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { selectSlot, beginCast, stepCaster, castTargetFor, directionFrom, type CasterState } from "./caster";

const idle: CasterState = { selectedSlot: null, casting: null };
const bolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!; // 300 ms, 10 mana
const quickBolt = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "quicken" })!; // 150 ms, 15 mana
const burst = resolveSpell({ elementId: "ember", formId: "burst", modifierId: null })!; // area, range 4
const beam = resolveSpell({ elementId: "light", formId: "beam", modifierId: null })!; // range 14
const shield = resolveSpell({ elementId: "tide", formId: "shield", modifierId: null })!; // self
const hero = { x: 0, z: 0 };

describe("caster", () => {
  it("selects and deselects a slot", () => {
    expect(selectSlot(idle, 2).selectedSlot).toBe(2);
    expect(selectSlot(selectSlot(idle, 2), null).selectedSlot).toBeNull();
  });

  it("begins a cast, spends mana, and releases after castMs (halved by quicken)", () => {
    const begun = beginCast(idle, bolt, 3, hero, { x: 5, z: 0 }, 50, 1000);
    expect(begun.refused).toBeNull();
    expect(begun.mana).toBe(40);
    expect(begun.state.casting?.releaseAt).toBe(1300);
    expect(stepCaster(begun.state, 1299).released).toBeNull();
    const done = stepCaster(begun.state, 1300);
    expect(done.released).toMatchObject({ slot: 3, spell: bolt });
    expect(done.state.casting).toBeNull();
    expect(beginCast(idle, quickBolt, 0, hero, { x: 5, z: 0 }, 50, 0).state.casting?.releaseAt).toBe(150);
  });

  it("refuses when mana is short or a cast is in flight, without spending", () => {
    const short = beginCast(idle, bolt, 0, hero, { x: 5, z: 0 }, 9, 0);
    expect(short.refused).toBe("mana");
    expect(short.mana).toBe(9);
    const busy = beginCast(beginCast(idle, bolt, 0, hero, { x: 5, z: 0 }, 50, 0).state, bolt, 0, hero, { x: 5, z: 0 }, 40, 10);
    expect(busy.refused).toBe("busy");
    expect(busy.mana).toBe(40);
  });

  it("shapes the target: clamps areas to range, aims beams at range, puts self spells on the hero", () => {
    expect(castTargetFor(burst, hero, { x: 10, z: 0 })).toEqual({ x: 4, z: 0 });
    expect(castTargetFor(beam, hero, { x: 1, z: 0 })).toEqual({ x: 14, z: 0 });
    expect(castTargetFor(shield, hero, { x: 9, z: 9 })).toEqual(hero);
    expect(castTargetFor(bolt, hero, { x: 2, z: 2 })).toEqual({ x: 2, z: 2 });
    expect(directionFrom(hero, hero)).toEqual({ x: 0, z: -1 }); // a tap on the hero fires north
  });
});
