"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { QuestHelper } from "@/components/quest-helper";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { navItemsFor } from "@/components/nav-items";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

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
  icon: GameIconName;
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
          <GameIcon name={icon} className="size-5 text-[var(--gold-bright)]" />
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

  const navItems = navItemsFor(isChildView);

  return (
    <TooltipProvider>
      <nav className="game-navbar">
        <div className="game-navbar-inner">
          <div className="game-navbar-corner game-navbar-corner--tl" />
          <div className="game-navbar-corner game-navbar-corner--tr" />
          <div className="game-navbar-corner game-navbar-corner--bl" />
          <div className="game-navbar-corner game-navbar-corner--br" />

          <div className="game-navbar-main">
            {navItems.map((item, index) => {
              // In the parent view, mark where the hero-facing pages begin so it's
              // clear those tabs show what the kids see (not parent tools).
              const showHeroDivider =
                !isChildView &&
                item.heroView &&
                !navItems[index - 1]?.heroView;
              return (
                <Fragment key={item.href}>
                  {showHeroDivider && (
                    <span className="game-navbar-divider" aria-hidden="true">
                      <span className="game-navbar-divider-label">Hero&apos;s View</span>
                    </span>
                  )}
                  <NavMedallion
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    description={item.description}
                    active={isActive(pathname, item.href)}
                  />
                </Fragment>
              );
            })}
          </div>

          <div className="game-navbar-end">
            <QuestHelper isChildView={isChildView} />
            <UserMenu userName={userName} />
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}
