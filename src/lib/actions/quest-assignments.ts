"use server";

import { nanoid } from "nanoid";
import { eq, and, gte, lte, ne, or, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createActivity, deleteActivity } from "@/lib/actions/activities";
import { getScheduledDates } from "@/lib/utils/schedule";
import { formatDate } from "@/lib/utils/dates";
import { getSchoolDays, getScheduleBlocks } from "@/lib/actions/student-schedule";
import { getSchoolingModeForDate } from "@/lib/actions/schooling-mode";
import { requireChildAccess, requireAssignmentAccess, isChildActor } from "@/lib/auth/access";
import { sanitizeText } from "@/lib/utils/sanitize";
import { weekdayOfDate } from "@/lib/utils/schedule-days";
import { getNextStructuredQuest } from "@/lib/utils/quest-ordering";
import { pruneStaleAssignmentsInRange } from "@/lib/services/quest-assignment-sync";
import { recordQuestAlert } from "@/lib/services/parent-alerts";

/**
 * A removed quest keeps its finished assignments — they're the hero's history
 * and the learning log reads them back — but its *pending* rows are a plan
 * that no longer exists, so they must never surface in Today's Quests or
 * Upcoming Quests. Assignment cleanup deletes those rows at the source; this
 * is the read-side guard that also covers rows stranded before that existed.
 */
const visibleAssignment = or(
  eq(schema.quest.isActive, true),
  ne(schema.questAssignment.status, "pending")
);

export async function getAssignmentsForDate(childId: string, date: string) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
      subject: schema.subject,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .innerJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.date, date),
        visibleAssignment
      )
    );
}

export async function getAssignmentsForDateRange(
  childId: string,
  startDate: string,
  endDate: string
) {
  await requireChildAccess(childId);
  return db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
      subject: schema.subject,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .innerJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        gte(schema.questAssignment.date, startDate),
        lte(schema.questAssignment.date, endDate),
        visibleAssignment
      )
    );
}

export async function getLatestAssignmentStatusByQuest(childId: string) {
  await requireChildAccess(childId);
  const rows = await db
    .select({
      questId: schema.questAssignment.questId,
      status: schema.questAssignment.status,
      date: schema.questAssignment.date,
    })
    .from(schema.questAssignment)
    .where(eq(schema.questAssignment.childId, childId));

  const latest: Record<string, { status: string; date: string }> = {};
  for (const row of rows) {
    const current = latest[row.questId];
    if (!current || row.date >= current.date) {
      latest[row.questId] = { status: row.status, date: row.date };
    }
  }
  return latest;
}

/**
 * In structured mode, only the "next" quest in schedule order may be started
 * or completed BY THE HERO THEMSELVES — a parent/adult can always act on any
 * quest in any order, the same way they can already Skip a quest (a
 * child-only-visible restriction elsewhere in this file). This guards BOTH
 * createAssignment (the "Start a Quest" flow) and completeAssignment —
 * recurring quests already have a `pending` questAssignment row materialized
 * by generateAssignmentsFromSchedules before a hero ever opens the page, so
 * the "Assigned Quests" list's own Quick Complete button can complete one
 * directly without ever going through createAssignment. Gating
 * createAssignment alone would leave that path wide open for the hero.
 *
 * The queue is deliberately clock-independent (see getStructuredQuestQueue),
 * so this agrees with what the page showed as unlocked no matter how much
 * time passed between render and submit.
 */
