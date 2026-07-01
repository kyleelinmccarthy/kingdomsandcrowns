import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSubjects } from "@/lib/actions/subjects";
import { getRecentActivities } from "@/lib/actions/activities";
import { getAssignmentsForDate, generateAssignmentsFromSchedules } from "@/lib/actions/quest-assignments";
import { getQuests } from "@/lib/actions/quests";
import { getBadges, getChildBadges, checkAndAwardBadges } from "@/lib/actions/badges";
import { getChildAvatarUnlocks } from "@/lib/actions/avatar";
import { formatDate } from "@/lib/utils/dates";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { Avatar } from "@/components/avatar";
import { TavernAvatarCard } from "./tavern-avatar-card";
import { TimerCleanup } from "@/components/timer-cleanup";
import { QuestAssignmentCard } from "@/components/quest-assignment-card";
import { QuestForm } from "../quests/quest-form";
import { QuestLog } from "../quests/quest-log";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { GameIcon, BADGE_ICONS } from "@/components/game-icon";

export default async function TavernPage({
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
        <div className="hud-empty">
          <GameFrame>
            <div className="py-8 text-center">
              <GameIcon name="castle" className="mx-auto size-10 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]" />
              <p className="mt-4 text-lg font-medium">Hail, traveler! Welcome to Kingdoms & Crowns!</p>
              <p className="mt-2 text-sm text-muted-foreground">
                <Link href="/settings" className="text-primary hover:underline">
                  Visit the Hearth
                </Link>{" "}
                to set up your family and recruit your first hero.
              </p>
            </div>
          </GameFrame>
        </div>
      );
    }
  }

  if (!activeChild) {
    return (
      <div className="hud-empty">
        <GameFrame>
          <div className="py-8 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-4 text-lg font-medium">No heroes have joined the ranks yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">
                Visit the Hearth
              </Link>{" "}
              to summon your first champion.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  await checkAndAwardBadges(activeChild.id);

  const today = formatDate(new Date());
  await generateAssignmentsFromSchedules(activeChild.id, today, today);

  const [subjects, recentActivities, allBadges, earnedBadges, todayAssignments, quests, avatarUnlocks] = await Promise.all([
    getSubjects(activeChild.id),
    getRecentActivities(activeChild.id, 50),
    getBadges(),
    getChildBadges(activeChild.id),
    getAssignmentsForDate(activeChild.id, today),
    getQuests(activeChild.id),
    getChildAvatarUnlocks(activeChild.id),
  ]);

  const pendingIds = todayAssignments
    .filter((a) => a.assignment.status === "pending")
    .map((a) => a.assignment.id);

  const level = Math.floor(activeChild.currentXp / 100) + 1;
  const xpInLevel = activeChild.currentXp % 100;
  const earnedIds = new Set(earnedBadges.map((b) => b.badge.id));
  const earnedBadgeIdList = earnedBadges.map((b) => b.badge.id);
  const questUnlockedItemIds = avatarUnlocks.map((u) => u.itemId);

  return (
    <div className="hud-layout">
      <TimerCleanup pendingAssignmentIds={pendingIds} />
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">
            {isChildView ? "My Tavern" : "The Tavern"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isChildView
              ? `Welcome back, ${activeChild.displayName}!`
              : `${activeChild.displayName}'s adventure hub`}
          </p>
        </div>
        {!isChildView && allChildren.length > 1 && (
          <ChildSelector children={allChildren} selectedId={activeChild.id} />
        )}
      </div>

      {/* ═══ ROW 1: Quest Log | Character | Quest Form ═══ */}
      <div className="hud-row-main">

        {/* LEFT: Recent Adventures (quest log) */}
        <GameFrame
          title="Recent Adventures"
          icon={<GameIcon name="book" className="size-4 text-[var(--gold-bright)]" />}
          className="hud-panel-left"
          action={
            <Link href="/quests" className="text-xs font-medium text-primary hover:underline">
              Full log →
            </Link>
          }
        >
          <div className="hud-scroll-panel">
            <QuestLog activities={recentActivities} subjects={subjects} />
          </div>
        </GameFrame>

        {/* CENTER: Character Showcase (avatar, name, level, XP, streaks) */}
        <div className="hud-panel-center">
          {isChildView ? (
            <TavernAvatarCard
              childId={activeChild.id}
              childName={activeChild.displayName}
              avatarConfig={activeChild.avatarConfig}
              level={level}
              xpInLevel={xpInLevel}
              currentXp={activeChild.currentXp}
              earnedBadgeIds={earnedBadgeIdList}
              questUnlockedItems={questUnlockedItemIds}
            />
          ) : (
            <GameFrame className="hud-character-frame" borderless>
              <div className="flex flex-col items-center text-center">
                <div className="hud-hero-showcase">
                  <div className="hud-hero-pedestal" />
                  <Avatar
                    config={activeChild.avatarConfig ? JSON.parse(activeChild.avatarConfig) as AvatarConfig : null}
                    name={activeChild.displayName}
                    size="xl"
                    className="hud-avatar hud-hero-avatar"
                  />
                </div>
                <p className="mt-3 font-brand text-2xl font-bold tracking-wide" style={{ color: "var(--gold-bright)" }}>
                  {activeChild.displayName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Level {level} Champion
                </p>

                {/* Level badge + XP bar */}
                <div className="mt-3 flex items-center gap-4">
                  <div className="level-badge">{level}</div>
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">{xpInLevel}/100 XP to ascend</p>
                    <div className="xp-bar-track mt-1" style={{ width: "8rem" }}>
                      <div className="xp-bar-fill" style={{ width: `${xpInLevel}%` }} />
                    </div>
                  </div>
                </div>

                {/* Streak + XP stats */}
                <div className="mt-4 flex gap-6 text-center">
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--streak)" }}>{activeChild.currentStreak}</p>
                    <p className="text-xs text-muted-foreground">day streak</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--xp)" }}>{activeChild.currentXp}</p>
                    <p className="text-xs text-muted-foreground">total XP</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: "var(--magic)" }}>{activeChild.longestStreak}</p>
                    <p className="text-xs text-muted-foreground">best streak</p>
                  </div>
                </div>
              </div>
            </GameFrame>
          )}
        </div>

        {/* RIGHT: Start a Quest (quest form) */}
        <div className="hud-panel-right">
          <QuestForm childId={activeChild.id} subjects={subjects} quests={quests} todayAssignments={todayAssignments} />
        </div>
      </div>

      {/* ═══ ROW 2: Hero's Path (gamification info) + Loot ═══ */}
      <div className="hud-row-bottom">

        {/* LEFT: Hero's Path — gamification progression info */}
        <GameFrame title="Hero's Path" icon={<GameIcon name="journey" className="size-4 text-[var(--gold-bright)]" />} className="hud-panel-profile">
          <div className="space-y-4">
            {/* How XP works */}
            <div className="hud-gamify-section">
              <p className="text-base font-bold uppercase tracking-wide" style={{ color: "var(--xp)" }}>Experience Points (XP)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete quests to earn 10 XP each. Every 100 XP ascends your hero to the next level, unlocking new avatar gear! Max level: 100.
              </p>
            </div>

            {/* Level unlock milestones */}
            <div className="hud-gamify-section">
              <p className="text-base font-bold uppercase tracking-wide" style={{ color: "var(--gold-bright)" }}>Level Unlocks</p>
              <div className="mt-2 space-y-1.5">
                <UnlockMilestone level={3} current={level} items="Braided hair, Armor, Bandana, Diamond crest" />
                <UnlockMilestone level={5} current={level} items="Ponytail, Cloak, Glasses, Leather Pants" />
                <UnlockMilestone level={8} current={level} items="Cape, Crown, Iron Boots, Rabbit" />
                <UnlockMilestone level={15} current={level} items="Ranger Coat, Afro, Chain Leggings, Hawk" />
                <UnlockMilestone level={20} current={level} items="Knight Plate, Plate Greaves, Shoulder Guard" />
                <UnlockMilestone level={30} current={level} items="Shadow Cloak, Ranger Boots, Face Mask, Bear" />
                <UnlockMilestone level={40} current={level} items="Mystic Robes, Shadow Steps, Dragon" />
                <UnlockMilestone level={50} current={level} items="🏰 Castle unlocks! Dragonscale, Unicorn" />
                <UnlockMilestone level={75} current={level} items="Archmage Vestments, Celestial Boots" />
                <UnlockMilestone level={100} current={level} items="Titan's Plate, Celestial Dragon, Citadel" />
              </div>
            </div>

            {/* Castle teaser */}
            <div className="hud-gamify-section">
              <p className="text-base font-bold uppercase tracking-wide" style={{ color: "var(--gold-bright)" }}>
                {level >= 50 ? "🏰 Your Castle" : "🏰 Castle (Level 50)"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {level >= 50
                  ? "Your castle awaits! Visit the Castle page to upgrade your stronghold."
                  : `Reach level 50 to unlock your own castle! ${50 - level} levels to go.`}
              </p>
            </div>

            {/* Streak info */}
            <div className="hud-gamify-section">
              <p className="text-base font-bold uppercase tracking-wide" style={{ color: "var(--streak)" }}>Quest Streaks</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Log at least one quest each day to build a streak. Streaks unlock special gear and exclusive armor!
              </p>
            </div>

            {/* Badge-locked items teaser */}
            <div className="hud-gamify-section">
              <p className="text-base font-bold uppercase tracking-wide" style={{ color: "var(--primary)" }}>Secret Gear</p>
              <div className="mt-1.5 flex flex-wrap gap-3">
                <BadgeUnlockTeaser icon="🏴‍☠️" name="Eyepatch" badge="3-Day Streak" earned={earnedIds.has("badge-streak-3")} />
                <BadgeUnlockTeaser icon="😈" name="Horns" badge="Week Warrior" earned={earnedIds.has("badge-streak-7")} />
                <BadgeUnlockTeaser icon="😇" name="Halo" badge="Busy Bee" earned={earnedIds.has("badge-volume-50")} />
                <BadgeUnlockTeaser icon="⚔️" name="Battle Scars" badge="Monthly Master" earned={earnedIds.has("badge-streak-30")} />
                <BadgeUnlockTeaser icon="🔮" name="Wisdom Orb" badge="Century Club" earned={earnedIds.has("badge-volume-100")} />
                <BadgeUnlockTeaser icon="🪶" name="Phoenix Feather" badge="Half-Year Hero" earned={earnedIds.has("badge-streak-180")} />
                <BadgeUnlockTeaser icon="👁️" name="Third Eye" badge="Polymath" earned={earnedIds.has("badge-polymath")} />
                <BadgeUnlockTeaser icon="🗺️" name="Star Map" badge="Curious Mind" earned={earnedIds.has("badge-explorer-subjects-3")} />
                <BadgeUnlockTeaser icon="⚡" name="Lightning Bolt" badge="Knowledge Blitz" earned={earnedIds.has("badge-explorer-blitz")} />
                <BadgeUnlockTeaser icon="🌙" name="Moon Charm" badge="Night Owl" earned={earnedIds.has("badge-special-night-owl")} />
                <BadgeUnlockTeaser icon="☀️" name="Sun Pendant" badge="Early Bird" earned={earnedIds.has("badge-special-early-bird")} />
                <BadgeUnlockTeaser icon="⏳" name="Chrono Gauntlet" badge="Chrono Champion" earned={earnedIds.has("badge-timer-100")} />
                <BadgeUnlockTeaser icon="🪶" name="Scholar's Quill" badge="Centurion of Learning" earned={earnedIds.has("badge-time-100hr")} />
              </div>
            </div>
          </div>
        </GameFrame>

        {/* RIGHT: Treasure Chest (loot — badges earned + locked) */}
        <div className="hud-panel-loot space-y-4">
          <GameFrame
            title={`Treasure Chest (${earnedBadges.length})`}
            icon={<GameIcon name="gem" className="size-4 text-[var(--gold-bright)]" />}
            action={
              <Link
                href={`/loot${isChildView ? "" : `?child=${activeChild.id}`}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                View all →
              </Link>
            }
          >
            {earnedBadges.length === 0 ? (
              <div className="py-4 text-center">
                <GameIcon name="key" className="mx-auto size-8 text-[var(--gold-bright)]" />
                <p className="mt-2 text-sm text-muted-foreground">No treasures yet. Keep questing!</p>
              </div>
            ) : (
              <div className="hud-loot-grid">
                {earnedBadges.slice(-8).map((b) => (
                  <div key={b.id} className="hud-loot-item">
                    <span className="hud-loot-icon size-7"><GameIcon name={BADGE_ICONS[b.badge.icon] ?? "medal"} className="size-full text-[var(--gold-bright)]" /></span>
                    <p className="text-xs font-medium">{b.badge.name}</p>
                    <p className="text-[10px] text-muted-foreground">+{b.badge.xpReward} XP</p>
                  </div>
                ))}
              </div>
            )}
          </GameFrame>

          {allBadges.filter((b) => !earnedIds.has(b.id)).length > 0 && (
            <GameFrame
              title={`Sealed Relics (${allBadges.filter((b) => !earnedIds.has(b.id)).length})`}
              icon={<GameIcon name="lock" className="size-4 text-[var(--gold-bright)]" />}
              action={
                <Link
                  href={`/loot${isChildView ? "" : `?child=${activeChild.id}`}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              }
            >
              <div className="hud-loot-grid">
                {allBadges
                  .filter((b) => !earnedIds.has(b.id))
                  .slice(0, 8)
                  .map((badge) => (
                    <div key={badge.id} className="hud-loot-item hud-loot-item--locked">
                      <span className="hud-loot-icon size-7"><GameIcon name={BADGE_ICONS[badge.icon] ?? "medal"} className="size-full text-[var(--gold-bright)]" /></span>
                      <p className="text-xs font-medium">{badge.name}</p>
                      <p className="text-[10px] text-muted-foreground">{badge.description}</p>
                    </div>
                  ))}
              </div>
            </GameFrame>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Gamification sub-components ──────────────────────────── */

function UnlockMilestone({
  level, current, items,
}: {
  level: number; current: number; items: string;
}) {
  const unlocked = current >= level;
  return (
    <div className={`flex items-start gap-2 text-xs ${unlocked ? "" : "opacity-50"}`}>
      <GameIcon name={unlocked ? "check" : "lock"} className="mt-0.5 size-4 shrink-0 text-[var(--gold-bright)]" />
      <div>
        <span className="font-medium">Level {level}:</span>{" "}
        <span className="text-muted-foreground">{items}</span>
      </div>
    </div>
  );
}

function BadgeUnlockTeaser({
  icon, name, badge, earned,
}: {
  icon: string; name: string; badge: string; earned: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-0.5 text-center ${earned ? "" : "opacity-40"}`}>
      <span className="text-xl">{icon}</span>
      <p className="text-[10px] font-medium">{name}</p>
      <p className="text-[9px] text-muted-foreground">{earned ? "Unlocked!" : badge}</p>
    </div>
  );
}
