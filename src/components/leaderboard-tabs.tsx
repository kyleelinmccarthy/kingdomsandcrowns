"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { LeaderboardTable, CombinedLeaderboardTable } from "@/components/leaderboard-table";
import { getCommunityLeaderboard, getCommunityLeaderboardAll, toggleLeaderboardVisibility } from "@/lib/actions/leaderboard";
import type { CommunityLeaderboardEntry, CommunityLeaderboardAllEntry, LeaderboardCategory } from "@/lib/actions/leaderboard";
import { GameIcon } from "@/components/game-icon";

type FamilyEntry = {
  id: string;
  displayName: string;
  avatarConfig: string | null;
  currentXp: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
};

type LeaderboardTabsProps = {
  familyData: FamilyEntry[];
  communityData: CommunityLeaderboardEntry[];
  initialAllData: CommunityLeaderboardAllEntry[];
  isChildView: boolean;
  currentChildId?: string;
  showOnLeaderboard?: boolean;
};

const CATEGORY_LABELS: Record<LeaderboardCategory, { label: string; valueLabel: string }> = {
  xp: { label: "Glory Points (XP)", valueLabel: "XP" },
  streak: { label: "Active Quest Streak", valueLabel: "Days" },
  longestStreak: { label: "Legendary Endurance", valueLabel: "Days" },
  badges: { label: "Trophies Collected", valueLabel: "Trophies" },
};

type CategoryView = "all" | LeaderboardCategory;

export function LeaderboardTabs({
  familyData,
  communityData: initialCommunityData,
  initialAllData,
  isChildView,
  currentChildId,
  showOnLeaderboard,
}: LeaderboardTabsProps) {
  const [tab, setTab] = useState<"family" | "community">("family");
  const [categoryView, setCategoryView] = useState<CategoryView>("all");
  const [communityData, setCommunityData] = useState(initialCommunityData);
  const [allData, setAllData] = useState(initialAllData);
  const [isPending, startTransition] = useTransition();
  const [toggling, setToggling] = useState(false);
  const [visible, setVisible] = useState(showOnLeaderboard ?? false);
  const router = useRouter();

  function handleCategoryChange(newView: CategoryView) {
    startTransition(async () => {
      if (newView === "all") {
        const data = await getCommunityLeaderboardAll();
        setAllData(data);
      } else {
        const data = await getCommunityLeaderboard(newView);
        setCommunityData(data);
      }
      setCategoryView(newView);
    });
  }

  async function handleToggleVisibility() {
    if (!currentChildId) return;
    setToggling(true);
    try {
      await toggleLeaderboardVisibility(currentChildId, !visible);
      setVisible(!visible);
      router.refresh();
    } finally {
      setToggling(false);
    }
  }

  // Map family data to the format expected by the value label for the selected category
  const familyEntries = familyData.map((child) => ({
    id: child.id,
    displayName: child.displayName,
    avatarConfig: child.avatarConfig,
    value: child.currentXp,
  }));

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("family")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "family"
              ? "border border-[var(--gold-border)] bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Guild Ranks
        </button>
        <button
          onClick={() => setTab("community")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "community"
              ? "border border-[var(--gold-border)] bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Community Hall
        </button>
      </div>

      {/* Family tab */}
      {tab === "family" && (
        <LeaderboardTable
          title="Guild Ranks"
          icon={<GameIcon name="swords" className="size-4 text-[var(--gold-bright)]" />}
          entries={familyEntries}
          valueLabel="XP"
          highlightId={currentChildId}
          emptyMessage="No heroes have joined your guild yet. Recruit champions from the Guild Hall!"
        />
      )}

      {/* Community tab */}
      {tab === "community" && (
        <div className="space-y-4">
          {/* Opt-in/out toggle for child view */}
          {isChildView && currentChildId && (
            <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-secondary/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Your Visibility</p>
                <p className="text-xs text-muted-foreground">
                  {visible
                    ? "Your hero appears in the Community Hall."
                    : "Your hero is hidden from the Community Hall."}
                </p>
              </div>
              <Button
                size="sm"
                variant={visible ? "outline" : "default"}
                className={visible ? "!border-[var(--gold-border)]" : undefined}
                onClick={handleToggleVisibility}
                disabled={toggling}
              >
                {toggling
                  ? "Enchanting..."
                  : visible
                    ? "Leave the Hall"
                    : "Enter the Hall"}
              </Button>
            </div>
          )}

          {/* Category selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground">Rank by:</label>
            <Select
              value={categoryView}
              onChange={(e) => handleCategoryChange(e.target.value as CategoryView)}
              className="w-56"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className={isPending ? "opacity-60 transition-opacity" : ""}>
            {categoryView === "all" ? (
              <CombinedLeaderboardTable
                entries={allData}
                emptyMessage="No champions have entered the Hall of Legends yet. Opt in from Settings to appear here!"
              />
            ) : (
              <LeaderboardTable
                title="Community Hall"
                icon={<GameIcon name="temple" className="size-4 text-[var(--gold-bright)]" />}
                entries={communityData}
                valueLabel={CATEGORY_LABELS[categoryView].valueLabel}
                emptyMessage="No champions have entered the Hall of Legends yet. Opt in from Settings to appear here!"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