async function assertQuestUnlockedInStructuredMode(
  childId: string,
  date: string,
  questId: string,
  isChild: boolean
) {
  if (!isChild) return;
  // The queue orders *today*. Catch-up work carries its own, older date and is
  // offered in its own panel, outside today's schedule — holding it to the
  // order of a day that is over would refuse the very quest the catch-up list
  // just presented, and would make a hero clear last Monday in Monday's order
  // before touching last Tuesday.
  if (date !== formatDate(new Date())) return;
  const effectiveMode = await getSchoolingModeForDate(childId, date);
  if (effectiveMode !== "structured") return;

  const [questRows, todayAssignments, latestStatusByQuestId, allBlocks] = await Promise.all([
    db
      .select({
        quest: schema.quest,
        hasSchedule: sql<boolean>`${schema.questSchedule.id} is not null`,
      })
      .from(schema.quest)
      .leftJoin(schema.questSchedule, eq(schema.questSchedule.questId, schema.quest.id))
      .where(and(eq(schema.quest.childId, childId), eq(schema.quest.isActive, true))),
    getAssignmentsForDate(childId, date),
    getLatestAssignmentStatusByQuest(childId),
    getScheduleBlocks(childId),
  ]);
  const todaysBlocks = allBlocks.filter((b) => b.dayOfWeek === weekdayOfDate(date));
  const orderable = questRows.map((r) => ({ ...r.quest, hasSchedule: r.hasSchedule }));
  const next = getNextStructuredQuest({
    quests: orderable,
    todayAssignments,
    latestStatusByQuestId,
    todaysBlocks,
  });
  if (!next) {
    throw new Error("All of today's quests are already complete.");
  }
  if (next.id !== questId) {
    throw new Error(`Complete "${next.title}" first — quests unlock in order today.`);
  }
}

