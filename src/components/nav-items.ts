import type { GameIconName } from "@/components/game-icon";

export type NavItem = {
  href: string;
  label: string;
  icon: GameIconName;
  description: string;
  parentOnly?: boolean;
};

// Tavern always leads (it's the main dashboard); everything after it stays
// in alphabetical order by label. Both the parent and hero nav bars render
// this same order (heroes just get the parentOnly items filtered out).
export const MAIN_NAV: NavItem[] = [
  {
    href: "/tavern",
    label: "Tavern",
    icon: "tavern",
    description: "Your home base — see your heroes, today's quests, and what's happening in your kingdom.",
  },
  {
    href: "/deeds",
    label: "Deeds",
    icon: "map",
    description: "Help the folk of your kingdom — each deed raises a building and strengthens your magic.",
  },
  {
    href: "/loot",
    label: "Loot",
    icon: "gem",
    description: "Your treasure chest — the rewards and achievements you've earned from quests.",
  },
  {
    href: "/scrolls",
    label: "Quest Giver",
    icon: "mage",
    description: "Create and manage quests, loot, and rewards for your heroes.",
    parentOnly: true,
  },
  {
    href: "/quests",
    label: "Quest Log",
    icon: "scroll",
    description: "Your tasks and chores. Complete quests to earn XP and rewards.",
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: "trophy",
    description: "The Hall of Legends — see how heroes stack up on family and community leaderboards.",
  },
  {
    href: "/realm",
    label: "Realm",
    icon: "castle",
    description: "Walk your kingdom — the castle, the buildings your deeds raised, and your companion at your side.",
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: "calendar",
    description: "The weekly schedule — classes for each day of the week and which days are school days.",
  },
  {
    href: "/spellbook",
    label: "Spellbook",
    icon: "crystalBall",
    description: "Your book of spells — assemble what you've unlocked and name your magic.",
  },
];

export function navItemsFor(isChildView?: boolean): NavItem[] {
  return isChildView ? MAIN_NAV.filter((item) => !item.parentOnly) : MAIN_NAV;
}
