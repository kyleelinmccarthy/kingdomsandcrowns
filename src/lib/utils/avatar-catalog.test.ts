import { describe, it, expect } from "vitest";
import {
  getQuestUnlockableItems,
  getRewardItemLabel,
  getCategoryLabel,
  MOUNTS,
  COMPANIONS,
  findMount,
  normalizeAvatarConfig,
  isValidAvatarConfig,
  DEFAULT_AVATAR,
} from "./avatar-catalog";
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

describe("mounts", () => {
  it("has eight mounts with unique ids that never collide with companion ids", () => {
    expect(MOUNTS.length).toBe(8);
    const ids = MOUNTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(8);
    const companionIds = new Set(COMPANIONS.map((c) => c.id));
    for (const id of ids) expect(companionIds.has(id)).toBe(false);
    expect(findMount("pony")).toMatchObject({ label: "Pony", speed: 4.5, unlock: { type: "free" } });
    expect(findMount("nope")).toBeNull();
    for (const m of MOUNTS) expect(m.speed).toBeGreaterThan(3.5);
  });
  it("lists the quest mounts under the mount category and labels them", () => {
    const entries = getQuestUnlockableItems().filter((e) => e.category === "mount").map((e) => e.item.id).sort();
    expect(entries).toEqual(["gryphon", "wyrm"]);
    expect(getRewardItemLabel(JSON.stringify({ category: "mount", itemId: "pony" }))).toBe("Mount: Pony");
    expect(getCategoryLabel("mount")).toBe("Mount");
  });
  it("normalises and validates the mount fields", () => {
    const bare = normalizeAvatarConfig({});
    expect(bare.mount).toBeNull();
    expect(bare.mountColor).toBe("#8b5e3c");
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, mount: "pony", mountColor: "#123456" })).toBe(true);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, mount: "nope" })).toBe(false);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, mount: null })).toBe(true);
  });
});

describe("worn crown", () => {
  it("normalises and validates the crown field", () => {
    expect(normalizeAvatarConfig({}).crown).toBeNull();
    expect(DEFAULT_AVATAR.crown).toBeNull();
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, crown: "crown-copper" })).toBe(true);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, crown: "crown-of-lies" })).toBe(false);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, crown: null })).toBe(true);
  });
});
