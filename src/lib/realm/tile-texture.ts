import type { CanvasTexture } from "three";
import type { Tile } from "./tiles";

/** Paints a tile onto a canvas as a repeating, nearest-filtered texture. three loads only when the world opens. */
export async function tileToTexture(tile: Tile, pixel = 4): Promise<CanvasTexture> {
  const { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } = await import("three");
  const canvas = document.createElement("canvas");
  canvas.width = (tile[0]?.length ?? 0) * pixel;
  canvas.height = tile.length * pixel;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The ground could not be drawn.");
  tile.forEach((row, y) => row.forEach((color, x) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
  }));
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
