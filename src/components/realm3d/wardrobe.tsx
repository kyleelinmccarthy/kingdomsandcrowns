"use client";

/**
 * THE WARDROBE: the Tavern's own avatar customizer, opened inside the Realm from the pause menu, so a
 * child can change how they and their companion look without leaving. What it may offer (level,
 * badges, quest unlocks, crowns) is asked for as it opens (`getWardrobe`), not carried on every
 * visit. A save hands the new look straight to the game (`onSaved`), which puts it on the hero and
 * the pet at once; the page is never refreshed. The Mount tab is left out: the ridden mount is fixed
 * for a visit (`riding-hud.tsx` builds its bus once), so a new one would not show until the next —
 * the Tavern is where a mount is chosen.
 */

import { useEffect, useState } from "react";
import { AvatarCustomizer } from "@/components/avatar-customizer";
import { GameIcon } from "@/components/game-icon";
import { getWardrobe } from "@/lib/actions/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { Panel } from "./frame-hud";

type Facts = Awaited<ReturnType<typeof getWardrobe>>;

const OMIT = ["mount"] as const;

export function RealmWardrobe({
  childId,
  heroName,
  worn,
  onSaved,
  onClose,
}: {
  childId: string;
  heroName: string;
  worn: AvatarConfig;
  onSaved: (config: AvatarConfig) => void;
  onClose: () => void;
}) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    getWardrobe(childId)
      .then((f) => {
        if (live) setFacts(f);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [childId, attempt]);

  if (!facts) {
    return (
      <Panel title="Wardrobe" label="Wardrobe" icon={<GameIcon name="person" className="r3-board-icon" />} onClose={onClose}>
        {failed ? (
          <>
            <p className="r3-board-sub">The wardrobe is stuck shut. Try again in a moment.</p>
            <div className="r3-menu">
              <button
                type="button"
                className="r3-menu-item r3-menu-item--go"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            </div>
          </>
        ) : (
          <p className="r3-board-sub" role="status">
            Opening your wardrobe…
          </p>
        )}
      </Panel>
    );
  }
  return (
    <AvatarCustomizer
      open
      childId={childId}
      childName={heroName}
      currentConfig={worn}
      level={facts.level}
      earnedBadgeIds={facts.earnedBadgeIds}
      questUnlockedItems={facts.questUnlockedItems}
      crowns={facts.crowns}
      omitTabs={OMIT}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}
