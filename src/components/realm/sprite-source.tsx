"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { AvatarFigure, CompanionFigure, VillagerFigure } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { villagerAvatar, type Villager } from "@/lib/realm/villagers";
import { getCachedTexture, setCachedTexture, spriteKey, svgElementToTexture } from "@/lib/realm/sprite-texture";

export type SpriteTextures = { hero: THREE.CanvasTexture; companion: THREE.CanvasTexture | null; villagers: Record<string, THREE.CanvasTexture> };

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
  villagers = [],
  onReady,
  onError,
}: {
  config: AvatarConfig;
  villagers?: Villager[];
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
      if (!cancelled) onReady({ hero, companion, villagers: villagerTextures });
    })().catch((err: unknown) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [config, villagers, onReady, onError]);

  return (
    <div ref={host} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
      <AvatarFigure config={config} size="xl" />
      {config.companion && <CompanionFigure companion={config.companion} color={config.companionColor} size="xl" />}
      {villagers.map((v) => <VillagerFigure key={v.id} villager={v} size="xl" />)}
    </div>
  );
}
