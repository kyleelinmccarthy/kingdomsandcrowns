import { describe, it, expect } from "vitest";
import {
  SPELL_ELEMENTS,
  SPELL_FORMS,
  SPELL_MODIFIERS,
  SPELL_PART_COUNT,
  isSpellPartUnlocked,
  unlockedPartIds,
  spellUnlockHint,
  resolveSpell,
  describeSpell,
  type SpellUnlockContext,
} from "./spell-catalog";

const fresh: SpellUnlockContext = {
  level: 1,
  earnedBadgeIds: [],
  questUnlockedIds: new Set(),
  schoolCounts: { element: 0, form: 0, modifier: 0 },
};
const subjects = { element: ["Reading", "History"], form: ["Math"], modifier: [] as string[] };

describe("catalog shape", () => {
  it("has unique ids across all parts and the documented count", () => {
    const ids = [...SPELL_ELEMENTS, ...SPELL_FORMS, ...SPELL_MODIFIERS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(SPELL_PART_COUNT);
    expect(SPELL_PART_COUNT).toBe(24);
  });
  it("only references seeded badge ids", () => {
    const seeded = ["badge-streak-7", "badge-volume-25", "badge-streak-30"];
    for (const p of [...SPELL_ELEMENTS, ...SPELL_FORMS, ...SPELL_MODIFIERS]) {
      if (p.unlock.type === "badge") expect(seeded).toContain(p.unlock.badgeId);
    }
  });
});

describe("isSpellPartUnlocked", () => {
  it("free is always open", () => {
    expect(isSpellPartUnlocked({ type: "free" }, fresh)).toBe(true);
  });
  it("level compares against the hero's level", () => {
    expect(isSpellPartUnlocked({ type: "level", level: 10 }, fresh)).toBe(false);
    expect(isSpellPartUnlocked({ type: "level", level: 10 }, { ...fresh, level: 10 })).toBe(true);
  });
  it("badge needs the badge", () => {
    const u = { type: "badge" as const, badgeId: "badge-streak-7", badgeName: "Week Warrior" };
    expect(isSpellPartUnlocked(u, fresh)).toBe(false);
    expect(isSpellPartUnlocked(u, { ...fresh, earnedBadgeIds: ["badge-streak-7"] })).toBe(true);
  });
  it("quest needs the id in the quest unlocks, checked by the caller per part", () => {
    expect(isSpellPartUnlocked({ type: "quest" }, fresh, "storm")).toBe(false);
    expect(isSpellPartUnlocked({ type: "quest" }, { ...fresh, questUnlockedIds: new Set(["storm"]) }, "storm")).toBe(true);
  });
  it("school compares the school's count", () => {
    const u = { type: "school" as const, school: "form" as const, count: 15 };
    expect(isSpellPartUnlocked(u, { ...fresh, schoolCounts: { element: 99, form: 14, modifier: 0 } })).toBe(false);
    expect(isSpellPartUnlocked(u, { ...fresh, schoolCounts: { element: 0, form: 15, modifier: 0 } })).toBe(true);
  });
});

describe("unlockedPartIds", () => {
  it("gives a fresh hero exactly the free parts", () => {
    expect([...unlockedPartIds(fresh)].sort()).toEqual(["bolt", "ember", "orb", "slow", "tide"]);
  });
  it("adds quest-rewarded parts by id", () => {
    expect(unlockedPartIds({ ...fresh, questUnlockedIds: new Set(["bloom", "quicken"]) })).toContain("bloom");
    expect(unlockedPartIds({ ...fresh, questUnlockedIds: new Set(["bloom"]) })).not.toContain("quicken");
  });
});

describe("spellUnlockHint", () => {
  it("is null when unlocked", () => {
    expect(spellUnlockHint({ type: "free" }, fresh, subjects)).toBeNull();
  });
  it("names the level, badge, and quest routes", () => {
    expect(spellUnlockHint({ type: "level", level: 10 }, fresh, subjects)).toBe("Reach level 10.");
    expect(spellUnlockHint({ type: "badge", badgeId: "x", badgeName: "Week Warrior" }, fresh, subjects)).toBe("Earn the Week Warrior badge.");
    expect(spellUnlockHint({ type: "quest" }, fresh, subjects)).toBe("A grown-up can award this as a quest reward.");
  });
  it("counts remaining quests in the hero's own disciplines", () => {
    const ctx = { ...fresh, schoolCounts: { element: 3, form: 0, modifier: 0 } };
    expect(spellUnlockHint({ type: "school", school: "element", count: 15 }, ctx, subjects)).toBe("Log 12 more Reading or History quests.");
    expect(spellUnlockHint({ type: "school", school: "form", count: 5 }, ctx, subjects)).toBe("Log 5 more Math quests.");
  });
  it("asks for a discipline when none feeds the school", () => {
    expect(spellUnlockHint({ type: "school", school: "modifier", count: 5 }, fresh, subjects)).toBe(
      "Ask a grown-up to point a discipline at the School of Modifiers."
    );
  });
});

describe("resolveSpell", () => {
  it("merges the parts into one definition", () => {
    const def = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "slow" });
    expect(def).toEqual({
      parts: { elementId: "ember", formId: "bolt", modifierId: "slow" },
      color: "#f97316",
      particle: "sparks",
      shape: "projectile",
      manaCost: 15,
      castMs: 300,
      range: 12,
      speed: 14,
      statuses: [{ kind: "slowed", durationMs: 2000 }],
    });
  });
  it("works without a modifier", () => {
    const def = resolveSpell({ elementId: "tide", formId: "orb", modifierId: null });
    expect(def?.manaCost).toBe(15);
    expect(def?.statuses).toEqual([]);
  });
  it("halves cast time for quicken and puts the element's chill first", () => {
    const def = resolveSpell({ elementId: "frost", formId: "beam", modifierId: "quicken" });
    expect(def?.castMs).toBe(200);
    expect(def?.manaCost).toBe(25);
    expect(def?.statuses).toEqual([
      { kind: "chilled", durationMs: 800 },
      { kind: "quickened", durationMs: 0 },
    ]);
  });
  it("returns null for any unknown id", () => {
    expect(resolveSpell({ elementId: "lava", formId: "bolt", modifierId: null })).toBeNull();
    expect(resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "nope" })).toBeNull();
  });
});

describe("describeSpell", () => {
  it("reads as a sentence", () => {
    expect(describeSpell({ elementId: "ember", formId: "bolt", modifierId: null })).toBe("A bolt of ember.");
    expect(describeSpell({ elementId: "ember", formId: "bolt", modifierId: "slow" })).toBe("A bolt of ember that slows what it touches.");
    expect(describeSpell({ elementId: "frost", formId: "wall", modifierId: "bind" })).toBe("A wall of frost that holds its target still. It chills.");
  });
  it("is empty for unknown ids", () => {
    expect(describeSpell({ elementId: "lava", formId: "bolt", modifierId: null })).toBe("");
  });
});
