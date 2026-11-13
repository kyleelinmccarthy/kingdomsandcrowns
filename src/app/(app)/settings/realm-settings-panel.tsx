"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateRealmSettings, resetRealmHelp } from "@/lib/actions/realm-settings";
import { grantRealmMinutes } from "@/lib/actions/realm-play";
import {
  ALLOWANCE_RANGE,
  BANK_CAP_RANGE,
  DAILY_CAP_RANGE,
  EARNED_MINUTES_RANGE,
  MINUTES_PER_STAR_RANGE,
  SIDE_QUEST_LENGTH_RANGE,
  SIDE_QUEST_PAY_CAP_RANGE,
  TROUBLE_BONUS_RANGE,
  type RealmSettings,
  type RealmSettingsPatch,
} from "@/lib/utils/realm-settings";
import { HANDS_ON_KINDS, type HandsOnKind } from "@/lib/tasks/kinds";
import { modeEarns, type RealmAccessMode } from "@/lib/utils/realm-access";
import { DEPTH_OVERRIDES, type DepthOverride } from "@/lib/realm/depth";

/* Each radio's accessible name is its one-word label (the surrounding <label> would
   otherwise fold the hint into the name); the hint reaches a screen reader through
   aria-describedby, so a parent hears "Simple ... Fewer numbers, one thing at a time."
   rather than "Simple" with no explanation at all. */
const MODES: { id: RealmAccessMode; label: string; hint: string }[] = [
  { id: "earned", label: "Earned", hint: "Each finished quest banks minutes." },
  { id: "scheduled", label: "Scheduled", hint: "Recess blocks on the schedule open the Realm." },
  { id: "both", label: "Both", hint: "Either one opens the Realm." },
  { id: "open", label: "Open", hint: "Always available, no minutes needed. The daily cap still applies." },
];

const OFF_HINT = "0 turns this off.";

/**
 * The parent's words for the complexity axis. "depth" is a code word — it never reaches a screen,
 * here or in the Realm (§2 D7.3). Keyed by DepthOverride, so a fourth override fails the build.
 */
const DEPTH_LABELS: Record<DepthOverride, { label: string; hint: string }> = {
  auto: { label: "Automatic", hint: "Simple at first, everything once they know the world." },
  simple: { label: "Simple", hint: "Fewer numbers, one thing at a time." },
  full: { label: "Everything", hint: "More numbers, more to do." },
};

/**
 * The parent's words for each hands-on way of playing a side quest. Keyed by HandsOnKind, so a
 * new kind fails the build until it has a row here.
 */
const MECHANIC_LABELS: Record<HandsOnKind, { label: string; hint: string }> = {
  measure: { label: "Building by measuring", hint: "Math side quests are played at the bench." },
};

