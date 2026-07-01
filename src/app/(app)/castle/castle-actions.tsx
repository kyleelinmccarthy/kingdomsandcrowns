"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { initializeCastle, upgradeCastle, renameCastle } from "@/lib/actions/castle";
import type { CastleType } from "@/lib/utils/avatar-catalog";

type CastleRow = {
  id: string;
  childId: string;
  type: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CastleActionsProps = {
  childId: string;
  castle: CastleRow | null;
  level: number;
  availableUpgrades: CastleType[];
  isChildView: boolean;
};

export function CastleActions({
  childId,
  castle,
  level,
  availableUpgrades,
  isChildView,
}: CastleActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(castle?.name ?? "");

  function handleInitialize() {
    startTransition(async () => {
      try {
        setError(null);
        await initializeCastle(childId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to initialize castle.");
      }
    });
  }

  function handleUpgrade(newType: string) {
    startTransition(async () => {
      try {
        setError(null);
        await upgradeCastle(childId, newType);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to upgrade castle.");
      }
    });
  }

  function handleRename() {
    startTransition(async () => {
      try {
        setError(null);
        await renameCastle(childId, newName);
        setEditingName(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to rename castle.");
      }
    });
  }

  if (!castle) {
    return (
      <GameFrame title="Claim Your Castle" icon={<GameIcon name="stoneTower" className="size-5 text-[var(--gold-bright)]" />}>
        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            {isChildView
              ? "You've reached level 50! Claim your castle to begin building your legacy."
              : `${level >= 50 ? "Level 50 reached!" : ""} Claim a castle to start building.`}
          </p>
          <Button onClick={handleInitialize} disabled={isPending || level < 50}>
            {isPending ? "Building..." : "Claim Castle"}
          </Button>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </GameFrame>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rename */}
      <GameFrame title="Castle Name" icon={<GameIcon name="pencil" className="size-5 text-[var(--gold-bright)]" />}>
        <div className="flex items-center gap-3">
          {editingName ? (
            <>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={50}
                className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
                autoFocus
              />
              <Button size="sm" onClick={handleRename} disabled={isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setNewName(castle.name ?? ""); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <p className="flex-1 font-medium">{castle.name ?? "Unnamed Castle"}</p>
              <Button size="sm" variant="outline" onClick={() => setEditingName(true)}>
                Rename
              </Button>
            </>
          )}
        </div>
      </GameFrame>

      {/* Available Upgrades */}
      {availableUpgrades.length > 0 && (
        <GameFrame title="Available Upgrades" icon={<GameIcon name="upgrade" className="size-5 text-[var(--gold-bright)]" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            {availableUpgrades.map((upgrade) => (
              <div
                key={upgrade.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--gold-dim)] bg-[rgba(201,168,76,0.04)] p-3"
              >
                <div>
                  <p className="text-sm font-medium">{upgrade.label}</p>
                  <p className="text-xs text-muted-foreground">{upgrade.description}</p>
                  <p className="text-[10px] text-muted-foreground">Requires Level {upgrade.levelRequired}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUpgrade(upgrade.id)}
                  disabled={isPending}
                >
                  Upgrade
                </Button>
              </div>
            ))}
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </GameFrame>
      )}
    </div>
  );
}
