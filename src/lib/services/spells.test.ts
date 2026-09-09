import { describe, it, expect } from "vitest";
import { starterSpellDecision, STARTER_SPELL } from "./spells";

describe("starterSpellDecision", () => {
  it("seeds a hero who has never had a spell, marks one who built their own, and leaves a marked hero alone", () => {
    expect(starterSpellDecision(false, null)).toBe("seed");
    expect(starterSpellDecision(true, null)).toBe("mark");
    expect(starterSpellDecision(false, new Date("2026-09-01"))).toBe("none");
    expect(starterSpellDecision(true, new Date("2026-09-01"))).toBe("none");
  });
  it("is Ember Bolt on page one", () => {
    expect(STARTER_SPELL).toEqual({ slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" });
  });
});
