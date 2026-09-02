"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { UpkeepTaskForm } from "@/components/upkeep-task-form";
import { deleteUpkeepTask } from "@/lib/actions/upkeep-tasks";
import { formatWagesAsDollars } from "@/lib/utils/wages";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  valueCents: number | null;
  isRequired: boolean;
  rewardXp: number | null;
};

export function UpkeepTaskList({
  childId,
  tasks,
}: {
  childId: string;
  tasks: TaskRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      await deleteUpkeepTask(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && !editing && (
        <Button onClick={() => setCreating(true)}>Add a task</Button>
      )}

      {(creating || editing) && (
        <GameFrame>
          <UpkeepTaskForm
            childId={childId}
            task={editing}
            onDone={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </GameFrame>
      )}

      {tasks.length === 0 && !creating && (
        <p className="text-muted-foreground">No tasks yet.</p>
      )}

      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="min-w-0">
            <h3 className="font-medium">{task.title}</h3>
            {task.description && (
              <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {task.valueCents == null ? "Unpaid" : formatWagesAsDollars(task.valueCents)}
              {!task.isRequired && " · Optional"}
              {task.rewardXp ? ` · +${task.rewardXp} XP` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(task)}>
              Edit
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => remove(task.id)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
