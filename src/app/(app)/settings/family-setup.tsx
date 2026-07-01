"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFrame } from "@/components/game-frame";
import { createFamily, updateFamily } from "@/lib/actions/family";
import { GameIcon } from "@/components/game-icon";

type Family = {
  id: string;
  familyName: string;
  timezone: string;
} | null;

export function FamilySetup({ family, isChildView = false }: { family: Family; isChildView?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(family?.familyName ?? "");
  const [timezone, setTimezone] = useState(family?.timezone ?? "America/Denver");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (family) {
        await updateFamily(name, timezone);
      } else {
        await createFamily(name, timezone);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GameFrame title={family ? "Family Crest" : "Found Your Family"} icon={<GameIcon name="scroll" className="size-4 text-[var(--gold-bright)]" />}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="familyName">Family Name</Label>
          <Input
            id="familyName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Smiths"
            required
            disabled={isChildView}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Realm Timezone</Label>
          <Input
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/Denver"
            disabled={isChildView}
          />
        </div>
        {!isChildView && (
          <Button type="submit" disabled={saving}>
            {saving ? "Enchanting..." : family ? "Save Changes" : "Establish Family"}
          </Button>
        )}
      </form>
    </GameFrame>
  );
}
