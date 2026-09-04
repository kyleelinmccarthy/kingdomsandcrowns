import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";

/** 36×48 SVG units → 216×288 px: crisp at the tabletop zoom, small enough to rasterize in a few ms. */
export const SPRITE_SCALE = 6;
const SVG_W = 36;
const SVG_H = 48;

/** The fields that change the drawn figure. The crest never appears on a sprite, so it is excluded. */
export function spriteKey(config: AvatarConfig): string {
  const { background: _bg, backgroundColor: _bgColor, ...visual } = config;
  return JSON.stringify(visual, Object.keys(visual).sort());
}

/** Serializes an inline <svg> and draws it onto a canvas with smoothing off, so pixel art stays pixel art. */
export async function svgElementToTexture(svg: SVGSVGElement, scale = SPRITE_SCALE): Promise<CanvasTexture> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(SVG_W * scale));
  clone.setAttribute("height", String(SVG_H * scale));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The hero's picture could not be drawn."));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = SVG_W * scale;
  canvas.height = SVG_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The hero's picture could not be drawn.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  return texture;
}

const cache = new Map<string, CanvasTexture>();

export function getCachedTexture(key: string): CanvasTexture | undefined {
  return cache.get(key);
}

export function setCachedTexture(key: string, texture: CanvasTexture): void {
  cache.set(key, texture);
}

/** Called when the shell unmounts so GPU memory follows the page away. */
export function disposeSpriteTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
