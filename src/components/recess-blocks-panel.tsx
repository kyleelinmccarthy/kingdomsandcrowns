"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { addRecessBlock, removeRecessBlock, type RecessBlockRecord } from "@/lib/actions/recess-blocks";
import { DAYS_OF_WEEK, DAY_LABELS, formatTimeOfDay, type DayOfWeek } from "@/lib/utils/schedule-days";

export function RecessBlocksPanel({ childId, blocks }: { childId: string; blocks: RecessBlockRecord[] }) {
  const router = useRouter();
  const [day, setDay] = useState<DayOfWeek>("mon");
  const [start, setStart] = useState("10:30");
  const [end, setEnd] = useState("10:45");
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
    <GameFrame title="Recess" icon={<GameIcon name="campfire" className="size-4 text-[var(--gold-bright)]" />}>
      <p className="mb-3 text-xs text-muted-foreground">
        Scheduled time in the Realm. Only counts when the hero&rsquo;s Realm play is set to scheduled or both.
      </p>
      {error && <div className="mb-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      {blocks.length > 0 && (
        <ul className="mb-3 space-y-1">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-md border border-gold-dim px-3 py-1.5 text-sm">
              <span>
                {DAY_LABELS[b.dayOfWeek]} &middot; {formatTimeOfDay(b.startTime)}–{formatTimeOfDay(b.endTime)}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => removeRecessBlock(b.id))} aria-label={`Remove ${DAY_LABELS[b.dayOfWeek]} recess`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={day} onChange={(e) => setDay(e.target.value as DayOfWeek)} className="w-28" aria-label="Day">
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>{DAY_LABELS[d]}</option>
          ))}
        </Select>
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-32" aria-label="Start" />
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-32" aria-label="End" />
        <Button size="sm" disabled={busy} onClick={() => run(() => addRecessBlock(childId, { dayOfWeek: day, startTime: start, endTime: end }))}>
          Add Recess
        </Button>
      </div>
    </GameFrame>
  );
}
