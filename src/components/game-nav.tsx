"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

const MAIN_NAV: {
  href: string;
  label: string;
  icon: string;
  description: string;
  parentOnly?: boolean;
}[] = [
  {
    href: "/tavern",
    label: "Tavern",
    icon: "🏘️",
    description: "Your home base — see your heroes, today's quests, and what's happening in your kingdom.",
  },
  {
    href: "/quests",
    label: "Quest Log",
    icon: "📜",
    description: "Your tasks and chores. Complete quests to earn XP and rewards.",
  },
  {
    href: "/scrolls",
    label: "Planner",
    icon: "📖",
    description: "Plan ahead — create quest templates and schedules for your heroes.",
    parentOnly: true,
  },
  {
    href: "/loot",
    label: "Loot",
    icon: "💎",
    description: "Your treasure chest — the rewards and achievements you've earned from quests.",
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: "🏆",
    description: "The Hall of Legends — see how heroes stack up on family and community leaderboards.",
  },
];


function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavMedallion({
  href,
  icon,
  label,
  description,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  description: string;
  active: boolean;
}) {
  return (
    <Tooltip content={description}>
      <Link
        href={href}
        aria-label={`${label} — ${description}`}
        className={cn(
          "medallion",
          active && "medallion--active",
        )}
      >
        <span className="medallion-icon" role="img" aria-hidden="true">
          {icon}
        </span>
        <span className="medallion-label">{label}</span>
      </Link>
    </Tooltip>
  );
}

export function GameBanner() {
  return (
    <div className="game-banner">
      <div className="game-banner-inner">
        <Link href="/tavern" className="game-banner-link">
          <img src="/crown.svg" alt="" className="game-banner-logo" aria-hidden="true" />
          <span className="game-banner-title">Kingdoms & Crowns</span>
          <span className="game-banner-subtitle">Be the Hero of Homeschool</span>
        </Link>
      </div>
    </div>
  );
}

export function GameNavBar({ userName, isChildView }: { userName: string; isChildView?: boolean }) {
  const pathname = usePathname();

  const navItems = isChildView
    ? MAIN_NAV.filter((item) => !item.parentOnly)
    : MAIN_NAV;

  return (
    <TooltipProvider>
      <nav className="game-navbar">
        <div className="game-navbar-inner">
          <div className="game-navbar-corner game-navbar-corner--tl" />
          <div className="game-navbar-corner game-navbar-corner--tr" />
          <div className="game-navbar-corner game-navbar-corner--bl" />
          <div className="game-navbar-corner game-navbar-corner--br" />

          <div className="game-navbar-main">
            {navItems.map((item) => (
              <NavMedallion
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                description={item.description}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>

          <div className="game-navbar-end">
            <UserMenu userName={userName} />
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}
