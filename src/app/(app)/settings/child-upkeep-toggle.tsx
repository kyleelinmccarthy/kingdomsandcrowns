"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setChildUpkeepEnabled } from "@/lib/actions/upkeep-settings";

export function ChildUpkeepToggle({
  childId,
  enabled: initialEnabled,
  /** True when the family switch is off — the per-hero choice has no effect then. */
  familyDisabled,
}: {
  childId: string;
  enabled: boolean;
  familyDisabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);

  if (familyDisabled) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Upkeep</p>
        <p className="text-xs text-muted-foreground">
          Whether this hero has chores of their own.
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={() => {
          const next = !enabled;
          startTransition(async () => {
            await setChildUpkeepEnabled(childId, next);
            setEnabled(next);
            router.refresh();
          });
        }}
        disabled={pending}
        aria-label="Upkeep for this hero"
      />
    </div>
  );
}
