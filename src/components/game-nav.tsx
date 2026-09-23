"use client";

import { useEffect, useRef } from "react";
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
  const navRef = useRef<HTMLElement | null>(null);

  const navItems = navItemsFor(isChildView);

  // Publish the bar's real height as --game-navbar-height so floating controls
  // (the hero hand-off button, the demo switcher) can dock above it instead of
  // landing on top of the Help/account medallions. The height changes with the
  // breakpoint and with font loading, so measure rather than hard-code it.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--game-navbar-height",
        `${el.getBoundingClientRect().height}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    // Deliberately leaves the last measured value in place: during a route
    // transition the outgoing bar can unmount after the incoming one mounts,
    // and clearing here would drop the fresh value back to the CSS fallback.
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider>
      <nav className="game-navbar" ref={navRef}>
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
            <QuestHelper isChildView={isChildView} />
            {/* Alerts live inside the account menu now — its badge carries the
                unread count so a skipped or stuck quest still can't go unseen
                without a standing medallion of its own. */}
            <UserMenu userName={userName} isChildView={isChildView} />
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}
