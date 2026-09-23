"use client";

/**
 * The client entry for `/realm-3d`. The `three` boundary now lives in `realm-game.tsx`, which
 * dynamic-imports the canvas; this stays as the name the page imports.
 */

import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import type { SpellPage } from "@/lib/services/spells";
import { RealmGame } from "./realm-game";

export function Realm3dSpike({
  avatar,
  close,
  heroName,
  spellbook,
  viewer,
  castleUnlocked,
}: {
  avatar: AvatarConfig | null;
  close?: boolean;
  heroName?: string;
  spellbook?: { spells: SpellPage[]; slots: number } | null;
  viewer?: "child" | "parent";
  castleUnlocked?: boolean;
}) {
  return <RealmGame avatar={avatar} close={close} heroName={heroName} spellbook={spellbook} viewer={viewer} castleUnlocked={castleUnlocked} />;
}
