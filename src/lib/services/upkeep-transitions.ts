import { nanoid } from "nanoid";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sumCents } from "@/lib/utils/wages";
import {
  resolveUpkeepTransition,
  type UpkeepStatus,
} from "@/lib/utils/upkeep-status";

/**
 * The single path any upkeep status change takes, and therefore the single
 * place wages or XP can move.
 *
 * resolveUpkeepTransition decides whether anything is owed; this function only
 * carries it out. That split is what makes double-paying testable without a
 * database — re-approving an already-completed task resolves to "do nothing"
 * before a query is ever issued.
 *
 * Plain module, not an action file: callers have already authorized the row.
 */
export async function applyUpkeepTransition(params: {
  assignmentId: string;
  next: UpkeepStatus;
  actorUserId: string;
  notes?: string | null;
  statusReason?: string | null;
}): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    // Read the row, the previous status, and what's already posted INSIDE the
    // transaction, using the tx handle — reading these before the transaction
    // opened left a window where two near-simultaneous calls (a double-tap, a
    // client retry) could both observe the same `prev` and `netPosted` and
    // both credit wages. Reading them here doesn't remove that window by
    // itself; the compare-and-swap update below is what closes it.
    const rows = await tx
      .select({
        assignment: schema.upkeepTaskAssignment,
        task: schema.upkeepTask,
      })
      .from(schema.upkeepTaskAssignment)
      .innerJoin(
        schema.upkeepTask,
        eq(schema.upkeepTaskAssignment.taskId, schema.upkeepTask.id)
      )
      .where(eq(schema.upkeepTaskAssignment.id, params.assignmentId))
      .limit(1);

    const row = rows[0];
    if (!row) throw new Error("Upkeep assignment not found.");

    const prev = row.assignment.status as UpkeepStatus;
    const credit = resolveUpkeepTransition(prev, params.next);

    // Ledger rows already posted against this assignment. Their net is 0 when
    // nothing is currently owed for it — which is both the double-pay guard and
    // the amount a reversal has to undo.
    const existingEntries = await tx
      .select({ amountCents: schema.wageLedgerEntry.amountCents })
      .from(schema.wageLedgerEntry)
      .where(eq(schema.wageLedgerEntry.taskAssignmentId, params.assignmentId));
    const netPosted = sumCents(existingEntries);

    const updates: Record<string, unknown> = {
      status: params.next,
      updatedAt: now,
    };
    if (params.notes !== undefined) updates.notes = params.notes;
    if (params.statusReason !== undefined) updates.statusReason = params.statusReason;

    if (params.next === "completed") {
      updates.completedAt = row.assignment.completedAt ?? now;
      updates.completedByUserId = row.assignment.completedByUserId ?? params.actorUserId;
      updates.approvedAt = now;
      updates.approvedByUserId = params.actorUserId;
    } else if (params.next === "awaiting_approval") {
      updates.completedAt = now;
      updates.completedByUserId = params.actorUserId;
    } else if (params.next === "pending") {
      // Sent back — clear the claim so the row reads as genuinely undone.
      updates.completedAt = null;
      updates.completedByUserId = null;
      updates.approvedAt = null;
      updates.approvedByUserId = null;
    }

    // Compare-and-swap: only move the row if its status still matches what we
    // just read `prev` from. Two racing calls both read `prev="pending"` and
    // both compute the same `credit`, but only one of these UPDATEs can match
    // a row still at status = prev — the loser's WHERE clause matches nothing.
    const moved = await tx
      .update(schema.upkeepTaskAssignment)
      .set(updates)
      .where(
        and(
          eq(schema.upkeepTaskAssignment.id, params.assignmentId),
          eq(schema.upkeepTaskAssignment.status, prev)
        )
      )
      .returning({ id: schema.upkeepTaskAssignment.id });

    if (moved.length === 0) {
      // Another request already moved this assignment out of `prev` — a lost
      // double-tap race, not an error. No ledger row, no XP; the winner
      // already did (or will do) the crediting.
      return;
    }

    // Wages. A task with no value posts nothing, but still grants XP below.
    if (credit.postWages && row.task.valueCents && netPosted === 0) {
      await tx.insert(schema.wageLedgerEntry).values({
        id: nanoid(),
        childId: row.assignment.childId,
        type: "earned",
        amountCents: row.task.valueCents,
        taskAssignmentId: params.assignmentId,
        taskTitle: row.task.title,
        date: row.assignment.date,
        createdByUserId: params.actorUserId,
        createdAt: now,
      });
    }

    if (credit.reverseWages && netPosted !== 0) {
      await tx.insert(schema.wageLedgerEntry).values({
        id: nanoid(),
        childId: row.assignment.childId,
        type: "reversal",
        amountCents: -netPosted,
        taskAssignmentId: params.assignmentId,
        taskTitle: row.task.title,
        date: row.assignment.date,
        note: "Task marked not done",
        createdByUserId: params.actorUserId,
        createdAt: now,
      });
    }

    // XP. upkeepXp only — never currentXp, which activities.ts recomputes.
    if (row.task.rewardXp) {
      if (credit.grantXp) {
        await tx
          .update(schema.child)
          .set({
            upkeepXp: sql`${schema.child.upkeepXp} + ${row.task.rewardXp}`,
            updatedAt: now,
          })
          .where(eq(schema.child.id, row.assignment.childId));
      } else if (credit.revokeXp) {
        await tx
          .update(schema.child)
          .set({
            upkeepXp: sql`max(0, ${schema.child.upkeepXp} - ${row.task.rewardXp})`,
            updatedAt: now,
          })
          .where(eq(schema.child.id, row.assignment.childId));
      }
    }
  });
}
