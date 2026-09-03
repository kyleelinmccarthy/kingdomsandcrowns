import { describe, it, expect } from "vitest";
import { spellNameOptions, defaultSpellName, isValidSpellName, displaySpellName } from "./spell-names";

const plain = { elementId: "ember", formId: "bolt", modifierId: null };
const modified = { elementId: "tide", formId: "wall", modifierId: "slow" };

describe("spellNameOptions", () => {
  it("offers the element's adjectives and the form's nouns", () => {
    expect(spellNameOptions(plain)).toEqual({ adjectives: ["Ember", "Cinder", "Blaze"], nouns: ["Bolt", "Dart", "Lance"], suffix: null });
  });
  it("carries the modifier's suffix", () => {
    expect(spellNameOptions(modified)?.suffix).toBe("of Slowing");
  });
  it("is null for unknown parts", () => {
    expect(spellNameOptions({ ...plain, elementId: "lava" })).toBeNull();
  });
});

describe("defaultSpellName", () => {
  it("is the first adjective and first noun", () => {
    expect(defaultSpellName(plain)).toEqual({ adjective: "Ember", noun: "Bolt" });
  });
});

describe("isValidSpellName", () => {
  it("accepts a pick from the bank and rejects a foreign word", () => {
    expect(isValidSpellName(plain, "Cinder", "Lance")).toBe(true);
    expect(isValidSpellName(plain, "Frost", "Bolt")).toBe(false);
    expect(isValidSpellName(plain, "Ember", "Orb")).toBe(false);
  });
});

describe("displaySpellName", () => {
  it("joins adjective, noun, and suffix", () => {
    expect(displaySpellName(plain, "Ember", "Bolt")).toBe("Ember Bolt");
    expect(displaySpellName(modified, "Wave", "Rampart")).toBe("Wave Rampart of Slowing");
  });
});
