"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import {
  setChildUpkeepApproval,
  setChildUpkeepEnabled,
} from "@/lib/actions/upkeep-settings";
import { describeApprovalInheritance } from "@/lib/utils/upkeep-approval";

/** The three states of the confirmation control, as the <select> carries them. */
type ApprovalChoice = "inherit" | "always" | "never";

function toChoice(value: boolean | null): ApprovalChoice {
  if (value === null) return "inherit";
  return value ? "always" : "never";
}

function fromChoice(choice: ApprovalChoice): boolean | null {
  if (choice === "inherit") return null;
  return choice === "always";
}

export function ChildUpkeepToggle({
  childId,
  enabled: initialEnabled,
  /** True when the family switch is off — the per-hero choice has no effect then. */
  familyDisabled,
  /** This hero's override as stored; null means inherit. */
  requiresApproval: initialRequiresApproval,
  /** The family default, so "Inherit" can say what it currently resolves to. */
  familyRequiresApproval,
}: {
  childId: string;
  enabled: boolean;
  familyDisabled: boolean;
  requiresApproval: boolean | null;
  familyRequiresApproval: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [choice, setChoice] = useState<ApprovalChoice>(toChoice(initialRequiresApproval));

  if (familyDisabled) return null;

  return (
    <div className="space-y-3">
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

      {/* A confirmation setting is meaningless for a hero with no chores. */}
      {enabled && (
        <div className="space-y-1">
          <label
            htmlFor={`upkeep-approval-${childId}`}
            className="text-sm font-medium"
          >
            Confirmation
          </label>
          <p className="text-xs text-muted-foreground">
            Whether this hero&apos;s finished chores wait for a grown-up before
            wages are earned.
          </p>
          <Select
            id={`upkeep-approval-${childId}`}
            value={choice}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value as ApprovalChoice;
              startTransition(async () => {
                await setChildUpkeepApproval(childId, fromChoice(next));
                setChoice(next);
                router.refresh();
              });
            }}
          >
            <option value="inherit">
              Follow the family setting — {describeApprovalInheritance(familyRequiresApproval)}
            </option>
            <option value="always">Always confirm</option>
            <option value="never">Never confirm</option>
          </Select>
        </div>
      )}
    </div>
  );
}
