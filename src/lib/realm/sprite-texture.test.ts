import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spriteKey, svgElementToTexture, SPRITE_SCALE } from "./sprite-texture";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";

describe("spriteKey", () => {
  it("is stable for the same look and ignores the crest", () => {
    expect(spriteKey(DEFAULT_AVATAR)).toBe(spriteKey({ ...DEFAULT_AVATAR }));
    expect(spriteKey({ ...DEFAULT_AVATAR, background: "star", backgroundColor: "#000000" })).toBe(spriteKey(DEFAULT_AVATAR));
  });
  it("changes when the look changes", () => {
    expect(spriteKey({ ...DEFAULT_AVATAR, hairStyle: "ponytail" })).not.toBe(spriteKey(DEFAULT_AVATAR));
    expect(spriteKey({ ...DEFAULT_AVATAR, companion: "fox" })).not.toBe(spriteKey(DEFAULT_AVATAR));
  });
});

describe("svgElementToTexture", () => {
  let originalImage: typeof Image;
  let mockDrawImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalImage = globalThis.Image;
    mockDrawImage = vi.fn();

    // Mock Image class with src setter
    class MockImage {
      onload?: () => void;
      onerror?: () => void;
      width = 0;
      height = 0;
      private _src = "";

      set src(url: string) {
        this._src = url;
        queueMicrotask(() => {
          this.onload?.();
        });
      }

      get src(): string {
        return this._src;
      }
    }

    (globalThis.Image as any) = MockImage;

    // Mock canvas context
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {
        imageSmoothingEnabled: true,
        drawImage: mockDrawImage,
      } as any
    );
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.restoreAllMocks();
  });

  it("converts SVG element to CanvasTexture with correct properties", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 36 48");
    svg.setAttribute("width", "36");
    svg.setAttribute("height", "48");

    const texture = await svgElementToTexture(svg);

    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(texture.magFilter).toBe(NearestFilter);
    expect(texture.minFilter).toBe(NearestFilter);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect((texture.image as HTMLCanvasElement).width).toBe(36 * SPRITE_SCALE);
    expect((texture.image as HTMLCanvasElement).height).toBe(48 * SPRITE_SCALE);
  });

  it("disables image smoothing on the canvas context", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 36 48");

    await svgElementToTexture(svg);

    const ctx = (HTMLCanvasElement.prototype.getContext as any).mock.results[0].value;
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it("calls drawImage on the canvas context", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 36 48");

    await svgElementToTexture(svg);

    expect(mockDrawImage).toHaveBeenCalledOnce();
  });

  it("rejects when Image fails to load", async () => {
    class FailImage {
      onload?: () => void;
      onerror?: () => void;
      width = 0;
      height = 0;
      private _src = "";

      set src(url: string) {
        this._src = url;
        queueMicrotask(() => {
          this.onerror?.();
        });
      }

      get src(): string {
        return this._src;
      }
    }

    (globalThis.Image as any) = FailImage;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 36 48");

    await expect(svgElementToTexture(svg)).rejects.toThrow("The hero's picture could not be drawn.");
  });
});
