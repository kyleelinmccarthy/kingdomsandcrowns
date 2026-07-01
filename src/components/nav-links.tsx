"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GameIcon, type GameIconName } from "@/components/game-icon";

const parentLinks: { href: string; label: string; icon: GameIconName }[] = [
  { href: "/tavern", label: "Tavern", icon: "tavern" },
  { href: "/scrolls", label: "Quest Giver", icon: "mage" },
  { href: "/quests", label: "Quest Log", icon: "scroll" },
  { href: "/loot", label: "Treasure Chest", icon: "gem" },
  { href: "/castle", label: "Castle", icon: "castle" },
];

const childLinks: { href: string; label: string; icon: GameIconName }[] = [
  { href: "/tavern", label: "My Tavern", icon: "tavern" },
  { href: "/quests", label: "My Quests", icon: "swords" },
  { href: "/loot", label: "My Trophies", icon: "trophy" },
  { href: "/castle", label: "My Castle", icon: "castle" },
];

export function NavLinks({ isChild }: { isChild?: boolean } = {}) {
  const pathname = usePathname();
  const links = isChild ? childLinks : parentLinks;

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive ? "nav-link--active" : "nav-link--inactive"}`}
          >
            <GameIcon name={link.icon} className="size-4 text-[var(--gold-bright)]" />
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
