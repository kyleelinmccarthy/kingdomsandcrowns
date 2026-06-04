"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const parentLinks = [
  { href: "/tavern", label: "Tavern", icon: "🏘️" },
  { href: "/scrolls", label: "Quest Giver", icon: "🧙" },
  { href: "/quests", label: "Quest Log", icon: "📜" },
  { href: "/loot", label: "Treasure Chest", icon: "💎" },
  { href: "/castle", label: "Castle", icon: "🏰" },
];

const childLinks = [
  { href: "/tavern", label: "My Tavern", icon: "🏘️" },
  { href: "/quests", label: "My Quests", icon: "⚔️" },
  { href: "/loot", label: "My Trophies", icon: "🏆" },
  { href: "/castle", label: "My Castle", icon: "🏰" },
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
            <span className="text-base" role="img" aria-hidden="true">{link.icon}</span>
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
