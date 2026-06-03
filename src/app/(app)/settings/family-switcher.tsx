"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type FamilyOption = {
  id: string;
  familyName: string;
  role: string;
  isOwner: boolean;
};

export function FamilySwitcher({
  families,
  activeFamilyId,
}: {
  families: FamilyOption[];
  activeFamilyId: string;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  if (families.length <= 1) return null;

  async function handleSwitch(familyId: string) {
    if (familyId === activeFamilyId) return;
    setSwitching(true);
    try {
      await fetch("/api/family/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId }),
      });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="familySwitch" className="shrink-0 text-xs text-muted-foreground">
        Viewing
      </Label>
      <Select
        id="familySwitch"
        value={activeFamilyId}
        disabled={switching}
        onChange={(e) => handleSwitch(e.target.value)}
        className="h-7 w-auto"
      >
        {families.map((f) => (
          <option key={f.id} value={f.id}>
            {f.familyName}
            {!f.isOwner ? ` (${f.role.replace("_", " ")})` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