/** One saved number: edits stay local until Save, which sends only this field (the Earning time group). */
function NumberSetting({
  id,
  label,
  range,
  saved,
  hint,
  busy,
  onSave,
}: {
  id: string;
  label: string;
  range: { min: number; max: number };
  saved: number;
  hint: string;
  busy: boolean;
  onSave: (value: number) => void;
}) {
  const [value, setValue] = useState(String(saved));
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} type="number" min={range.min} max={range.max} value={value} onChange={(e) => setValue(e.target.value)} className="w-24" />
      </div>
      <Button size="sm" variant="outline" disabled={busy || value === String(saved)} onClick={() => onSave(parseInt(value, 10))}>
        Save
      </Button>
      <p className="pb-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function RealmSettingsPanel({
  childId,
  settings,
  summary,
}: {
  childId: string;
  settings: RealmSettings;
  summary: { date: string; balance: number; spent: number; bonus?: number; allowance?: number; carried?: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cap, setCap] = useState(String(settings.dailyCapMinutes));
  const [bountyCap, setBountyCap] = useState(String(settings.troubleBonusCapMinutes));
  const [questLength, setQuestLength] = useState(String(settings.sideQuestLength));

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

  const save = (patch: RealmSettingsPatch) => run(() => updateRealmSettings(childId, patch));
  const usesEarned = modeEarns(settings.accessMode);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">The Realm</h4>
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{settings.enabled ? "The Realm is open to this hero." : "The Realm is closed to this hero."}</p>
          <p className="text-xs text-muted-foreground">The 3D world where side quests build a kingdom and seasons earn crowns.</p>
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
                aria-describedby={`realm-mode-hint-${childId}-${m.id}`}
              />
              <span>
                <span className="font-medium">{m.label}</span>
                <span id={`realm-mode-hint-${childId}-${m.id}`} className="block text-xs text-muted-foreground">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {usesEarned && (
          <div className="mt-3 flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`bounty-${childId}`}>Minutes a day from clearing troubles</Label>
              <Input
                id={`bounty-${childId}`}
                type="number"
                min={TROUBLE_BONUS_RANGE.min}
                max={TROUBLE_BONUS_RANGE.max}
                value={bountyCap}
                onChange={(e) => setBountyCap(e.target.value)}
                className="w-24"
              />
            </div>
            <Button size="sm" variant="outline" disabled={busy || bountyCap === String(settings.troubleBonusCapMinutes)} onClick={() => save({ troubleBonusCapMinutes: parseInt(bountyCap, 10) })}>
              Save
            </Button>
            <p className="pb-2 text-xs text-muted-foreground">One minute per trouble cleared, never more than the day&apos;s quests earned. 0 turns it off.</p>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earning time</legend>
        {usesEarned ? (
          <>
            <NumberSetting
              id={`per-quest-${childId}`}
              label="Minutes per quest"
              range={EARNED_MINUTES_RANGE}
              saved={settings.earnedMinutesPerQuest}
              hint="Minutes earned stay earned."
              busy={busy}
              onSave={(v) => save({ earnedMinutesPerQuest: v })}
            />
            <NumberSetting
              id={`allowance-${childId}`}
              label="Free minutes each day"
              range={ALLOWANCE_RANGE}
              saved={settings.dailyAllowanceMinutes}
              hint={OFF_HINT}
              busy={busy}
              onSave={(v) => save({ dailyAllowanceMinutes: v })}
            />
            <NumberSetting
              id={`per-star-${childId}`}
              label="Minutes per side-quest star"
              range={MINUTES_PER_STAR_RANGE}
              saved={settings.minutesPerStar}
              hint={OFF_HINT}
              busy={busy}
              onSave={(v) => save({ minutesPerStar: v })}
            />
            <NumberSetting
              id={`side-quest-pay-cap-${childId}`}
              label="Most minutes side quests can earn a day"
              range={SIDE_QUEST_PAY_CAP_RANGE}
              saved={settings.sideQuestDailyCapMinutes}
              hint={OFF_HINT}
              busy={busy}
              onSave={(v) => save({ sideQuestDailyCapMinutes: v })}
            />
            <NumberSetting
              id={`bank-cap-${childId}`}
              label="Most unspent minutes kept for tomorrow"
              range={BANK_CAP_RANGE}
              saved={settings.bankCapMinutes}
              hint={OFF_HINT}
              busy={busy}
              onSave={(v) => save({ bankCapMinutes: v })}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Earning time applies when minutes are earned.</p>
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

      <fieldset className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How much the Realm shows</legend>
        <p className="px-1 pb-2 text-xs text-muted-foreground">This changes what is on screen, never minutes, tone, or what the quests are.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPTH_OVERRIDES.map((id) => (
            <label key={id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`realm-shows-${childId}`}
                value={id}
                checked={settings.depthOverride === id}
                disabled={busy}
                onChange={() => save({ depthOverride: id })}
                aria-label={DEPTH_LABELS[id].label}
                aria-describedby={`realm-shows-hint-${childId}-${id}`}
              />
              <span>
                <span className="font-medium">{DEPTH_LABELS[id].label}</span>
                <span id={`realm-shows-hint-${childId}-${id}`} className="block text-xs text-muted-foreground">{DEPTH_LABELS[id].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Side quests</legend>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`quest-length-${childId}`}>Questions in a side quest</Label>
            <Input
              id={`quest-length-${childId}`}
              type="number"
              min={SIDE_QUEST_LENGTH_RANGE.min}
              max={SIDE_QUEST_LENGTH_RANGE.max}
              value={questLength}
              onChange={(e) => setQuestLength(e.target.value)}
              className="w-24"
            />
          </div>
          <Button size="sm" variant="outline" disabled={busy || questLength === String(settings.sideQuestLength)} onClick={() => save({ sideQuestLength: parseInt(questLength, 10) })}>
            Save
          </Button>
          <p className="pb-2 text-xs text-muted-foreground">Shorter side quests suit younger heroes. Changes apply to the next side quest.</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm">Second chances</p>
            <p className="text-xs text-muted-foreground">A wrong first answer gets a hint and one more try.</p>
          </div>
          <Switch aria-label="Second chances" checked={settings.secondChances} disabled={busy} onCheckedChange={() => save({ secondChances: !settings.secondChances })} />
        </div>
        {HANDS_ON_KINDS.map((kind) => (
          <div key={kind} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm">{MECHANIC_LABELS[kind].label}</p>
              <p className="text-xs text-muted-foreground">{MECHANIC_LABELS[kind].hint}</p>
            </div>
            <Switch
              aria-label={MECHANIC_LABELS[kind].label}
              checked={settings.mechanics[kind]}
              disabled={busy}
              onCheckedChange={() => save({ mechanics: { [kind]: !settings.mechanics[kind] } })}
            />
          </div>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">{summary.balance} minutes banked today</p>
          <p className="text-xs text-muted-foreground">
            {summary.spent} of {settings.dailyCapMinutes} played{summary.bonus ? ` · ${summary.bonus} earned clearing troubles` : ""}
          </p>
          {usesEarned && (
            <p className="text-xs text-muted-foreground">
              {summary.allowance ?? 0} free minutes today · {summary.carried ?? 0} kept from yesterday
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {[15, 30].map((m) => (
            <Button key={m} size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => run(() => grantRealmMinutes(childId, m))}>
              Grant {m}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">The how-to-play card</p>
          <p className="text-xs text-muted-foreground">Heroes see it once, on their first visit. The ? button in the Realm opens it any time.</p>
        </div>
        <Button size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => run(() => resetRealmHelp(childId))}>
          Show the how-to-play card again
        </Button>
      </div>
    </div>
  );
}
