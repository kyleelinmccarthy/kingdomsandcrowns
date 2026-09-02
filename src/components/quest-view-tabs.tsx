"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { GameIcon } from "@/components/game-icon";

const SCHOOL_TABS = [
  { value: "today", label: "Today", icon: "swords" },
  { value: "adventure", label: "Complete Adventure", icon: "campfire" },
] as const;

const UPKEEP_TAB = { value: "upkeep", label: "Upkeep", icon: "tavern" } as const;

export type QuestView = "today" | "adventure" | "upkeep";

export function QuestViewTabs({
  active,
  showUpkeep = false,
}: {
  active: QuestView;
  /** Upkeep is an optional module — the tab does not exist until it is on. */
  showUpkeep?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "today") {
      params.delete("view");
    } else {
      params.set("view", tab);
    }
    const qs = params.toString();
    router.push(`/quests${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
      {[...SCHOOL_TABS, ...(showUpkeep ? [UPKEEP_TAB] : [])].map((tab) => (
        <button
          key={tab.value}
          onClick={() => switchTab(tab.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active === tab.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <GameIcon name={tab.icon} className="size-4 text-[var(--gold-bright)]" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
