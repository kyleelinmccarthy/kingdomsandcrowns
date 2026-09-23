"use client";

/**
 * THE COMPOSITION ROOT of the 3D Realm. It builds every long-lived object the canvas and the
 * HUD share — the generated island, the village layout, the child's spell pages, the nameplate
 * anchors, the HUD bus, the caster and the effect pool — once, and hands the same references
 * to both sides for the life of the page.
 *
 * It never imports `three`. The canvas is behind a `next/dynamic` boundary, so this file, the
 * HUD and every menu around the game stay loadable under Vitest and on the server.
 *
 * Ownership line: the canvas (`spike-scene.tsx` and everything it imports) is the world and the
 * child's body in it; this file and the HUD are everything drawn over it. They meet only through
 * `RealmCanvasProps` and the `HudBus`.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { buildWorldLayout } from "@/lib/realm/layout";
import { resolvePages, withEmptyPages } from "@/lib/realm/spells/pages";
import { makeCaster, makeCastQueue } from "@/lib/realm3d/casting";
import { makeHudBus } from "@/lib/realm3d/hud-bus";
import { buildAnchors } from "@/lib/realm3d/plate-anchors";
import { FX_POOL, makeFxPool } from "@/lib/realm3d/spell-fx";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { SpellPage } from "@/lib/services/spells";
import { RealmHud } from "./hud";

const RealmCanvas = dynamic(() => import("./spike-scene"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-muted-foreground">Raising the hills…</p>,
});

/**
 * The half-built village the spike has always shown: four sites raised, four still on their
 * footings, three of them the current objectives. A stand-in until the child's real kingdom
 * state is fed in from the bundle.
 */
const VILLAGE = {
  castleType: "castle",
  buildings: [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "mill", done: 5, total: 5, complete: true },
    { id: "bridge", done: 5, total: 5, complete: true },
    { id: "chapel", done: 3, total: 5, complete: false },
    { id: "market", done: 5, total: 5, complete: true },
    { id: "library", done: 1, total: 5, complete: false },
    { id: "watchtower", done: 5, total: 5, complete: true },
    { id: "garden", done: 0, total: 5, complete: false },
  ],
  banners: 5,
  objectiveIds: ["chapel", "library", "garden"],
} as const;

export function RealmGame({
  avatar,
  close = false,
  heroName = "The Hero",
  spellbook,
  viewer = "child",
  castleUnlocked = true,
}: {
  avatar?: AvatarConfig | null;
  close?: boolean;
  heroName?: string;
  /** The child's own spellbook rows and slot count, straight off `getRealmBundle`. */
  spellbook?: { spells: SpellPage[]; slots: number } | null;
  viewer?: "child" | "parent";
  castleUnlocked?: boolean;
}) {
  const world = useMemo(() => realmWorld(), []);
  const layout = useMemo(() => buildWorldLayout({ ...VILLAGE, buildings: [...VILLAGE.buildings], objectiveIds: [...VILLAGE.objectiveIds] }), []);

  /**
   * The child's REAL spells. `resolvePages` turns their saved rows into castable definitions
   * and `withEmptyPages` pads the book out to the slot count their level has earned — the same
   * two calls `realm-shell.tsx` makes, so the 3D bar and the flat Realm's bar can never
   * disagree about what a child owns.
   */
  const pages = useMemo(() => {
    const slots = spellbook?.slots ?? 4;
    return withEmptyPages(resolvePages(spellbook?.spells ?? [], slots), slots);
  }, [spellbook]);

  const anchors = useMemo(
    () => buildAnchors({ heroName, villagers: layout.villagers, landmarks: world.landmarks, heightAt: world.heightAt }),
    [heroName, layout, world],
  );

  // Built once, mutated for ever, shared across the canvas boundary. None of these is React
  // state and none of them can re-render anything.
  const bus = useMemo(() => makeHudBus(pages.length, anchors.length), [pages.length, anchors.length]);
  const caster = useMemo(() => makeCaster(pages.length), [pages.length]);
  const fxPool = useMemo(() => makeFxPool(FX_POOL), []);
  const casts = useMemo(() => makeCastQueue(), []);
  const hero = avatar ?? DEFAULT_AVATAR;

  return (
    <div className="fixed inset-0 bg-[#bcdcec]">
      <RealmCanvas
        avatar={hero}
        close={close}
        world={world}
        layout={layout}
        anchors={anchors}
        pages={pages}
        bus={bus}
        caster={caster}
        fxPool={fxPool}
        casts={casts}
        viewer={viewer}
        castleUnlocked={castleUnlocked}
      />
      {!close && <RealmHud bus={bus} world={world} anchors={anchors} pages={pages} heroName={heroName} />}
    </div>
  );
}
