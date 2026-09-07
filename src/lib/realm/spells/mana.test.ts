import { describe, it, expect } from "vitest";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { MANA_MAX, MANA_REGEN_PER_S, startMana, stepMana, canCast, spend, refund } from "./mana";

const orb = resolveSpell({ elementId: "tide", formId: "orb", modifierId: null })!; // 15 mana

describe("mana", () => {
  it("starts full, regenerates five per second, and never exceeds the max", () => {
    expect(startMana()).toBe(MANA_MAX);
    expect(stepMana(40, 2)).toBe(40 + 2 * MANA_REGEN_PER_S);
    expect(stepMana(MANA_MAX - 1, 10)).toBe(MANA_MAX);
  });
  it("spends and refunds a spell's cost, clamped", () => {
    expect(canCast(15, orb)).toBe(true);
    expect(canCast(14, orb)).toBe(false);
    expect(spend(15, orb)).toBe(0);
    expect(refund(MANA_MAX - 5, orb)).toBe(MANA_MAX);
  });
});
