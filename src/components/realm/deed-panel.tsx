"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeedPlayer } from "@/components/deed-player";
import { startDeedRun, type RunStart, type RunSummary } from "@/lib/actions/deeds";
import type { BuildingOverview } from "@/lib/services/deeds";
import type { Villager } from "@/lib/realm/villagers";
import type { ProfileLike } from "@/lib/utils/deed-engine";
import { SiteCard } from "./site-card";

/**
 * The overlay a villager opens: the site card first, then the deed itself,
 * then its results. The world underneath is paused by the shell while this
 * is mounted; leaving mid-deed is safe because an unfinished run resumes
 * within the hour.
 */
export function DeedPanel({
  childId,
  villager,
  building,
  profile,
  calm,
  preview,
  onFinished,
  onClose,
}: {
  childId: string;
  villager: Villager;
  building: BuildingOverview;
  profile: ProfileLike;
  calm: boolean;
  preview: boolean;
  onFinished: (buildingId: string, result: RunSummary["building"]) => void;
  onClose: () => void;
}) {
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const runDialog = useRef<HTMLDivElement>(null);

  // The site card focuses itself on mount, but it unmounts once a run starts;
  // without this the run dialog is never focused and Tab/Escape do nothing
  // until the hero clicks something.
  useEffect(() => {
    if (run) runDialog.current?.focus();
  }, [run]);

  // Keep Tab inside the panel while it is open; the world's controls are disabled meanwhile.
  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [run]);

  async function begin(deedId: string) {
    setBusy(true);
    setError("");
    try {
      setRun(await startDeedRun(childId, deedId, "realm"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={panel} className="realm-overlay">
      {run ? (
        <div ref={runDialog} className="realm-panel" role="dialog" aria-modal="true" aria-label={run.deed.title} tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
          <div className="realm-panel-head">
            <span className="text-sm text-muted-foreground">{villager.name}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Leave the deed</Button>
          </div>
          <DeedPlayer childId={childId} run={run} profile={profile} calm={calm} doneLabel="Back to the Realm" onFinished={(summary) => onFinished(building.id, summary.building)} />
        </div>
      ) : (
        <SiteCard villager={villager} building={building} preview={preview} busy={busy} error={error} onBegin={begin} onClose={onClose} />
      )}
    </div>
  );
}
