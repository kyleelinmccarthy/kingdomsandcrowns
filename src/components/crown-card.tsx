"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { markCeremonySeen } from "@/lib/actions/seasons";
import { crownById, CROWNS } from "@/lib/utils/crown-catalog";
import { gradeName, seasonLabel } from "@/lib/utils/seasons";

/**
 * A crown waiting for its ceremony. The hero can go and see it in the Realm or
 * simply hail it here; a parent can only hail it. Gone once marked.
 */
export function CrownCard({
  childId,
  childName,
  season,
  isChildView,
}: {
  childId: string;
  childName: string;
  season: { id: string; crownId: string | null; grade: string; startDate: string };
  isChildView: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const crown = season.crownId ? crownById(season.crownId) : null;
  const color = crown?.color ?? CROWNS[0].color;
  const label = crown?.label ?? "Crown";

  function hail() {
    setError("");
    startTransition(async () => {
      try {
        await markCeremonySeen(childId, season.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The crown slipped. Try again.");
      }
    });
  }

  return (
    <GameFrame className="crown-card">
      <div className="flex flex-wrap items-center gap-4">
        <span style={{ color }}>
          <GameIcon name={crown?.icon ?? "crown"} className="size-10 drop-shadow-[0_0_6px_var(--glow-gold)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">A crown awaits, {childName}!</p>
          <p className="text-sm text-muted-foreground">
            {seasonLabel(season.startDate)} &middot; {gradeName(season.grade)} &middot; {label}
          </p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isChildView && (
            <Link href="/realm" className="text-sm font-medium text-primary hover:underline">See the ceremony</Link>
          )}
          <Button size="sm" variant="outline" onClick={hail} disabled={pending}>Hail!</Button>
        </div>
      </div>
    </GameFrame>
  );
}
