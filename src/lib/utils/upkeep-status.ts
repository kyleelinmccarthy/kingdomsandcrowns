/**
 * The status vocabulary for upkeep tasks, and the two rules that everything
 * else in the module defers to.
 *
 * There is deliberately no child-facing "skipped": a quest has skip/stuck
 * because a hero needs to say "I couldn't do this schoolwork, and here's why",
 * but an undone chore is simply undone. "excused" is the parent's counterpart
 * ("we were travelling") and is the only way to retire a task without claiming
 * the work happened.
 */

export type UpkeepStatus =
  | "pending"
  | "awaiting_approval"
  | "completed"
  | "excused";

/** A stored status, plus "missed" — which is computed, never written down. */
export type DerivedUpkeepStatus = UpkeepStatus | "missed";

/** What a status change owes the child, decided in one place. */
export type UpkeepCredit = {
  postWages: boolean;
  reverseWages: boolean;
  grantXp: boolean;
  revokeXp: boolean;
};

export type UpkeepDaySummary = {
  total: number;
  done: number;
  awaitingApproval: number;
  missed: number;
};

/**
 * "Missed" is derived rather than stored: a required task whose day has passed
 * while still pending. Keeping it computed means no nightly sweep, no extra
 * status, and no state that can drift out of sync with the calendar.
 *
 * Optional tasks are never missed — that is the whole of what optional means.
 */
export function deriveUpkeepStatus(
  assignment: { status: UpkeepStatus; date: string },
  task: { isRequired: boolean },
  today: string
): DerivedUpkeepStatus {
  if (
    assignment.status === "pending" &&
    task.isRequired &&
    assignment.date < today
  ) {
    return "missed";
  }
  return assignment.status;
}

/**
 * The single guard against double-paying. Wages and XP move only when a task
 * crosses into or out of `completed`; every other transition is inert, so
 * re-approving, re-saving, or a duplicated request costs nothing.
 */
export function resolveUpkeepTransition(
  prev: UpkeepStatus,
  next: UpkeepStatus
): UpkeepCredit {
  const becameComplete = prev !== "completed" && next === "completed";
  const stoppedBeingComplete = prev === "completed" && next !== "completed";

  return {
    postWages: becameComplete,
    grantXp: becameComplete,
    reverseWages: stoppedBeingComplete,
    revokeXp: stoppedBeingComplete,
  };
}

/** Counts for the parent's at-a-glance header. */
export function summarizeUpkeepDay(
  rows: {
    assignment: { status: UpkeepStatus; date: string };
    task: { isRequired: boolean };
  }[],
  today: string
): UpkeepDaySummary {
  const summary: UpkeepDaySummary = {
    total: rows.length,
    done: 0,
    awaitingApproval: 0,
    missed: 0,
  };

  for (const row of rows) {
    const status = deriveUpkeepStatus(row.assignment, row.task, today);
    if (status === "completed") summary.done++;
    else if (status === "awaiting_approval") summary.awaitingApproval++;
    else if (status === "missed") summary.missed++;
  }

  return summary;
}
