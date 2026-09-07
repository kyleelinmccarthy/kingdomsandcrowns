import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { SpriteSource } from "./sprite-source";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { VILLAGERS } from "@/lib/realm/villagers";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";

const svgElementToTexture = vi.fn();
vi.mock("@/lib/realm/sprite-texture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realm/sprite-texture")>();
  return { ...actual, svgElementToTexture: (...a: unknown[]) => svgElementToTexture(...a) };
});

beforeEach(() => {
  vi.clearAllMocks();
  disposeSpriteTextures();
  svgElementToTexture.mockImplementation(async (svg: SVGSVGElement) => ({ id: svg.getAttribute("data-figure-id") ?? svg.getAttribute("data-figure"), dispose: () => {} }));
});
afterEach(cleanup);

describe("SpriteSource", () => {
  it("rasterizes the hero, the companion, and every villager, keyed by villager id", async () => {
    const onReady = vi.fn();
    const config = { ...DEFAULT_AVATAR, companion: "cat" };
    render(<SpriteSource config={config} villagers={VILLAGERS.slice(0, 2)} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const textures = onReady.mock.calls[0][0];
    expect(textures.hero).toMatchObject({ id: "hero" });
    expect(textures.companion).toMatchObject({ id: "companion" });
    expect(Object.keys(textures.villagers).sort()).toEqual([VILLAGERS[0].id, VILLAGERS[1].id].sort());
    expect(svgElementToTexture).toHaveBeenCalledTimes(4);
  });

  it("reuses cached villager textures on a second mount", async () => {
    const onReady = vi.fn();
    const { unmount } = render(<SpriteSource config={DEFAULT_AVATAR} villagers={[VILLAGERS[0]]} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    unmount();
    render(<SpriteSource config={DEFAULT_AVATAR} villagers={[VILLAGERS[0]]} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    expect(svgElementToTexture).toHaveBeenCalledTimes(2); // hero + villager once; second mount hits the cache
  });

  it("does not re-run the effect when parent re-renders with the same config", async () => {
    const onReady = vi.fn();
    const onError = vi.fn();
    const { rerender } = render(<SpriteSource config={DEFAULT_AVATAR} onReady={onReady} onError={onError} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    await act(async () => {
      rerender(<SpriteSource config={DEFAULT_AVATAR} onReady={onReady} onError={onError} />);
    });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  it("rasterizes the three trouble figures for the requested skin", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} troubleSkin="monsters" onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const textures = onReady.mock.calls[0][0];
    expect(Object.keys(textures.troubles).sort()).toEqual(["cursed-stone", "fog", "shadow-blob"]);
    expect(textures.troubles.fog).toMatchObject({ id: "fog:monsters" });
  });
});