export async function createAssignment(data: {
  questId: string;
  childId: string;
  date: string;
}) {
  // Lazily materializing a quest into a today-assignment is the heart of the
  // "Start a Quest" flow that heroes use themselves, so a child must be able to
  // create one for their own quests. requireChildAccess authorizes both an
  // in-scope adult and the child acting on their own profile. (No
  // requireAdultActor: that gate crashed the child's start-quest action.)
  const { access } = await requireChildAccess(data.childId, { write: true });

  await assertQuestUnlockedInStructuredMode(
    data.childId,
    data.date,
    data.questId,
    isChildActor(access)
  );

  const id = nanoid();
  const now = new Date();
  await db.insert(schema.questAssignment).values({
    id,
    questId: data.questId,
    childId: data.childId,
    date: data.date,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

/**
 * Generates assignment rows from all active quest schedules for a child
 * within the given date range. Idempotent — skips dates that already
 * have an assignment for the same quest.
 */
export async function generateAssignmentsFromSchedules(
  childId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  // Idempotent housekeeping that materializes the parent-defined recurring
  // schedules into today's assignments. It runs on page load for child-facing
  // pages (tavern, quests), so a child viewing their own data must be allowed
  // to trigger it — requireChildAccess covers both in-scope adults and the
  // child acting on their own profile. (No requireAdultActor: that gate crashed
  // the tavern/quests pages for any logged-in hero.)
  await requireChildAccess(childId, { write: true });
  const schoolDays = await getSchoolDays(childId);

  // Generation only ever adds rows, so retiring a quest or its repeat used to
  // leave the days it had already planned sitting in this window forever.
  // Sweep those out first, before anything reads the range back.
  await pruneStaleAssignmentsInRange(childId, startDate, endDate, schoolDays);

  // Get all active quests with schedules for this child
  const questsWithSchedules = await db
    .select({
      quest: schema.quest,
      schedule: schema.questSchedule,
    })
    .from(schema.quest)
    .innerJoin(schema.questSchedule, eq(schema.quest.id, schema.questSchedule.questId))
    .where(
      and(
        eq(schema.quest.childId, childId),
        eq(schema.quest.isActive, true)
      )
    );

  if (questsWithSchedules.length === 0) return 0;

  // Get existing assignments in the range to avoid duplicates
  const existingAssignments = await db
    .select({
      questId: schema.questAssignment.questId,
      date: schema.questAssignment.date,
    })
    .from(schema.questAssignment)
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        gte(schema.questAssignment.date, startDate),
        lte(schema.questAssignment.date, endDate)
      )
    );

  const existingSet = new Set(
    existingAssignments.map((a) => `${a.questId}:${a.date}`)
  );

  let created = 0;
  const now = new Date();

  for (const { quest, schedule } of questsWithSchedules) {
    const daysOfWeek = schedule.daysOfWeek
      ? (JSON.parse(schedule.daysOfWeek) as string[])
      : null;

    const dates = getScheduledDates(
      schedule.frequency,
      daysOfWeek,
      schedule.intervalWeeks,
      schedule.startDate,
      schedule.endDate,
      startDate,
      endDate,
      schoolDays
    );

    for (const date of dates) {
      const key = `${quest.id}:${date}`;
      if (existingSet.has(key)) continue;

      // onConflictDoNothing guards against a concurrent call (e.g. a
      // prefetched route) racing this same check-then-insert for the same
      // quest+day — the unique index is what actually prevents the dupe.
      const inserted = await db
        .insert(schema.questAssignment)
        .values({
          id: nanoid(),
          questId: quest.id,
          childId,
          date,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: schema.questAssignment.id });

      existingSet.add(key);
      if (inserted.length > 0) created++;
    }
  }

  return created;
}

/**
 * Refetches everything QuestForm needs for a specific date. Used when the
 * browser's real local date turns out to differ from what the server
 * rendered (a midnight-boundary edge case) so the form can re-sync to the
 * hero's actual "today" instead of the server's.
 */
export async function getQuestFormData(childId: string, date: string) {
  await requireChildAccess(childId);
  await generateAssignmentsFromSchedules(childId, date, date);
  const [todayAssignments, allBlocks, latestStatusByQuestId, effectiveMode] = await Promise.all([
    getAssignmentsForDate(childId, date),
    getScheduleBlocks(childId),
    getLatestAssignmentStatusByQuest(childId),
    getSchoolingModeForDate(childId, date),
  ]);
  const todaysBlocks = allBlocks.filter((b) => b.dayOfWeek === weekdayOfDate(date));
  return { todayAssignments, todaysBlocks, latestStatusByQuestId, effectiveMode };
}

/** Lightweight lookup used by the timer popup to know whether Scribe's Notes are required before completing. */
export async function getAssignmentQuestInfo(assignmentId: string) {
  await requireAssignmentAccess(assignmentId);
  const rows = await db
    .select({
      title: schema.quest.title,
      requireNotes: schema.quest.requireNotes,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function completeAssignment(
  assignmentId: string,
  activityData: {
    title?: string;
    description?: string;
    durationMinutes?: number;
    startedAt?: Date;
    endedAt?: Date;
    source?: "manual" | "timer";
  } = {}
) {
  const { access } = await requireAssignmentAccess(assignmentId, { write: true });
  // Get the assignment to find quest/child details
  const rows = await db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Assignment not found");

  // Guard against double-completion — return existing activity if already done
  if (row.assignment.status === "completed" && row.assignment.activityLogId) {
    return { activityId: row.assignment.activityLogId };
  }

  await assertQuestUnlockedInStructuredMode(
    row.assignment.childId,
    row.assignment.date,
    row.quest.id,
    isChildActor(access)
  );

  const notes = activityData.description ? sanitizeText(activityData.description) : "";
  if (row.quest.requireNotes && !notes) {
    throw new Error("Scribe's Notes are required to complete this quest");
  }

  // Catch-up work is chronicled on the day it was actually done, not the day it
  // was set. The assignment keeps its own date — the learning log reads the
  // plan back day by day, and last Monday's record should show Monday's work
  // finished — but the activity log is the record of effort, and it feeds the
  // streak. A hero who sits down and clears three missed quests has done a day's questing
  // today, and their streak has to say so.
  const today = formatDate(new Date());
  const chronicleDate = row.assignment.date < today ? today : row.assignment.date;

  // Create the activity log entry (this also updates XP/streak)
  const { id: activityId } = await createActivity({
    childId: row.assignment.childId,
    subjectId: row.quest.subjectId,
    title: activityData.title ?? row.quest.title,
    description: activityData.description,
    durationMinutes: activityData.durationMinutes,
    date: chronicleDate,
    startedAt: activityData.startedAt,
    endedAt: activityData.endedAt,
    source: activityData.source,
  });

  // Link the activity to the assignment, and mirror the scribe's notes onto
  // the assignment itself so they surface in the learning log alongside
  // skip notes (learning-log-format reads assignment.notes, not the
  // activity log's description).
  const now = new Date();
  await db
    .update(schema.questAssignment)
    .set({
      status: "completed",
      activityLogId: activityId,
      completedAt: now,
      notes: notes || null,
      // Finishing settles whatever set the quest aside — a stuck quest a
      // grown-up came and helped with is no longer stuck for any reason.
      statusReason: null,
      updatedAt: now,
    })
    .where(eq(schema.questAssignment.id, assignmentId));

  // Also set the questAssignmentId on the activity log
  await db
    .update(schema.activityLog)
    .set({ questAssignmentId: assignmentId, updatedAt: now })
    .where(eq(schema.activityLog.id, activityId));

  // Grant quest rewards
  if (row.quest.rewardXp) {
    await db
      .update(schema.child)
      .set({
        bonusXp: sql`${schema.child.bonusXp} + ${row.quest.rewardXp}`,
        currentXp: sql`${schema.child.currentXp} + ${row.quest.rewardXp}`,
        updatedAt: now,
      })
      .where(eq(schema.child.id, row.assignment.childId));
  }

  if (row.quest.rewardAvatarItem) {
    const reward = JSON.parse(row.quest.rewardAvatarItem) as { category: string; itemId: string };
    await db
      .insert(schema.childAvatarUnlock)
      .values({
        id: nanoid(),
        childId: row.assignment.childId,
        category: reward.category,
        itemId: reward.itemId,
        source: "quest_reward",
        sourceQuestId: row.quest.id,
        unlockedAt: now,
      })
      .onConflictDoNothing();
  }

  return { activityId };
}

/**
 * Scribe's Notes written (or rewritten) after a quest is already done. Heroes
 * finish first and reflect later, so Today's Quests keeps an Add/Edit Notes
 * affordance on completed cards rather than making the completion form the
 * only chance to say what happened.
 *
 * The note is mirrored onto the linked activity log so Recent Adventures and
 * the learning log tell the same story — completeAssignment writes both, and
 * so must every later edit.
 */
export async function updateAssignmentNotes(assignmentId: string, notes: string) {
  await requireAssignmentAccess(assignmentId, { write: true });

  const rows = await db
    .select({
      status: schema.questAssignment.status,
      activityLogId: schema.questAssignment.activityLogId,
      requireNotes: schema.quest.requireNotes,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Assignment not found");
  if (row.status !== "completed") {
    throw new Error("Only a completed quest can be annotated.");
  }

  const note = notes ? sanitizeText(notes) : "";
  // Editing must not be a way to strip notes a quest insists on having.
  if (!note && row.requireNotes) {
    throw new Error("Scribe's Notes are required for this quest");
  }

  const now = new Date();
  await db
    .update(schema.questAssignment)
    .set({ notes: note || null, updatedAt: now })
    .where(eq(schema.questAssignment.id, assignmentId));

  if (row.activityLogId) {
    await db
      .update(schema.activityLog)
      .set({ description: note || null, updatedAt: now })
      .where(eq(schema.activityLog.id, row.activityLogId));
  }
}

/**
 * Setting a quest aside always has to say why, whoever does it and whichever
 * way they do it. A row that reads only "Skipped" tells a grown-up that
 * something happened and nothing about what to do next, and the alert built
 * from it is worse — so the reason is a hard requirement, not a family
 * setting: a reason that can be switched off is one that stops being written.
 *
 * It is kept apart from Scribe's Notes on purpose. Notes are the record of
 * work that was done and they feed the learning log; a reason for not doing
 * the work is a different claim and must never be filed as one.
 */
function requireStatusReason(reason: string | undefined, message: string): string {
  const cleaned = reason ? sanitizeText(reason) : "";
  if (!cleaned) throw new Error(message);
  return cleaned;
}

const SKIP_REASON_REQUIRED = "Say why this quest is being skipped.";
const STUCK_REASON_REQUIRED = "Say what's got you stuck, so a grown-up knows how to help.";

/**
 * Skipping a quest is a grown-up decision by default. A parent can hand it to
 * a hero one child at a time (child.skipQuestsEnabled) — and whenever a hero
 * uses it, the grown-ups get an in-app alert, so "allowed" never quietly means
 * "unnoticed".
 */
export async function skipAssignment(assignmentId: string, reason: string) {
  const { access } = await requireAssignmentAccess(assignmentId, { write: true });
  const isChild = isChildActor(access);
  if (isChild) {
    const rows = await db
      .select({
        enabled: schema.child.skipQuestsEnabled,
        childId: schema.questAssignment.childId,
        date: schema.questAssignment.date,
        questId: schema.questAssignment.questId,
      })
      .from(schema.questAssignment)
      .innerJoin(schema.child, eq(schema.questAssignment.childId, schema.child.id))
      .where(eq(schema.questAssignment.id, assignmentId))
      .limit(1);
    const row = rows[0];
    if (!row?.enabled) {
      throw new Error("Ask a parent — only they can skip a quest for you.");
    }
    // Skipping must not be a way around the queue either: a hero may only skip
    // the quest that's currently theirs to do.
    await assertQuestUnlockedInStructuredMode(row.childId, row.date, row.questId, true);
  }

  const statusReason = requireStatusReason(reason, SKIP_REASON_REQUIRED);
  const now = new Date();
  // `notes` is left alone: skipping produces no work to describe, and the
  // reason belongs in its own column rather than overwriting a record of work.
  await db
    .update(schema.questAssignment)
    .set({
      status: "skipped",
      statusReason,
      updatedAt: now,
    })
    .where(eq(schema.questAssignment.id, assignmentId));

  if (isChild) {
    await recordQuestAlert(assignmentId, "quest_skipped", statusReason);
  }
}

/**
 * "I'm stuck." A hero who genuinely cannot finish something still has to be
 * able to move on — in structured mode the next quest stays locked until this
 * one is resolved, so without an escape hatch a hard problem stops the whole
 * day. Unlike skipping, this needs no parent permission (a hero must never be
 * trapped) and it always raises an alert, so a grown-up knows to come and help.
 *
 * It is not a free pass: the quest is not completed, no XP or reward is
 * granted, it stays out of the learning log, and the grown-ups can reopen it.
 */
export async function markAssignmentStuck(assignmentId: string, reason: string) {
  const { access } = await requireAssignmentAccess(assignmentId, { write: true });
  const isChild = isChildActor(access);

  const rows = await db
    .select({
      status: schema.questAssignment.status,
      childId: schema.questAssignment.childId,
      date: schema.questAssignment.date,
      questId: schema.questAssignment.questId,
    })
    .from(schema.questAssignment)
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Assignment not found");
  if (row.status === "stuck") return;
  if (row.status === "completed") {
    throw new Error("This quest is already complete.");
  }

  // Getting stuck must not become a way around the queue either: a hero may
  // only set aside the quest that's currently theirs to do.
  if (isChild) {
    await assertQuestUnlockedInStructuredMode(row.childId, row.date, row.questId, true);
  }

  const statusReason = requireStatusReason(reason, STUCK_REASON_REQUIRED);
  const now = new Date();
  await db
    .update(schema.questAssignment)
    .set({ status: "stuck", statusReason, updatedAt: now })
    .where(eq(schema.questAssignment.id, assignmentId));

  // An adult marking it stuck is the person the alert would be for, so only a
  // hero's own "I'm stuck" raises one.
  if (isChild) {
    await recordQuestAlert(assignmentId, "quest_stuck", statusReason);
  }
}

/**
 * Grown-ups correcting the record. A hero marks something done that wasn't —
 * a mis-tap, or wishful thinking — and a parent needs to put it back: either
 * to `skipped` ("we're not doing this one today") or to `pending` ("go and
 * actually do it"). It also un-skips and un-sticks, so nothing a hero does to
 * their own day is one-way.
 *
 * Undoing a completion has to undo everything the completion granted, or
 * marking work done that wasn't still pays: the chronicled activity goes
 * (which recomputes XP and the streak from what's left), the quest's bonus XP
 * comes back off, and an avatar item this quest unlocked is revoked unless
 * another completion of the same quest still stands.
 */
export async function reviseAssignment(
  assignmentId: string,
  next: "pending" | "skipped",
  reason?: string
) {
  const { access } = await requireAssignmentAccess(assignmentId, { write: true });
  if (isChildActor(access)) {
    throw new Error("Ask a grown-up — only they can change a finished quest.");
  }

  const rows = await db
    .select({
      assignment: schema.questAssignment,
      quest: schema.quest,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Assignment not found");

  // Revising *to* skipped is a skip, so it owes a reason like any other. Going
  // back to pending owes nothing — the quest is simply on the list again — and
  // any reason it carried is no longer true of it.
  const statusReason =
    next === "skipped" ? requireStatusReason(reason, SKIP_REASON_REQUIRED) : null;

  const now = new Date();

  if (row.assignment.status === "completed") {
    await reverseCompletionRewards(row.assignment, row.quest, assignmentId);
  }

  await db
    .update(schema.questAssignment)
    .set({
      status: next,
      // The old notes described work that is no longer on the record.
      notes: null,
      statusReason,
      activityLogId: null,
      completedAt: null,
      updatedAt: now,
    })
    .where(eq(schema.questAssignment.id, assignmentId));
}

/**
 * Hands back everything completing this assignment granted. Order matters:
 * the bonus XP comes off first, because deleting the activity recomputes
 * `currentXp` as (activity count x 10) + bonusXp and would otherwise fold the
 * stale bonus straight back in.
 */
async function reverseCompletionRewards(
  assignment: typeof schema.questAssignment.$inferSelect,
  quest: typeof schema.quest.$inferSelect,
  assignmentId: string
) {
  const now = new Date();

  if (quest.rewardXp) {
    await db
      .update(schema.child)
      .set({
        // max(0, ...) so a reward granted before the quest's XP was edited
        // downward can't drive the totals negative.
        bonusXp: sql`max(0, ${schema.child.bonusXp} - ${quest.rewardXp})`,
        currentXp: sql`max(0, ${schema.child.currentXp} - ${quest.rewardXp})`,
        updatedAt: now,
      })
      .where(eq(schema.child.id, assignment.childId));
  }

  if (quest.rewardAvatarItem) {
    // A recurring quest grants its item once and re-completes harmlessly, so
    // only take it back when no other completion of this quest still stands.
    const others = await db
      .select({ id: schema.questAssignment.id })
      .from(schema.questAssignment)
      .where(
        and(
          eq(schema.questAssignment.questId, quest.id),
          eq(schema.questAssignment.childId, assignment.childId),
          eq(schema.questAssignment.status, "completed"),
          ne(schema.questAssignment.id, assignmentId)
        )
      )
      .limit(1);

    if (others.length === 0) {
      const reward = JSON.parse(quest.rewardAvatarItem) as { category: string; itemId: string };
      await db
        .delete(schema.childAvatarUnlock)
        .where(
          and(
            eq(schema.childAvatarUnlock.childId, assignment.childId),
            eq(schema.childAvatarUnlock.category, reward.category),
            eq(schema.childAvatarUnlock.itemId, reward.itemId),
            eq(schema.childAvatarUnlock.sourceQuestId, quest.id)
          )
        );
    }
  }

  // Last, because this recomputes XP and the streak from whatever activities
  // remain — and it clears the assignment's activityLogId via the FK.
  if (assignment.activityLogId) {
    await deleteActivity(assignment.activityLogId);
  }
}

/** Parent-only: hand a hero the ability to skip their own quests, or take it back. */
export async function setSkipQuestsEnabled(childId: string, enabled: boolean) {
  const { access, familyId } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) {
    throw new Error("Only a parent can change who may skip quests.");
  }
  await db
    .update(schema.child)
    .set({ skipQuestsEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId)));
}

export async function deleteAssignment(assignmentId: string) {
  await requireAssignmentAccess(assignmentId, { write: true });
  await db
    .delete(schema.questAssignment)
    .where(eq(schema.questAssignment.id, assignmentId));
}

/** Fetch completed assignments that had quest rewards attached, one card per quest */
export async function getEarnedQuestRewards(childId: string, limit = 10) {
  await requireChildAccess(childId);
  const hasReward = sql`(${schema.quest.rewardXp} IS NOT NULL OR ${schema.quest.rewardDescription} IS NOT NULL OR ${schema.quest.rewardAvatarItem} IS NOT NULL)`;

  const rows = await db
    .select({
      assignmentId: schema.questAssignment.id,
      questId: schema.questAssignment.questId,
      completedAt: schema.questAssignment.completedAt,
      questTitle: schema.quest.title,
      rewardXp: schema.quest.rewardXp,
      rewardDescription: schema.quest.rewardDescription,
      rewardAvatarItem: schema.quest.rewardAvatarItem,
    })
    .from(schema.questAssignment)
    .innerJoin(schema.quest, eq(schema.questAssignment.questId, schema.quest.id))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.status, "completed"),
        hasReward,
      )
    )
    .orderBy(desc(schema.questAssignment.completedAt));

  // A recurring quest can rack up many completed assignments; only show its
  // most recent completion so the same reward doesn't appear multiple times.
  const seenQuestIds = new Set<string>();
  const deduped: typeof rows = [];
  for (const row of rows) {
    if (seenQuestIds.has(row.questId)) continue;
    seenQuestIds.add(row.questId);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
