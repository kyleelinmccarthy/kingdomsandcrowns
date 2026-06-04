"use server";

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { requireChildAccess } from "@/lib/auth/access";

export async function getBadges() {
  return db.select().from(schema.badge);
}

export async function getChildBadges(childId: string) {
  await requireChildAccess(childId);
  return db
    .select({
      id: schema.childBadge.id,
      earnedAt: schema.childBadge.earnedAt,
      badge: {
        id: schema.badge.id,
        name: schema.badge.name,
        description: schema.badge.description,
        icon: schema.badge.icon,
        category: schema.badge.category,
        xpReward: schema.badge.xpReward,
      },
    })
    .from(schema.childBadge)
    .innerJoin(schema.badge, eq(schema.childBadge.badgeId, schema.badge.id))
    .where(eq(schema.childBadge.childId, childId));
}

export async function checkAndAwardBadges(childId: string) {
  // Read-level: badge evaluation runs automatically on page load, so even a
  // view-only guardian viewing this child triggers (idempotent) awarding.
  await requireChildAccess(childId);

  // All badge metrics are independent reads — fetch them in a single parallel
  // batch instead of ~14 sequential round-trips (each one a network hop to the
  // remote DB). The same-table scalar aggregates are folded into one query.
  const [
    child,
    scalars,
    subjectCounts,
    questsCompleted,
    maxDailyActivities,
    maxDailySubjectsResult,
    subjectMinutesResult,
    dailyMinutesResult,
    existing,
    allBadges,
  ] = await Promise.all([
    db.select().from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    // Whole-table scalar metrics over this child's activity log.
    db
      .select({
        totalActivities: sql<number>`count(*)`,
        totalMinutes: sql<number>`coalesce(sum(${schema.activityLog.durationMinutes}), 0)`,
        longestSession: sql<number>`coalesce(max(${schema.activityLog.durationMinutes}), 0)`,
        timerActivities: sql<number>`coalesce(sum(case when ${schema.activityLog.source} = 'timer' then 1 else 0 end), 0)`,
        distinctDays: sql<number>`count(distinct ${schema.activityLog.date})`,
        distinctWeeks: sql<number>`count(distinct strftime('%Y-%W', ${schema.activityLog.date}))`,
      })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId)),
    // Per-subject activity counts for subject badges
    db
      .select({
        subjectId: schema.activityLog.subjectId,
        count: sql<number>`count(*)`,
      })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId))
      .groupBy(schema.activityLog.subjectId),
    // Quest assignments completed
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.questAssignment)
      .where(
        and(
          eq(schema.questAssignment.childId, childId),
          eq(schema.questAssignment.status, "completed"),
        ),
      ),
    // Max activities in a single day (for dailyActivities badges)
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId))
      .groupBy(schema.activityLog.date)
      .orderBy(sql`count(*) desc`)
      .limit(1),
    // Max subjects studied in a single day
    db
      .select({ count: sql<number>`count(distinct ${schema.activityLog.subjectId})` })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId))
      .groupBy(schema.activityLog.date)
      .orderBy(sql`count(distinct ${schema.activityLog.subjectId}) desc`)
      .limit(1),
    // Most minutes logged in a single subject
    db
      .select({ total: sql<number>`coalesce(sum(${schema.activityLog.durationMinutes}), 0)` })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId))
      .groupBy(schema.activityLog.subjectId)
      .orderBy(sql`sum(${schema.activityLog.durationMinutes}) desc`)
      .limit(1),
    // Most minutes logged in a single day
    db
      .select({ total: sql<number>`coalesce(sum(${schema.activityLog.durationMinutes}), 0)` })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.childId, childId))
      .groupBy(schema.activityLog.date)
      .orderBy(sql`sum(${schema.activityLog.durationMinutes}) desc`)
      .limit(1),
    // Badges already earned
    db
      .select({ badgeId: schema.childBadge.badgeId })
      .from(schema.childBadge)
      .where(eq(schema.childBadge.childId, childId)),
    db.select().from(schema.badge),
  ]);

  if (!child[0]) return [];

  const totalActivities = scalars[0]?.totalActivities ?? 0;
  const totalMinutes = scalars[0]?.totalMinutes ?? 0;
  const longestSession = scalars[0]?.longestSession ?? 0;
  const timerActivities = scalars[0]?.timerActivities ?? 0;
  const distinctDays = scalars[0]?.distinctDays ?? 0;
  const distinctWeeks = scalars[0]?.distinctWeeks ?? 0;
  const maxDailySubjects = maxDailySubjectsResult[0]?.count ?? 0;
  const maxSubjectMinutes = subjectMinutesResult[0]?.total ?? 0;
  const maxDailyMinutes = dailyMinutesResult[0]?.total ?? 0;

  // ── Evaluate badges ───────────────────────────────────────

  const earnedIds = new Set(existing.map((e) => e.badgeId));
  const newlyEarned: string[] = [];

  const level = Math.floor(child[0].currentXp / 100) + 1;

  for (const badge of allBadges) {
    if (earnedIds.has(badge.id)) continue;

    const criteria = JSON.parse(badge.criteria);
    let earned = false;

    // Streak criteria
    if (criteria.streakDays && Math.max(child[0].currentStreak, child[0].longestStreak) >= criteria.streakDays) {
      earned = true;
    }
    // Volume criteria (works for both "volume" and "special" categories)
    if (criteria.totalActivities && totalActivities >= criteria.totalActivities) {
      earned = true;
    }
    // Subject-specific criteria: any single subject with >= N activities
    if (criteria.subjectActivities) {
      const hasQualifying = subjectCounts.some((s) => s.count >= criteria.subjectActivities);
      if (hasQualifying) earned = true;
    }
    // Polymath criteria: N subjects each with >= M activities
    if (criteria.subjectCount && criteria.minPerSubject) {
      const qualifyingSubjects = subjectCounts.filter((s) => s.count >= criteria.minPerSubject).length;
      if (qualifyingSubjects >= criteria.subjectCount) earned = true;
    }
    // Quests completed criteria
    if (criteria.questsCompleted && questsCompleted[0].count >= criteria.questsCompleted) {
      earned = true;
    }
    // Level reached criteria
    if (criteria.levelReached && level >= criteria.levelReached) {
      earned = true;
    }
    // Daily activities criteria (most in one day)
    if (criteria.dailyActivities && maxDailyActivities.length > 0 && maxDailyActivities[0].count >= criteria.dailyActivities) {
      earned = true;
    }

    // ── Education-focused criteria ──────────────────────────

    // Total study time (minutes)
    if (criteria.totalMinutes && totalMinutes >= criteria.totalMinutes) {
      earned = true;
    }
    // Longest single study session (minutes)
    if (criteria.longestSession && longestSession >= criteria.longestSession) {
      earned = true;
    }
    // Timer usage count
    if (criteria.timerActivities && timerActivities >= criteria.timerActivities) {
      earned = true;
    }
    // Distinct days with activity
    if (criteria.distinctDays && distinctDays >= criteria.distinctDays) {
      earned = true;
    }
    // Distinct weeks with activity
    if (criteria.distinctWeeks && distinctWeeks >= criteria.distinctWeeks) {
      earned = true;
    }
    // Max subjects in a single day
    if (criteria.dailySubjects && maxDailySubjects >= criteria.dailySubjects) {
      earned = true;
    }
    // Most minutes in a single subject
    if (criteria.subjectMinutes && maxSubjectMinutes >= criteria.subjectMinutes) {
      earned = true;
    }
    // Most minutes in a single day
    if (criteria.dailyMinutes && maxDailyMinutes >= criteria.dailyMinutes) {
      earned = true;
    }

    if (earned) {
      await db.insert(schema.childBadge).values({
        id: nanoid(),
        childId,
        badgeId: badge.id,
        earnedAt: new Date(),
      });
      newlyEarned.push(badge.name);
    }
  }

  return newlyEarned;
}
