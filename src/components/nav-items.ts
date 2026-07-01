import type { GameIconName } from "@/components/game-icon";

export type NavItem = {
  href: string;
  label: string;
  icon: GameIconName;
  description: string;
  parentOnly?: boolean;
  heroView?: boolean;
};

export const MAIN_NAV: NavItem[] = [
  {
    href: "/scrolls",
    label: "Quest Giver",
    icon: "mage",
    description: "Create and manage quests, loot, and rewards for your heroes.",
    parentOnly: true,
  },
  {
    href: "/tavern",
    label: "Tavern",
    icon: "tavern",
    description: "Your home base — see your heroes, today's quests, and what's happening in your kingdom.",
    heroView: true,
  },
  {
    href: "/quests",
    label: "Quest Log",
    icon: "scroll",
    description: "Your tasks and chores. Complete quests to earn XP and rewards.",
    heroView: true,
  },
  {
    href: "/loot",
    label: "Loot",
    icon: "gem",
    description: "Your treasure chest — the rewards and achievements you've earned from quests.",
    heroView: true,
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: "trophy",
    description: "The Hall of Legends — see how heroes stack up on family and community leaderboards.",
    heroView: true,
  },
];

export function navItemsFor(isChildView?: boolean): NavItem[] {
  return isChildView ? MAIN_NAV.filter((item) => !item.parentOnly) : MAIN_NAV;
}
