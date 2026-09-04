"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { isRecognizedTimeZone, timezoneOptions } from "@/lib/utils/timezone-options";

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
          <Select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={isChildView}
          >
            {timezoneOptions(timezone).map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {timezone && !isRecognizedTimeZone(timezone) ? (
            <p className="text-xs text-destructive">
              &ldquo;{timezone}&rdquo; isn&apos;t a timezone we recognize, so days are
              falling back to America/Denver. Choose one below to fix it.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Governs which day quests, chores and streaks belong to.
            </p>
          )}
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
