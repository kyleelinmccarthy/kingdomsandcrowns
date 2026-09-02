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
    description: "Your quests for today — complete them to earn XP and rewards.",
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: "trophy",
    description: "The Hall of Legends — see how heroes stack up on family and community leaderboards.",
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: "calendar",
    description: "The weekly schedule — classes for each day of the week and which days are school days.",
  },
];

export function navItemsFor(isChildView?: boolean): NavItem[] {
  return isChildView ? MAIN_NAV.filter((item) => !item.parentOnly) : MAIN_NAV;
}
