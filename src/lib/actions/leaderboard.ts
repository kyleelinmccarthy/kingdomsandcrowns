"use server";

import { eq, and, desc, sql, inArray } from "drizzle-orm";
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
    })
    .from(schema.child)
    .where(inArray(schema.child.id, childIds))
    .orderBy(desc(schema.child.currentXp));

  return children;
}

export type LeaderboardCategory = "xp" | "streak" | "longestStreak" | "badges";

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
      .where(eq(schema.child.showOnLeaderboard, true))
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

  const rows = await db
    .select({
      displayName: schema.child.displayName,
      avatarConfig: schema.child.avatarConfig,
      value: orderColumn!,
    })
    .from(schema.child)
    .where(eq(schema.child.showOnLeaderboard, true))
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
    })
    .from(schema.child)
    .leftJoin(schema.childBadge, eq(schema.child.id, schema.childBadge.childId))
    .where(eq(schema.child.showOnLeaderboard, true))
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
