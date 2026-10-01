import { SPELLBOOK_ICON, type GameIconName } from "@/components/game-icon";
import { SIDE_QUESTS } from "@/lib/utils/side-quest-copy";

/** One destination: a medallion on the bar, or an item in one of its menus. */
export type NavLink = {
  href: string;
  label: string;
  icon: GameIconName;
  description: string;
  parentOnly?: boolean;
};

/** A medallion that opens a menu of destinations instead of going anywhere itself. */
export type NavGroup = {
  label: string;
  icon: GameIconName;
  items: NavLink[];
};

export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Tavern always leads (it's the main dashboard). After that the order is the
// owner's explicit call: Tavern > Quest Giver > Quest Log > Side Quests >
// Spellbook > Realm > Loot > Ranks > Schedule. Too many medallions for one bar,
// so the quest pages share a Quests menu and the reward pages a Rewards menu;
// the order inside and around them holds. Both bars render this same list —
// heroes just lose the parentOnly items (see visibleNav).
export const MAIN_NAV: NavEntry[] = [
  {
    href: "/tavern",
    label: "Tavern",
    icon: "tavern",
    description: "Your home base — see your heroes, today's quests, and what's happening in your kingdom.",
  },
  {
    label: "Quests",
    icon: "swords",
    items: [
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
        href: "/side-quests",
        label: SIDE_QUESTS,
        icon: "map",
        description: "Help the folk of your kingdom. Each side quest helps build the village and strengthens your magic.",
      },
    ],
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
    label: "Rewards",
    icon: "medal",
    items: [
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
    ],
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: "calendar",
    description: "The weekly schedule — classes for each day of the week and which days are school days.",
  },
];

/**
 * What one viewer's bar shows. A hero loses the grown-ups-only destinations; a group left with a
 * single destination is shown as that destination (a menu of one is just a slower link), and a
 * group left with none is not shown at all.
 */
export function visibleNav(entries: NavEntry[], isChildView?: boolean): NavEntry[] {
  const forViewer = (item: NavLink) => !(isChildView && item.parentOnly);
  return entries.flatMap((entry): NavEntry[] => {
    if (!isNavGroup(entry)) return forViewer(entry) ? [entry] : [];
    const items = entry.items.filter(forViewer);
    return items.length > 1 ? [{ ...entry, items }] : items;
  });
}

export function navItemsFor(isChildView?: boolean): NavEntry[] {
  return visibleNav(MAIN_NAV, isChildView);
}

/** Every destination in bar order, with each group's opened out in place. */
export function navLinks(entries: NavEntry[]): NavLink[] {
  return entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
}

/** Whether the viewer is at this entry: a link on its page or one under it, a group at any of its links. */
export function isNavActive(pathname: string, entry: NavEntry): boolean {
  return navLinks([entry]).some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
