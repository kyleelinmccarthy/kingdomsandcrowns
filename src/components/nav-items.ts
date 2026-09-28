import { SPELLBOOK_ICON, type GameIconName } from "@/components/game-icon";
import { SIDE_QUESTS } from "@/lib/utils/side-quest-copy";

export type NavItem = {
  href: string;
  label: string;
  icon: GameIconName;
  description: string;
  parentOnly?: boolean;
};

// Tavern always leads (it's the main dashboard). After that the order is the
// owner's explicit call: Tavern > Quest Giver > Quest Log > Side Quests >
// Spellbook > Realm > Loot > Ranks > Schedule. Both the parent and hero nav
// bars render this same order (heroes just get the parentOnly items filtered
// out, which is why Quest Giver sits second — it disappears for heroes and
// the rest of the order holds).
export const MAIN_NAV: NavItem[] = [
  {
    href: "/tavern",
    label: "Tavern",
    icon: "tavern",
    description: "Your home base — see your heroes, today's quests, and what's happening in your kingdom.",
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
    href: "/side-quests",
    label: SIDE_QUESTS,
    icon: "map",
    description: "Help the folk of your kingdom. Each side quest helps build the village and strengthens your magic.",
  },
  {
    href: "/spellbook",
    label: "Spellbook",
    icon: SPELLBOOK_ICON,
    description: "Your book of spells — assemble what you've unlocked and name your magic.",
  },
  {
    href: "/realm",
    label: "Realm",
    icon: "castle",
    description: "Walk your kingdom — the castle, the buildings your side quests built, and your companion at your side.",
  },
  {
    href: "/loot",
    label: "Loot",
    icon: "gem",
    description: "Your treasure chest — the rewards and achievements you've earned from quests.",
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
