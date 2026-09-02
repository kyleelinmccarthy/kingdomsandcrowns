"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { applyLearningPreset, updateLearningProfile } from "@/lib/actions/learning-profile";
import { LEARNING_PRESETS, type LearningProfile, type InputMode } from "@/lib/utils/learning-profile";

type BoolKey = Exclude<keyof LearningProfile, "sessionMinutes" | "inputMode">;

const GROUPS: { title: string; items: { key: BoolKey; label: string; hint: string }[] }[] = [
  {
    title: "Reading",
    items: [
      { key: "readingFont", label: "Reading font", hint: "Use Lexend, a font designed for reading fluency, everywhere." },
      { key: "largerText", label: "Larger text", hint: "Everything a little bigger." },
      { key: "extraSpacing", label: "Extra spacing", hint: "More room between lines and letters." },
      { key: "readAloud", label: "Read aloud", hint: "Offer to read questions out loud in the Realm." },
    ],
  },
  {
    title: "Attention & pacing",
    items: [
      { key: "untimed", label: "No timers", hint: "Trials never count down." },
      { key: "fewerChoices", label: "Fewer choices", hint: "Two answers to pick from instead of four." },
      { key: "predictableRoutine", label: "Predictable routine", hint: "Same order every time, with a warning before anything changes." },
    ],
  },
  {
    title: "Sensory",
    items: [
      { key: "reducedMotion", label: "Reduce motion", hint: "No sudden movement, whatever the device says." },
      { key: "lowStimulus", label: "Calm visuals", hint: "Fewer sparkles, softer colors, nothing flashes." },
      { key: "soundEnabled", label: "Sound", hint: "Music and effects in the Realm." },
    ],
  },
];

export function LearningProfilePanel({ childId, profile }: { childId: string; profile: LearningProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Learning Profile</h4>
      <p className="text-xs text-muted-foreground">
        What helps this hero learn. Presets only pre-fill the switches below; nothing but the switches is saved.
      </p>
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {LEARNING_PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant="outline"
            className="!border-[var(--gold-border)]"
            disabled={busy}
            title={p.description}
            onClick={() => run(() => applyLearningPreset(childId, p.id))}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {GROUPS.map((group) => (
        <div key={group.title} className="rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <Switch
                  aria-label={item.label}
                  checked={profile[item.key]}
                  disabled={busy}
                  onCheckedChange={() =>
                    run(() => updateLearningProfile(childId, { [item.key]: !profile[item.key] }))
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Suggest a break every</span>
          <Select
            value={profile.sessionMinutes === null ? "" : String(profile.sessionMinutes)}
            disabled={busy}
            onChange={(e) =>
              run(() =>
                updateLearningProfile(childId, {
                  sessionMinutes: e.target.value === "" ? null : parseInt(e.target.value, 10),
                })
              )
            }
          >
            <option value="">Never</option>
            {[10, 15, 20, 30, 45].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Play with</span>
          <Select
            value={profile.inputMode}
            disabled={busy}
            onChange={(e) => run(() => updateLearningProfile(childId, { inputMode: e.target.value as InputMode }))}
          >
            <option value="auto">Whatever the device has</option>
            <option value="touch">Touch</option>
            <option value="keyboard">Keyboard &amp; mouse</option>
          </Select>
        </label>
      </div>
    </div>
  );
}
