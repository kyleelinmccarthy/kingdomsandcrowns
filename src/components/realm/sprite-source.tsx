"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { AvatarFigure, CompanionFigure } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { getCachedTexture, setCachedTexture, spriteKey, svgElementToTexture } from "@/lib/realm/sprite-texture";

export type SpriteTextures = { hero: THREE.CanvasTexture; companion: THREE.CanvasTexture | null };

/**
 * Renders the hero and companion figures off-screen and rasterizes them. The
 * SVG must exist in the DOM to be serialized, which is why this is a component
 * rather than a plain function.
 */
export function SpriteSource({
  config,
  onReady,
  onError,
}: {
  config: AvatarConfig;
  onReady: (textures: SpriteTextures) => void;
  onError: (error: Error) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const heroSvg = host.current?.querySelector<SVGSVGElement>('svg[data-figure="hero"]');
    const companionSvg = host.current?.querySelector<SVGSVGElement>('svg[data-figure="companion"]');
    if (!heroSvg) return;
    const key = spriteKey(config);
    (async () => {
      const hero = getCachedTexture(key) ?? (await svgElementToTexture(heroSvg));
      setCachedTexture(key, hero);
      let companion: THREE.CanvasTexture | null = null;
      if (companionSvg && config.companion) {
        companion = getCachedTexture(`${key}:companion`) ?? (await svgElementToTexture(companionSvg));
        setCachedTexture(`${key}:companion`, companion);
      }
      if (!cancelled) onReady({ hero, companion });
    })().catch((err: unknown) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [config, onReady, onError]);

  return (
    <div ref={host} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
      <AvatarFigure config={config} size="xl" />
      {config.companion && <CompanionFigure companion={config.companion} color={config.companionColor} size="xl" />}
    </div>
  );
}
