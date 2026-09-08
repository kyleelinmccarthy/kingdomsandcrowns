"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { AvatarCustomizer } from "@/components/avatar-customizer";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { CrownChoice } from "@/lib/utils/seasons";

export function TavernAvatarCard({
  childId,
  childName,
  avatarConfig,
  level,
  xpInLevel,
  earnedBadgeIds = [],
  questUnlockedItems = [],
  crownCount = 0,
  crowns = [],
}: {
  childId: string;
  childName: string;
  avatarConfig: string | null;
  level: number;
  xpInLevel: number;
  earnedBadgeIds?: string[];
  questUnlockedItems?: string[];
  crownCount?: number;
  crowns?: CrownChoice[];
}) {
  const [showCustomizer, setShowCustomizer] = useState(false);
  const config = avatarConfig ? (JSON.parse(avatarConfig) as AvatarConfig) : null;

  return (
    <>
      <GameFrame className="hud-character-frame" borderless>
        <div className="flex flex-col items-center text-center">
          <button
            onClick={() => setShowCustomizer(true)}
            className="hud-hero-showcase rounded-xl transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
            title="Customize your hero look"
          >
            <div className="hud-hero-pedestal" />
            <Avatar config={config} name={childName} size="xl" className="hud-avatar hud-hero-avatar" />
          </button>
          <p className="mt-3 font-brand text-2xl font-bold tracking-wide" style={{ color: "var(--gold-bright)" }}>
            {childName}
          </p>
          <p className="text-sm text-muted-foreground">Level {level} Champion</p>
          {crownCount > 0 && (
            <p className="text-xs text-[var(--gold-bright)]">
              <GameIcon name="crown" className="mr-1 inline size-3.5" />
              {crownCount} {crownCount === 1 ? "Crown" : "Crowns"}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            <div className="level-badge">{level}</div>
            <div className="text-left">
              <p className="text-xs text-muted-foreground">{xpInLevel}/100 XP to ascend</p>
              <div className="xp-bar-track mt-1" style={{ width: "8rem" }}>
                <div className="xp-bar-fill" style={{ width: `${xpInLevel}%` }} />
              </div>
            </div>
          </div>
        </div>
      </GameFrame>

      <AvatarCustomizer
        key={childId}
        childId={childId}
        childName={childName}
        currentConfig={config}
        level={level}
        earnedBadgeIds={earnedBadgeIds}
        questUnlockedItems={questUnlockedItems}
        crowns={crowns}
        open={showCustomizer}
        onClose={() => setShowCustomizer(false)}
      />
    </>
  );
}
