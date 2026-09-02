"use server";

import { eq, and, desc, sql, inArray, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { requireFamilyAccess, requireChildAccess, accessibleChildIds } from "@/lib/auth/access";

export async function getFamilyLeaderboard() {
  const access = await requireFamilyAccess();
  const childIds = await accessibleChildIds(access);
  if (childIds.length === 0) return [];

  const children = await db
    .select({
      id: schema.child.id,
      displayName: schema.child.displayName,
      avatarConfig: schema.child.avatarConfig,
      currentXp: schema.child.currentXp,
      currentStreak: schema.child.currentStreak,
      longestStreak: schema.child.longestStreak,
      badgeCount: sql<number>`(
        SELECT count(*) FROM child_badge WHERE child_badge.child_id = ${schema.child.id}
      )`,
      upkeepXp: schema.child.upkeepXp,
    })
    .from(schema.child)
    .where(and(inArray(schema.child.id, childIds), isNull(schema.child.banishedAt)))
    .orderBy(desc(schema.child.currentXp));

  return children;
}

export type LeaderboardCategory = "xp" | "streak" | "longestStreak" | "badges" | "upkeep";

export type CommunityLeaderboardEntry = {
  displayName: string;
  avatarConfig: string | null;
  value: number;
  rank: number;
};

export async function getCommunityLeaderboard(
  category: LeaderboardCategory
): Promise<CommunityLeaderboardEntry[]> {
  await requireSession();

  const orderColumn =
    category === "xp"
      ? schema.child.currentXp
      : category === "streak"
        ? schema.child.currentStreak
        : category === "longestStreak"
          ? schema.child.longestStreak
          : category === "upkeep"
            ? schema.child.upkeepXp
            : null;

  if (category === "badges") {
    const rows = await db
      .select({
        displayName: schema.child.displayName,
        avatarConfig: schema.child.avatarConfig,
        value: sql<number>`count(${schema.childBadge.id})`,
      })
      .from(schema.child)
      .leftJoin(schema.childBadge, eq(schema.child.id, schema.childBadge.childId))
      .where(and(eq(schema.child.showOnLeaderboard, true), isNull(schema.child.banishedAt)))
      .groupBy(schema.child.id)
      .orderBy(sql`count(${schema.childBadge.id}) DESC`)
      .limit(50);

    return rows.map((row, i) => ({
      displayName: row.displayName,
      avatarConfig: row.avatarConfig,
      value: row.value,
      rank: i + 1,
    }));
  }

  // Chore XP is ranked separately from school XP so that doing chores can
  // never inflate — or be crowded out of — the school standings. Only heroes
  // who have actually earned any appear at all.
  const categoryFilter =
    category === "upkeep" ? [gt(schema.child.upkeepXp, 0)] : [];

  const rows = await db
    .select({
      displayName: schema.child.displayName,
      avatarConfig: schema.child.avatarConfig,
      value: orderColumn!,
    })
    .from(schema.child)
    .where(
      and(
        eq(schema.child.showOnLeaderboard, true),
        isNull(schema.child.banishedAt),
        ...categoryFilter
      )
    )
    .orderBy(desc(orderColumn!))
    .limit(50);

  return rows.map((row, i) => ({
    displayName: row.displayName,
    avatarConfig: row.avatarConfig,
    value: row.value,
    rank: i + 1,
  }));
}

export type CommunityLeaderboardAllEntry = {
  displayName: string;
  avatarConfig: string | null;
  xp: number;
  streak: number;
  longestStreak: number;
  badges: number;
  upkeepXp: number;
  rank: number;
};

export async function getCommunityLeaderboardAll(): Promise<CommunityLeaderboardAllEntry[]> {
  await requireSession();

  const rows = await db
    .select({
      displayName: schema.child.displayName,
      avatarConfig: schema.child.avatarConfig,
      xp: schema.child.currentXp,
      streak: schema.child.currentStreak,
      longestStreak: schema.child.longestStreak,
      badges: sql<number>`count(${schema.childBadge.id})`,
      upkeepXp: schema.child.upkeepXp,
    })
    .from(schema.child)
    .leftJoin(schema.childBadge, eq(schema.child.id, schema.childBadge.childId))
    .where(and(eq(schema.child.showOnLeaderboard, true), isNull(schema.child.banishedAt)))
    .groupBy(schema.child.id)
    .orderBy(desc(schema.child.currentXp))
    .limit(50);

  return rows.map((row, i) => ({
    displayName: row.displayName,
    avatarConfig: row.avatarConfig,
    xp: row.xp,
    streak: row.streak,
    longestStreak: row.longestStreak,
    badges: row.badges,
    upkeepXp: row.upkeepXp,
    rank: i + 1,
  }));
}

export async function toggleLeaderboardVisibility(childId: string, visible: boolean) {
  // The "Your Visibility" control is a child-facing opt-in/out (shown only in
  // the hero's own view), so a hero must be able to set it for themselves.
  // requireChildAccess admits both an in-scope adult and the child acting on
  // their own profile. (No requireAdultActor: that gate made this child-only
  // toggle unusable.)
  const { familyId } = await requireChildAccess(childId, { write: true });
  await db
    .update(schema.child)
    .set({ showOnLeaderboard: visible, updatedAt: new Date() })
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId)));
}
