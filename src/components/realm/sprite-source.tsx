"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { AvatarFigure, CompanionFigure, VillagerFigure, MountFigure } from "@/components/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { villagerAvatar, type Villager } from "@/lib/realm/villagers";
import { getCachedTexture, setCachedTexture, spriteKey, svgElementToTexture } from "@/lib/realm/sprite-texture";
import { TroubleFigure, TROUBLE_KINDS } from "@/components/realm/trouble-figures";
import type { TroubleKind, TroubleSkin } from "@/lib/realm/spells/troubles";
import { GleamFigure, BannerFigure } from "@/components/realm/recess-figures";
import { CrownFigure, CastleBannerFigure } from "@/components/realm/ceremony-figures";

export type SpriteTextures = {
  hero: THREE.CanvasTexture;
  companion: THREE.CanvasTexture | null;
  villagers: Record<string, THREE.CanvasTexture>;
  troubles: Partial<Record<TroubleKind, THREE.CanvasTexture>>;
  mount: THREE.CanvasTexture | null;
  heroMounted: THREE.CanvasTexture | null;
  gleam: THREE.CanvasTexture | null;
  banner: THREE.CanvasTexture | null;
  crown: THREE.CanvasTexture | null;
  castleBanner: THREE.CanvasTexture | null;
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
  mount = null,
  recess = false,
  crown = null,
  castleBanner = false,
  onReady,
  onError,
}: {
  config: AvatarConfig;
  /** Villagers to rasterize. Must be a stable array (e.g. the module constant VILLAGERS). */
  villagers?: Villager[];
  /** When set, also rasterizes the three trouble figures in this skin. */
  troubleSkin?: TroubleSkin | null;
  /** When set, also rasterizes the mount and the mounted rider. Must be a stable (memoised) object. */
  mount?: { id: string; color: string } | null;
  /** When true, also rasterizes the recess gleam and start banner. */
  recess?: boolean;
  /** When set, also rasterizes the ceremony crown. Must be a stable (memoised) object. */
  crown?: { id: string; color: string } | null;
  /** When true, also rasterizes the white pennant the castle banners are tinted from. */
  castleBanner?: boolean;
  onReady: (textures: SpriteTextures) => void;
  onError: (error: Error) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const root = host.current;
    const heroSvg = root?.querySelector<SVGSVGElement>('svg[data-figure="hero"]:not([data-mounted])');
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
      let mountTexture: THREE.CanvasTexture | null = null;
      let heroMounted: THREE.CanvasTexture | null = null;
      if (mount) {
        const mountSvg = root.querySelector<SVGSVGElement>(`svg[data-figure="mount"][data-figure-id="${mount.id}"]`);
        const riderSvg = root.querySelector<SVGSVGElement>('svg[data-figure="hero"][data-mounted="true"]');
        if (mountSvg) mountTexture = await textureFor(`mount:${mount.id}:${mount.color}`, mountSvg);
        if (riderSvg) heroMounted = await textureFor(`${key}:mounted`, riderSvg);
      }
      let gleam: THREE.CanvasTexture | null = null;
      let banner: THREE.CanvasTexture | null = null;
      if (recess) {
        const gleamSvg = root.querySelector<SVGSVGElement>('svg[data-figure="gleam"]');
        const bannerSvg = root.querySelector<SVGSVGElement>('svg[data-figure="banner"]');
        if (gleamSvg) gleam = await textureFor("gleam", gleamSvg);
        if (bannerSvg) banner = await textureFor("banner", bannerSvg);
      }
      let crownTexture: THREE.CanvasTexture | null = null;
      if (crown) {
        const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="crown"][data-figure-id="${crown.id}"]`);
        if (svg) crownTexture = await textureFor(`crown:${crown.id}`, svg);
      }
      let castleBannerTexture: THREE.CanvasTexture | null = null;
      if (castleBanner) {
        const svg = root.querySelector<SVGSVGElement>('svg[data-figure="castle-banner"]');
        if (svg) castleBannerTexture = await textureFor("castle-banner", svg);
      }
      if (!cancelled) onReady({ hero, companion, villagers: villagerTextures, troubles: troubleTextures, mount: mountTexture, heroMounted, gleam, banner, crown: crownTexture, castleBanner: castleBannerTexture });
    })().catch((err: unknown) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [config, villagers, troubleSkin, mount, recess, crown, castleBanner, onReady, onError]);

  return (
    <div ref={host} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
      <AvatarFigure config={config} size="xl" />
      {config.companion && <CompanionFigure companion={config.companion} color={config.companionColor} size="xl" />}
      {villagers.map((v) => <VillagerFigure key={v.id} villager={v} size="xl" />)}
      {troubleSkin && TROUBLE_KINDS.map((kind) => <TroubleFigure key={kind} kind={kind} skin={troubleSkin} />)}
      {mount && <MountFigure mount={mount.id} color={mount.color} size="xl" />}
      {mount && <AvatarFigure config={config} size="xl" mounted />}
      {recess && <GleamFigure />}
      {recess && <BannerFigure />}
      {crown && <CrownFigure id={crown.id} color={crown.color} />}
      {castleBanner && <CastleBannerFigure />}
    </div>
  );
}
