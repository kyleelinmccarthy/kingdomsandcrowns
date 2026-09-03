import { describe, it, expect } from "vitest";
import { getQuestUnlockableItems, getRewardItemLabel, getCategoryLabel } from "./avatar-catalog";
import { SPELL_ELEMENTS, SPELL_FORMS, SPELL_MODIFIERS } from "./spell-catalog";

describe("quest-unlockable items", () => {
  it("still lists avatar items", () => {
    expect(getQuestUnlockableItems().some((e) => e.category === "companion" && e.item.id === "pegasus")).toBe(true);
  });
  it("lists every quest-unlockable spell part under its spell category", () => {
    const entries = getQuestUnlockableItems();
    const spellEntries = entries.filter((e) => e.category.startsWith("spell")).map((e) => `${e.category}:${e.item.id}`).sort();
    expect(spellEntries).toEqual(["spellElement:bloom", "spellElement:storm", "spellForm:aura", "spellModifier:quicken"]);
  });
  it("marks spell parts as quest unlocks", () => {
    const storm = getQuestUnlockableItems().find((e) => e.item.id === "storm");
    expect(storm?.item.unlock).toEqual({ type: "quest" });
  });
  // Spell parts and avatar items are recorded in one child_avatar_unlock
  // table keyed only by item id — updateAvatarConfig reads that table
  // without a category filter. If a spell-part id ever collided with a
  // non-spell avatar item's id, awarding one could silently unlock the
  // other. Guard the id space stays disjoint.
  it("keeps spell-part ids disjoint from non-spell avatar item ids", () => {
    const spellIds = new Set([...SPELL_ELEMENTS, ...SPELL_FORMS, ...SPELL_MODIFIERS].map((p) => p.id));
    const avatarIds = getQuestUnlockableItems()
      .filter((e) => !e.category.startsWith("spell"))
      .map((e) => e.item.id);
    for (const id of avatarIds) {
      expect(spellIds.has(id)).toBe(false);
    }
  });
});

describe("reward labels", () => {
  it("labels spell parts by school", () => {
    expect(getRewardItemLabel(JSON.stringify({ category: "spellElement", itemId: "storm" }))).toBe("Spell Element: Storm");
    expect(getRewardItemLabel(JSON.stringify({ category: "spellModifier", itemId: "quicken" }))).toBe("Spell Modifier: Quicken");
    expect(getCategoryLabel("spellForm")).toBe("Spell Form");
  });
  it("still labels avatar items", () => {
    expect(getRewardItemLabel(JSON.stringify({ category: "accessory", itemId: "wings" }))).toMatch(/^Flair: /);
  });
});
