"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import {
  setFamilyUpkeepEnabled,
  setFamilyUpkeepRequiresApproval,
} from "@/lib/actions/upkeep-settings";

export function UpkeepSettingsPanel({
  enabled: initialEnabled,
  requiresApproval: initialRequiresApproval,
}: {
  enabled: boolean;
  requiresApproval: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [requiresApproval, setRequiresApproval] = useState(initialRequiresApproval);

  function toggleEnabled() {
    const next = !enabled;
    startTransition(async () => {
      await setFamilyUpkeepEnabled(next);
      setEnabled(next);
      router.refresh();
    });
  }

  function toggleApproval() {
    const next = !requiresApproval;
    startTransition(async () => {
      await setFamilyUpkeepRequiresApproval(next);
      setRequiresApproval(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Upkeep</p>
          <p className="text-sm text-muted-foreground">
            Track chores alongside school. Tasks can be worth wages, repeat on a
            schedule, and be required or merely welcome.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggleEnabled}
          disabled={pending}
          aria-label="Enable Upkeep"
        />
      </div>

      {enabled && (
        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="font-medium">Approve completed tasks</p>
            <p className="text-sm text-muted-foreground">
              When on, a hero marking a task done waits for a grown-up before any
              wages are earned.
            </p>
          </div>
          <Switch
            checked={requiresApproval}
            onCheckedChange={toggleApproval}
            disabled={pending}
            aria-label="Require approval for completed tasks"
          />
        </div>
      )}
    </div>
  );
}
