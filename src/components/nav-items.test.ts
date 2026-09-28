import { describe, it, expect } from "vitest";
import {
  MAIN_NAV,
  navItemsFor,
  visibleNav,
  navLinks,
  isNavActive,
  isNavGroup,
  type NavEntry,
  type NavLink,
} from "@/components/nav-items";

/** A bar as the words on it: a link by its label, a group as "Label ▾ first · second". */
function words(entries: NavEntry[]): string[] {
  return entries.map((entry) =>
    "items" in entry ? `${entry.label} ▾ ${entry.items.map((item) => item.label).join(" · ")}` : entry.label,
  );
}

const link = (label: string, parentOnly?: boolean): NavLink => ({
  href: `/${label.toLowerCase()}`,
  label,
  icon: "scroll",
  description: `${label} page.`,
  parentOnly,
});

describe("the bar's destinations", () => {
  it("gives a hero Tavern · Quests ▾ · Spellbook · Realm · Rewards ▾ · Schedule", () => {
    expect(words(navItemsFor(true))).toEqual([
      "Tavern",
      "Quests ▾ Quest Log · Side Quests",
      "Spellbook",
      "Realm",
      "Rewards ▾ Loot · Ranks",
      "Schedule",
    ]);
  });

  it("gives a grown-up the same bar, with Quest Giver first inside Quests", () => {
    const parentBar = [
      "Tavern",
      "Quests ▾ Quest Giver · Quest Log · Side Quests",
      "Spellbook",
      "Realm",
      "Rewards ▾ Loot · Ranks",
      "Schedule",
    ];
    expect(words(navItemsFor(false))).toEqual(parentBar);
    expect(words(navItemsFor())).toEqual(parentBar);
  });

  it("keeps every destination's address, in the owner's order", () => {
    expect(navLinks(MAIN_NAV).map((item) => item.href)).toEqual([
      "/tavern",
      "/scrolls",
      "/quests",
      "/side-quests",
      "/spellbook",
      "/realm",
      "/loot",
      "/leaderboard",
      "/schedule",
    ]);
  });

  it("keeps only Quest Giver for grown-ups", () => {
    expect(navLinks(MAIN_NAV).filter((item) => item.parentOnly).map((item) => item.label)).toEqual(["Quest Giver"]);
  });
});

describe("visibleNav — what one viewer's bar shows", () => {
  const grownUp = link("Ledger", true);
  const shared = link("Map");

  it("drops a grown-ups-only link from a hero's bar and keeps it on a grown-up's", () => {
    expect(words(visibleNav([grownUp, shared], true))).toEqual(["Map"]);
    expect(words(visibleNav([grownUp, shared], false))).toEqual(["Ledger", "Map"]);
  });

  it("shows a group left with one destination as that destination, a plain link", () => {
    const group: NavEntry = { label: "Books", icon: "book", items: [grownUp, shared] };
    expect(visibleNav([group], true)).toEqual([shared]);
    expect(words(visibleNav([group], false))).toEqual(["Books ▾ Ledger · Map"]);
  });

  it("leaves a group off the bar when nothing in it is for this viewer", () => {
    const group: NavEntry = { label: "Grown-ups", icon: "key", items: [grownUp, link("Keys", true)] };
    expect(visibleNav([group, shared], true)).toEqual([shared]);
  });
});

describe("isNavActive — the medallion that lights up", () => {
  const quests = () => MAIN_NAV.find((entry) => entry.label === "Quests")!;

  it("lights a link on its own page and the pages under it, and nowhere else", () => {
    const questLog = link("Quests");
    expect(isNavActive("/quests", questLog)).toBe(true);
    expect(isNavActive("/quests/abc", questLog)).toBe(true);
    expect(isNavActive("/quests-old", questLog)).toBe(false);
    expect(isNavActive("/tavern", questLog)).toBe(false);
  });

  it("lights a group when any of its destinations is open", () => {
    expect(isNavActive("/side-quests", quests())).toBe(true);
    expect(isNavActive("/scrolls/q-1", quests())).toBe(true);
    expect(isNavActive("/quests", quests())).toBe(true);
    expect(isNavActive("/spellbook", quests())).toBe(false);
  });

  it("lights a group for a page under one of its destinations, and not for a lookalike path", () => {
    const quests = MAIN_NAV.find((e) => isNavGroup(e) && e.label === "Quests")!;
    expect(isNavActive("/quests/abc", quests)).toBe(true);
    expect(isNavActive("/side-quests", quests)).toBe(true);
    expect(isNavActive("/questsmith", quests)).toBe(false);
  });
});
