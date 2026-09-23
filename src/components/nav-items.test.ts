import { describe, it, expect } from "vitest";
import { MAIN_NAV, navItemsFor } from "@/components/nav-items";

describe("MAIN_NAV order", () => {
  it("matches the owner's requested parent bar order", () => {
    expect(MAIN_NAV.map((item) => item.label)).toEqual([
      "Tavern",
      "Quest Giver",
      "Quest Log",
      "Side Quests",
      "Spellbook",
      "Realm",
      "Loot",
      "Ranks",
      "Schedule",
    ]);
  });

  it("matches the owner's requested hero (child) bar order once Quest Giver drops out", () => {
    expect(navItemsFor(true).map((item) => item.label)).toEqual([
      "Tavern",
      "Quest Log",
      "Side Quests",
      "Spellbook",
      "Realm",
      "Loot",
      "Ranks",
      "Schedule",
    ]);
  });

  it("keeps the full order, including Quest Giver, for the parent view", () => {
    expect(navItemsFor(false).map((item) => item.label)).toEqual(
      MAIN_NAV.map((item) => item.label)
    );
    expect(navItemsFor().map((item) => item.label)).toEqual(MAIN_NAV.map((item) => item.label));
  });

  it("only Quest Giver is parent-only", () => {
    const parentOnly = MAIN_NAV.filter((item) => item.parentOnly).map((item) => item.label);
    expect(parentOnly).toEqual(["Quest Giver"]);
  });
});
