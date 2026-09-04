"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { DeedPlayer } from "@/components/deed-player";
import { startDeedRun, type DeedsOverview, type RunStart } from "@/lib/actions/deeds";
import type { ProfileLike } from "@/lib/utils/deed-engine";

export function DeedPicker({ childId, overview, profile, calm }: { childId: string; overview: DeedsOverview; profile: ProfileLike; calm: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Work in progress leads, untouched buildings follow, finished ones rest at the end.
  const rank = (b: DeedsOverview["buildings"][number]) => (b.complete ? 2 : b.done > 0 ? 0 : 1);
  const buildings = [...overview.buildings].sort((a, b) => rank(a) - rank(b));

  async function begin(deedId: string) {
    setBusy(true);
    setError("");
    try {
      setRun(await startDeedRun(childId, deedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  if (run) {
    return <DeedPlayer childId={childId} run={run} profile={profile} calm={calm} onFinished={() => { setRun(null); router.refresh(); }} />;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      {buildings.map((b) => (
        <section key={b.id} className="rounded-lg border border-gold-dim bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <GameIcon name={b.icon} className="size-6 text-[var(--gold-bright)]" />
            <div className="flex-1">
              <h3 className="font-medium">{b.label}</h3>
              <p className="text-xs text-muted-foreground">{b.description}</p>
            </div>
            {b.complete ? (
              <span className="rounded-full bg-[rgba(201,168,76,0.15)] px-2 py-0.5 text-xs font-semibold text-[var(--gold-bright)]">Built</span>
            ) : (
              <span className="text-xs text-muted-foreground">{b.done} of {b.total}</span>
            )}
          </div>
          <div className="xp-bar-track mt-2"><div className="xp-bar-fill" style={{ width: `${(b.done / b.total) * 100}%` }} /></div>
          <ul className="mt-3 space-y-2">
            {b.deeds.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold-dim px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.story}</p>
                </div>
                <Button size="sm" aria-label={`Begin ${d.title}`} disabled={busy} onClick={() => begin(d.id)}>Begin</Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
