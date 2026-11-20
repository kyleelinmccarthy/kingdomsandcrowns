"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { DeedPlayer } from "@/components/deed-player";
import { SubjectChip } from "@/components/subject-chip";
import { startReviewRun } from "@/lib/actions/review";
import { startPracticeRun } from "@/lib/actions/practice";
import { PUZZLE_PRACTICE } from "@/lib/utils/practice-copy";
import { startDeedRun, type DeedsOverview } from "@/lib/actions/deeds";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";
import { rankBuildings } from "@/lib/realm/objective";
import { countsTowardBuilding } from "@/lib/utils/deed-scoring";
import type { ProfileLike } from "@/lib/utils/deed-engine";

export function DeedPicker({ childId, overview, profile, calm }: { childId: string; overview: DeedsOverview; profile: ProfileLike; calm: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nothingToReview, setNothingToReview] = useState(false);
  const [area, setArea] = useState<SkillArea | "all">("all");

  // Work in progress leads, untouched buildings follow, finished ones rest at the end — the rank the world
  // sorts by too, so this page and the Realm can never disagree about what to do next.
  const buildings = rankBuildings(overview.buildings);
  const visible = buildings
    .map((b) => ({ ...b, deeds: b.deeds.filter((d) => area === "all" || d.area === area) }))
    .filter((b) => b.deeds.length > 0);

  /** Starts a run from one of the page's buttons: the player takes over, or a review says there is nothing yet. */
  async function start(next: () => Promise<RunStart | { empty: true }>) {
    setBusy(true);
    setError("");
    setNothingToReview(false);
    try {
      const started = await next();
      if ("empty" in started) setNothingToReview(true);
      else setRun(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }
  const begin = (deedId: string) => start(() => startDeedRun(childId, deedId));
  const review = () => start(() => startReviewRun(childId, { kind: "page" }));
  const practise = () => start(() => startPracticeRun(childId));

  if (run) {
    return <DeedPlayer run={run} profile={profile} calm={calm} onFinished={() => { setRun(null); router.refresh(); }} />;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      <div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void review()}>Quick review</Button>
          {/* Logic is practised on locks (R-F8): offered to the hero while the grown-up has locks on. */}
          {overview.puzzlePractice && <Button variant="outline" disabled={busy} onClick={() => void practise()}>{PUZZLE_PRACTICE}</Button>}
        </div>
        {nothingToReview && <p role="status" className="mt-2 text-sm text-muted-foreground">Nothing to review yet. Finish a side quest first and it will come back here.</p>}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
        {(["all", "math", "reading", "language", "science"] as const).map((a) => (
          <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${area === a ? "border-[var(--gold-border)] bg-[rgba(201,168,76,0.15)] text-[var(--gold-bright)]" : "border-border text-muted-foreground"}`}>
            {a === "all" ? "All" : AREA_LABELS[a].label}
          </button>
        ))}
      </div>
      {visible.map((b) => (
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
          {/* A built building's stories are practice now: they teach, and the walls already stand. */}
          {b.complete && <p className="mt-3 text-xs font-medium text-muted-foreground">Practise again</p>}
          <ul className={`${b.complete ? "mt-2" : "mt-3"} space-y-2`}>
            {b.deeds.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold-dim px-3 py-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {d.title} <SubjectChip area={d.area} />
                    {/* Done once it earned a star: that story has its place in the building. */}
                    {countsTowardBuilding(d.bestStars) && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--gold-bright)]">
                        <CheckIcon className="size-3.5" aria-hidden="true" />Done
                      </span>
                    )}
                  </p>
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
