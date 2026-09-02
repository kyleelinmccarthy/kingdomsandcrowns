"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GameIcon } from "@/components/game-icon";
import { formatWagesAsCoin, formatWagesAsDollars } from "@/lib/utils/wages";
import { deriveUpkeepStatus, type UpkeepStatus } from "@/lib/utils/upkeep-status";
import {
  approveUpkeep,
  excuseUpkeep,
  markUpkeepDone,
  rejectUpkeep,
  uncompleteUpkeep,
} from "@/lib/actions/upkeep-assignments";

export type UpkeepCardData = {
  assignment: {
    id: string;
    status: UpkeepStatus;
    date: string;
    notes: string | null;
    /** Why it was excused, or why a grown-up sent it back. */
    statusReason: string | null;
  };
  task: {
    id: string;
    title: string;
    description: string | null;
    valueCents: number | null;
    isRequired: boolean;
    rewardXp: number | null;
  };
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  completed: "Done",
  excused: "Excused",
  missed: "Missed",
};

export function UpkeepTaskCard({
  data,
  isChildView,
  today,
}: {
  data: UpkeepCardData;
  isChildView: boolean;
  /** Passed in rather than read from the clock so the card renders the same on server and client. */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  const { assignment, task } = data;
  const status = deriveUpkeepStatus(assignment, task, today);

  // Heroes are paid in coin, grown-ups in the money they actually hand over.
  const wages =
    task.valueCents == null
      ? null
      : isChildView
        ? formatWagesAsCoin(task.valueCents)
        : formatWagesAsDollars(task.valueCents);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      setShowReason(false);
      setReason("");
      router.refresh();
    });
  }

  const isOpen = status === "pending" || status === "missed";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{task.title}</h3>
          {task.description && (
            <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {!task.isRequired && (
              <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                Optional
              </span>
            )}
            {STATUS_LABELS[status] && (
              <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                {STATUS_LABELS[status]}
              </span>
            )}
            {task.rewardXp ? <span className="text-muted-foreground">+{task.rewardXp} XP</span> : null}
          </div>
          {assignment.statusReason && (
            <p className="mt-2 text-sm text-muted-foreground">{assignment.statusReason}</p>
          )}
        </div>

        {wages && (
          <span className="flex shrink-0 items-center gap-1 font-medium text-[var(--gold-bright)]">
            <GameIcon name="gem" className="size-4" />
            {wages}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {isOpen && (
          <Button size="sm" disabled={pending} onClick={() => run(() => markUpkeepDone(assignment.id))}>
            Mark done
          </Button>
        )}

        {!isChildView && status === "awaiting_approval" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => approveUpkeep(assignment.id))}>
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowReason(true)}>
              Send back
            </Button>
          </>
        )}

        {!isChildView && isOpen && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowReason(true)}>
            Excuse
          </Button>
        )}

        {!isChildView && status === "completed" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => uncompleteUpkeep(assignment.id))}
          >
            Undo
          </Button>
        )}
      </div>

      {showReason && (
        <div className="mt-3 flex gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            aria-label="Reason"
          />
          <Button
            size="sm"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(() =>
                status === "awaiting_approval"
                  ? rejectUpkeep(assignment.id, reason)
                  : excuseUpkeep(assignment.id, reason)
              )
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
