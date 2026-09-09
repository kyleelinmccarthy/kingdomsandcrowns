"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/game-icon";
import { SubjectChip } from "@/components/subject-chip";
import type { BuildingOverview } from "@/lib/services/deeds";
import type { Villager } from "@/lib/realm/villagers";

// Sentence case here (not the SIDE_QUESTS title-case noun): this reads as a plain sentence, not a heading.
export const HERO_ONLY = "Side quests are for the hero to play.";

export function SiteCard({
  villager,
  building,
  preview,
  busy,
  error,
  onBegin,
  onClearError,
  onClose,
}: {
  villager: Villager;
  building: BuildingOverview;
  preview: boolean;
  busy: boolean;
  error: string;
  onBegin: (deedId: string) => void;
  onClearError: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `site-${building.id}-title`;

  // Focus lands on the panel when it opens so Escape and Tab work at once.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div
      ref={panel}
      className="realm-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="realm-panel-head">
        <GameIcon name={building.icon} className="size-6 text-[var(--gold-bright)]" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-bold">{villager.name}</h2>
          <p className="text-sm text-muted-foreground">{villager.greeting}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="realm-panel-progress">
        <span className="font-medium">{building.label}</span>
        <span className="text-xs text-muted-foreground">{building.complete ? "Built" : `${building.done} of ${building.total}`}</span>
      </div>
      <div className="xp-bar-track"><div className="xp-bar-fill" style={{ width: `${(building.done / building.total) * 100}%` }} /></div>
      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {error} <Button size="xs" variant="ghost" onClick={onClearError}>Try again</Button>
        </p>
      )}
      <ul className="realm-panel-deeds">
        {building.deeds.map((d) => (
          <li key={d.id} className="realm-panel-deed">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">{d.title} <SubjectChip area={d.area} /></p>
              <p className="text-xs text-muted-foreground">{d.story}</p>
            </div>
            {preview ? null : (
              <Button size="sm" aria-label={`Begin ${d.title}`} disabled={busy} onClick={() => onBegin(d.id)}>Begin</Button>
            )}
          </li>
        ))}
      </ul>
      {preview && <p className="text-sm text-muted-foreground">{HERO_ONLY}</p>}
    </div>
  );
}
