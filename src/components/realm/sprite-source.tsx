"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { AvatarFigure, CompanionFigure, VillagerFigure } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { villagerAvatar, type Villager } from "@/lib/realm/villagers";
import { getCachedTexture, setCachedTexture, spriteKey, svgElementToTexture } from "@/lib/realm/sprite-texture";
import { TroubleFigure, TROUBLE_KINDS } from "@/components/realm/trouble-figures";
import type { TroubleKind, TroubleSkin } from "@/lib/realm/spells/troubles";

export type SpriteTextures = {
  hero: THREE.CanvasTexture;
  companion: THREE.CanvasTexture | null;
  villagers: Record<string, THREE.CanvasTexture>;
  troubles: Partial<Record<TroubleKind, THREE.CanvasTexture>>;
};

const NO_VILLAGERS: Villager[] = [];

async function textureFor(key: string, svg: SVGSVGElement): Promise<THREE.CanvasTexture> {
  const cached = getCachedTexture(key);
  if (cached) return cached;
  const texture = await svgElementToTexture(svg);
  setCachedTexture(key, texture);
  return texture;
}

/**
 * Renders the hero, companion, and villager figures off-screen and rasterizes
 * them. The SVG must exist in the DOM to be serialized, which is why this is a
 * component rather than a plain function.
 */
export function SpriteSource({
  config,
  villagers = NO_VILLAGERS,
  troubleSkin = null,
  onReady,
  onError,
}: {
  config: AvatarConfig;
  /** Villagers to rasterize. Must be a stable array (e.g. the module constant VILLAGERS). */
  villagers?: Villager[];
  /** When set, also rasterizes the three trouble figures in this skin. */
  troubleSkin?: TroubleSkin | null;
  onReady: (textures: SpriteTextures) => void;
  onError: (error: Error) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const root = host.current;
    const heroSvg = root?.querySelector<SVGSVGElement>('svg[data-figure="hero"]');
    if (!root || !heroSvg) return;
    const key = spriteKey(config);
    (async () => {
      const hero = await textureFor(key, heroSvg);
      let companion: THREE.CanvasTexture | null = null;
      const companionSvg = root.querySelector<SVGSVGElement>('svg[data-figure="companion"]');
      if (companionSvg && config.companion) companion = await textureFor(`${key}:companion`, companionSvg);
      const villagerTextures: Record<string, THREE.CanvasTexture> = {};
      for (const v of villagers) {
        const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="villager"][data-figure-id="${v.id}"]`);
        if (!svg) continue;
        villagerTextures[v.id] = await textureFor(`villager:${v.id}:${spriteKey(villagerAvatar(v))}`, svg);
      }
      const troubleTextures: Partial<Record<TroubleKind, THREE.CanvasTexture>> = {};
      if (troubleSkin) {
        for (const kind of TROUBLE_KINDS) {
          const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="trouble"][data-figure-id="${kind}:${troubleSkin}"]`);
          if (svg) troubleTextures[kind] = await textureFor(`trouble:${kind}:${troubleSkin}`, svg);
        }
      }
      if (!cancelled) onReady({ hero, companion, villagers: villagerTextures, troubles: troubleTextures });
    })().catch((err: unknown) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [config, villagers, troubleSkin, onReady, onError]);

  return (
    <div ref={host} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
      <AvatarFigure config={config} size="xl" />
      {config.companion && <CompanionFigure companion={config.companion} color={config.companionColor} size="xl" />}
      {villagers.map((v) => <VillagerFigure key={v.id} villager={v} size="xl" />)}
      {troubleSkin && TROUBLE_KINDS.map((kind) => <TroubleFigure key={kind} kind={kind} skin={troubleSkin} />)}
    </div>
  );
}
