"use client";

import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { GameIcon } from "@/components/game-icon";
import { isNavActive, type NavGroup } from "@/components/nav-items";

/**
 * A bar medallion that opens a menu of destinations — Quests, Rewards. It opens on a click or a
 * tap, never on hover (a touch screen cannot hover), and upward, because the bar sits at the
 * bottom of the screen. The keyboard comes with the menu: Enter, Space or an arrow opens it, the
 * arrows walk it, and Escape closes it back onto the medallion. It lights up like any medallion
 * when the page open is one of its own.
 */
export function NavGroupMenu({ group, pathname }: { group: NavGroup; pathname: string }) {
  const names = group.items.map((item) => item.label).join(", ");
  return (
    <DropdownMenu>
      <Tooltip content={names}>
        <DropdownMenuTrigger
          className={cn("medallion", isNavActive(pathname, group) && "medallion--active")}
          aria-label={`${group.label} — ${names}`}
        >
          <span className="medallion-icon" aria-hidden="true">
            <GameIcon name={group.icon} className="size-5 text-[var(--gold-bright)]" />
          </span>
          <span className="medallion-label">
            {group.label}
            <ChevronUp className="medallion-chevron" aria-hidden="true" />
          </span>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="top" align="center" sideOffset={10} className="nav-menu">
        {group.items.map((item) => (
          <DropdownMenuItem
            key={item.href}
            render={<Link href={item.href} />}
            aria-current={isNavActive(pathname, item) ? "page" : undefined}
            className="nav-menu-item cursor-pointer"
          >
            <span className="nav-menu-icon" aria-hidden="true">
              <GameIcon name={item.icon} className="size-4 text-[var(--gold-bright)]" />
            </span>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
