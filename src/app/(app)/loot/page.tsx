import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getBadges, getChildBadges, checkAndAwardBadges } from "@/lib/actions/badges";
import { getEarnedQuestRewards } from "@/lib/actions/quest-assignments";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { Avatar } from "@/components/avatar";
import { getRewardItemLabel, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { GameIcon, BADGE_ICONS } from "@/components/game-icon";

export default async function LootPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  await requireSession();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView) {
    const family = await getFamily();
    if (!family) {
      return (
        <div className="space-y-6">
          <h1 className="page-title text-4xl">Treasure Chest</h1>
          <GameFrame>
            <div className="py-4 text-center">
              <GameIcon name="gem" className="mx-auto size-10 text-[var(--gold-bright)]" />
              <p className="mt-3 text-muted-foreground">
                <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the spoils can flow.
              </p>
            </div>
          </GameFrame>
        </div>
      );
    }
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Treasure Chest</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to begin amassing treasure.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  await checkAndAwardBadges(activeChild.id);

  const [allBadges, earnedBadges, questRewards] = await Promise.all([
    getBadges(),
    getChildBadges(activeChild.id),
    getEarnedQuestRewards(activeChild.id),
  ]);

  const earnedIds = new Set(earnedBadges.map((b) => b.badge.id));

  const xp = activeChild.currentXp;
  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">
            {isChildView ? "My Trophies" : "Treasure Chest"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isChildView
              ? "Your hard-won rewards and achievements!"
              : `${activeChild.displayName}'s rewards and achievements.`}
          </p>
        </div>
        {!isChildView && allChildren.length > 1 && (
          <ChildSelector children={allChildren} selectedId={activeChild.id} />
        )}
      </div>

      {/* Hero Stats — Level, XP, Streaks */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Level Display */}
        <GameFrame className="stat-card">
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="level-badge text-3xl">{level}</div>
              <Avatar
                config={activeChild.avatarConfig ? JSON.parse(activeChild.avatarConfig) as AvatarConfig : null}
                name={activeChild.displayName}
                size="lg"
              />
            </div>
            <p className="mt-3 font-brand text-lg font-bold">Level {level}</p>
            <p className="text-xs text-muted-foreground">Champion Rank</p>
          </div>
        </GameFrame>

        {/* XP Progress */}
        <GameFrame className="stat-card">
          <div className="flex flex-col items-center justify-center">
            <GameIcon name="sparkles" className="size-8 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]" />
            <p className="mt-1 text-3xl font-bold">{xp} <span className="text-base font-normal text-muted-foreground">XP</span></p>
            <div className="xp-bar-track mt-3 w-full">
              <div className="xp-bar-fill" style={{ width: `${xpInLevel}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{xpInLevel}/100 to ascend</p>
            <p className="text-xs text-muted-foreground">Experience Points</p>
          </div>
        </GameFrame>

        {/* Streaks */}
        <GameFrame className="stat-card">
          <div className="flex flex-col items-center justify-center">
            {activeChild.currentStreak > 0 ? (
              <GameIcon name="fire" className="streak-fire size-10 text-[var(--gold-bright)]" />
            ) : (
              <GameIcon name="fire" className="size-8 text-[var(--gold-bright)]" />
            )}
            <p className="mt-1 text-3xl font-bold">{activeChild.currentStreak} <span className="text-base font-normal">days</span></p>
            <p className="text-xs text-muted-foreground">Quest Streak</p>
            <p className="text-xs text-muted-foreground">Best: {activeChild.longestStreak} days</p>
          </div>
        </GameFrame>
      </div>

      {/* Earned badges */}
      <GameFrame title={`Claimed Treasures (${earnedBadges.length})`} icon={<GameIcon name="trophy" className="size-4 text-[var(--gold-bright)]" />}>
        {earnedBadges.length === 0 ? (
          <div className="py-6 text-center">
            <GameIcon name="key" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-sm text-muted-foreground">
              {isChildView
                ? "No treasures yet. Keep completing quests to unlock rewards!"
                : "No treasures claimed yet. More quests await!"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {earnedBadges.map((b) => (
              <div key={b.id} className="badge-earned flex items-center gap-3">
                <span className="badge-icon size-8"><GameIcon name={BADGE_ICONS[b.badge.icon] ?? "medal"} className="size-full text-[var(--gold-bright)]" /></span>
                <div>
                  <p className="font-medium">{b.badge.name}</p>
                  <p className="text-xs text-muted-foreground">{b.badge.description}</p>
                  <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--xp)" }}>+{b.badge.xpReward} XP</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GameFrame>

      {/* Quest Bounties */}
      {questRewards.length > 0 && (
        <GameFrame title="Quest Bounties" icon={<GameIcon name="gift" className="size-4 text-[var(--gold-bright)]" />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {questRewards.map((reward) => {
              const avatarItemLabel = reward.rewardAvatarItem
                ? getRewardItemLabel(reward.rewardAvatarItem)
                : null;
              return (
                <div key={reward.assignmentId} className="flex items-start gap-3 rounded-lg border border-[var(--gold-dim)] bg-[rgba(201,168,76,0.04)] p-2.5">
                  <GameIcon name="trophy" className="size-5 shrink-0 text-[var(--gold-bright)]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{reward.questTitle}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {reward.rewardXp && (
                        <span className="inline-flex items-center rounded-full bg-[rgba(201,168,76,0.15)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--gold-bright)]">
                          +{reward.rewardXp} XP
                        </span>
                      )}
                      {reward.rewardDescription && (
                        <span className="text-[10px] text-muted-foreground">{reward.rewardDescription}</span>
                      )}
                      {avatarItemLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                          <GameIcon name="unlock" className="size-3 text-[var(--gold-bright)]" /> {avatarItemLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GameFrame>
      )}

      {/* Locked badges */}
      {allBadges.filter((b) => !earnedIds.has(b.id)).length > 0 && (
        <GameFrame title="Sealed Relics" icon={<GameIcon name="lock" className="size-4 text-[var(--gold-bright)]" />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allBadges
              .filter((b) => !earnedIds.has(b.id))
              .map((badge) => (
                <div key={badge.id} className="badge-locked flex items-center gap-3">
                  <span className="badge-icon size-8"><GameIcon name={BADGE_ICONS[badge.icon] ?? "medal"} className="size-full text-[var(--gold-bright)]" /></span>
                  <div>
                    <p className="font-medium">{badge.name}</p>
                    <p className="text-xs text-muted-foreground">{badge.description}</p>
                    <p className="text-xs text-muted-foreground">+{badge.xpReward} XP</p>
                  </div>
                </div>
              ))}
          </div>
        </GameFrame>
      )}
    </div>
  );
}
