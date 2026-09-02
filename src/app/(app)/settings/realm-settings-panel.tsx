"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateRealmSettings } from "@/lib/actions/realm-settings";
import { grantRealmMinutes } from "@/lib/actions/realm-play";
import { localDateOf } from "@/lib/utils/schedule-days";
import {
  DAILY_CAP_RANGE,
  EARNED_MINUTES_RANGE,
  type RealmSettings,
} from "@/lib/utils/realm-settings";
import type { RealmAccessMode } from "@/lib/utils/realm-access";

const MODES: { id: RealmAccessMode; label: string; hint: string }[] = [
  { id: "earned", label: "Earned", hint: "Each finished quest banks minutes." },
  { id: "scheduled", label: "Scheduled", hint: "Recess blocks on the schedule open the Realm." },
  { id: "both", label: "Both", hint: "Either one opens the Realm." },
];

export function RealmSettingsPanel({
  childId,
  settings,
  summary,
}: {
  childId: string;
  settings: RealmSettings;
  summary: { date: string; balance: number; spent: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [perQuest, setPerQuest] = useState(String(settings.earnedMinutesPerQuest));
  const [cap, setCap] = useState(String(settings.dailyCapMinutes));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  const save = (patch: Partial<RealmSettings>) => run(() => updateRealmSettings(childId, patch));
  const usesEarned = settings.accessMode === "earned" || settings.accessMode === "both";

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">The Realm</h4>
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.enabled ? "The Realm is open to this hero." : "The Realm is closed to this hero."}</p>
          <p className="text-xs text-muted-foreground">The 3D world where quests become deeds and seasons earn crowns.</p>
        </div>
        <Switch aria-label="Realm enabled" checked={settings.enabled} disabled={busy} onCheckedChange={() => save({ enabled: !settings.enabled })} />
      </div>

      <fieldset className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How play time opens</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`realm-mode-${childId}`}
                value={m.id}
                checked={settings.accessMode === m.id}
                disabled={busy}
                onChange={() => save({ accessMode: m.id })}
                aria-label={m.label}
              />
              <span>
                <span className="font-medium">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {usesEarned && (
          <div className="mt-3 flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`per-quest-${childId}`}>Minutes per quest</Label>
              <Input
                id={`per-quest-${childId}`}
                type="number"
                min={EARNED_MINUTES_RANGE.min}
                max={EARNED_MINUTES_RANGE.max}
                value={perQuest}
                onChange={(e) => setPerQuest(e.target.value)}
                className="w-24"
              />
            </div>
            <Button size="sm" variant="outline" disabled={busy || perQuest === String(settings.earnedMinutesPerQuest)} onClick={() => save({ earnedMinutesPerQuest: parseInt(perQuest, 10) })}>
              Save
            </Button>
            <p className="pb-2 text-xs text-muted-foreground">Minutes earned stay earned.</p>
          </div>
        )}
      </fieldset>

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.offHoursEnabled ? "Open outside school hours." : "School hours only."}</p>
          <p className="text-xs text-muted-foreground">Before the first class, after the last, and on days off. The daily cap still applies.</p>
        </div>
        <Switch aria-label="Off-hours play" checked={settings.offHoursEnabled} disabled={busy} onCheckedChange={() => save({ offHoursEnabled: !settings.offHoursEnabled })} />
      </div>

      <div className="flex items-end gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div className="space-y-1">
          <Label htmlFor={`cap-${childId}`}>Daily cap (minutes)</Label>
          <Input id={`cap-${childId}`} type="number" min={DAILY_CAP_RANGE.min} max={DAILY_CAP_RANGE.max} value={cap} onChange={(e) => setCap(e.target.value)} className="w-24" />
        </div>
        <Button size="sm" variant="outline" disabled={busy || cap === String(settings.dailyCapMinutes)} onClick={() => save({ dailyCapMinutes: parseInt(cap, 10) })}>
          Save
        </Button>
        <p className="pb-2 text-xs text-muted-foreground">Screen time in the Realm never passes this, whatever opens it.</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.toneMode === "gentle" ? "Gentle: fog, shadows, and statues to clear." : "Monsters: cartoon slimes and skeletons."}</p>
          <p className="text-xs text-muted-foreground">Nothing bleeds either way, and a hero never dies — they lose focus and try again.</p>
        </div>
        <Button size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => save({ toneMode: settings.toneMode === "gentle" ? "monsters" : "gentle" })}>
          {settings.toneMode === "gentle" ? "Allow Monsters" : "Keep It Gentle"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{summary.balance} minutes banked today</p>
          <p className="text-xs text-muted-foreground">{summary.spent} of {settings.dailyCapMinutes} played</p>
        </div>
        <div className="flex gap-2">
          {[15, 30].map((m) => (
            <Button key={m} size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => run(() => grantRealmMinutes(childId, localDateOf(new Date()), m))}>
              Grant {m}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
