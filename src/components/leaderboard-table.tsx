"use client";

import { Avatar } from "@/components/avatar";
import { GameFrame } from "@/components/game-frame";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { CommunityLeaderboardAllEntry } from "@/lib/actions/leaderboard";

type LeaderboardEntry = {
  displayName: string;
  avatarConfig: string | null;
  value: number;
  id?: string;
};

type LeaderboardTableProps = {
  title: string;
  icon: string;
  entries: LeaderboardEntry[];
  valueLabel: string;
  highlightId?: string;
  emptyMessage: string;
};

const RANK_STYLES: Record<number, { accent: string; title: string; emoji: string }> = {
  1: { accent: "var(--gold-bright)", title: "Champion", emoji: "👑" },
  2: { accent: "#a0a0b0", title: "Knight Commander", emoji: "🥈" },
  3: { accent: "#cd7f32", title: "Sentinel", emoji: "🥉" },
};

export function LeaderboardTable({
  title,
  icon,
  entries,
  valueLabel,
  highlightId,
  emptyMessage,
}: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <GameFrame title={title} icon={icon}>
        <div className="py-8 text-center">
          <p className="text-4xl">🏛️</p>
          <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      </GameFrame>
    );
  }

  return (
    <GameFrame title={title} icon={icon}>
      <div className="space-y-1">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="w-8 text-center">Rank</span>
          <span className="flex-1">Hero</span>
          <span className="w-20 text-right">{valueLabel}</span>
        </div>

        {entries.map((entry, i) => {
          const rank = i + 1;
          const style = RANK_STYLES[rank];
          const isHighlighted = highlightId && entry.id === highlightId;
          const config = entry.avatarConfig
            ? (JSON.parse(entry.avatarConfig) as AvatarConfig)
            : null;

          return (
            <div
              key={entry.id ?? `${entry.displayName}-${i}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                isHighlighted
                  ? "border border-primary/30 bg-primary/5"
                  : rank <= 3
                    ? "bg-secondary/50"
                    : "hover:bg-muted/30"
              }`}
            >
              {/* Rank */}
              <div className="flex w-8 items-center justify-center">
                {style ? (
                  <span className="text-lg" title={style.title}>
                    {style.emoji}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">{rank}</span>
                )}
              </div>

              {/* Avatar + Name */}
              <div className="flex flex-1 items-center gap-2.5 overflow-hidden">
                <Avatar config={config} name={entry.displayName} size="sm" />
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    style={style ? { color: style.accent } : undefined}
                  >
                    {entry.displayName}
                  </p>
                  {style && (
                    <p className="text-[10px] text-muted-foreground">{style.title}</p>
                  )}
                </div>
              </div>

              {/* Value */}
              <div className="w-20 text-right">
                <span className="text-sm font-bold" style={style ? { color: style.accent } : undefined}>
                  {entry.value.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GameFrame>
  );
}

type CombinedLeaderboardTableProps = {
  entries: CommunityLeaderboardAllEntry[];
  emptyMessage: string;
};

export function CombinedLeaderboardTable({
  entries,
  emptyMessage,
}: CombinedLeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <GameFrame title="Community Hall" icon="🏛️">
        <div className="py-8 text-center">
          <p className="text-4xl">🏛️</p>
          <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      </GameFrame>
    );
  }

  return (
    <GameFrame title="Community Hall" icon="🏛️">
      {/* Six columns can't fit narrow phones — allow horizontal scroll while
          keeping a min-width so the columns stay aligned and legible. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[30rem] space-y-1">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="w-8 text-center">Rank</span>
          <span className="flex-1">Hero</span>
          <span className="w-16 text-right">Glory Pts</span>
          <span className="w-16 text-right">Quest Streak</span>
          <span className="w-16 text-right">Best Streak</span>
          <span className="w-16 text-right">Trophies</span>
        </div>

        {entries.map((entry, i) => {
          const rank = entry.rank;
          const style = RANK_STYLES[rank];
          const config = entry.avatarConfig
            ? (JSON.parse(entry.avatarConfig) as AvatarConfig)
            : null;

          return (
            <div
              key={`${entry.displayName}-${i}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                rank <= 3 ? "bg-secondary/50" : "hover:bg-muted/30"
              }`}
            >
              {/* Rank */}
              <div className="flex w-8 items-center justify-center">
                {style ? (
                  <span className="text-lg" title={style.title}>
                    {style.emoji}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">{rank}</span>
                )}
              </div>

              {/* Avatar + Name */}
              <div className="flex flex-1 items-center gap-2.5 overflow-hidden">
                <Avatar config={config} name={entry.displayName} size="sm" />
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    style={style ? { color: style.accent } : undefined}
                  >
                    {entry.displayName}
                  </p>
                  {style && (
                    <p className="text-[10px] text-muted-foreground">{style.title}</p>
                  )}
                </div>
              </div>

              {/* Values */}
              <div className="w-16 text-right">
                <span className="text-sm font-bold" style={style ? { color: style.accent } : undefined}>
                  {entry.xp.toLocaleString()}
                </span>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm text-muted-foreground">
                  {entry.streak}
                </span>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm text-muted-foreground">
                  {entry.longestStreak}
                </span>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm text-muted-foreground">
                  {entry.badges}
                </span>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </GameFrame>
  );
}
