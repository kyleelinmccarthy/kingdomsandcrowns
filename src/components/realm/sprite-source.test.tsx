import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { SpriteSource } from "./sprite-source";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { VILLAGERS } from "@/lib/realm/villagers";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";
import { BUILDINGS } from "@/lib/utils/kingdom";

const svgElementToTexture = vi.fn();
vi.mock("@/lib/realm/sprite-texture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realm/sprite-texture")>();
  return { ...actual, svgElementToTexture: (...a: unknown[]) => svgElementToTexture(...a) };
});

const tileToTexture = vi.fn();
vi.mock("@/lib/realm/tile-texture", () => ({ tileToTexture: (...a: unknown[]) => tileToTexture(...a) }));

beforeEach(() => {
  vi.clearAllMocks();
  disposeSpriteTextures();
  svgElementToTexture.mockImplementation(async (svg: SVGSVGElement) => ({ id: svg.getAttribute("data-figure-id") ?? svg.getAttribute("data-figure"), dispose: () => {} }));
  tileToTexture.mockImplementation(async (tile: string[][]) => ({ id: `tile:${tile.length}`, repeat: { set: vi.fn() }, dispose: () => {} }));
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

  it("rasterizes the mount, the mounted rider, and the recess figures when asked", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} mount={{ id: "pony", color: "#8b5e3c" }} recess onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const t = onReady.mock.calls[0][0];
    expect(t.mount).toMatchObject({ id: "pony" });
    expect(t.heroMounted).toMatchObject({ id: "hero" });
    expect(t.gleam).toMatchObject({ id: "gleam" });
    expect(t.banner).toMatchObject({ id: "banner" });
    expect(svgElementToTexture).toHaveBeenCalledTimes(5); // hero, rider, mount, gleam, banner
  });

  it("rasterizes the world set at its own scales and paints the two tiles", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} world={{ castleType: "keep", decor: true }} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const textures = onReady.mock.calls[0][0];
    expect(textures.world["castle:keep"].id).toBe("keep");
    // All eight kingdom buildings are rasterised up front, not just the completed ones,
    // so a building's rise tween is never mid-visit swapped from a fallback box.
    for (const building of BUILDINGS) {
      expect(textures.world[`building:${building.id}`].id).toBe(building.id);
    }
    expect(textures.world.foundation.id).toBe("foundation");
    expect(textures.world["decor:oak"].id).toBe("oak");
    expect(textures.tiles.grass).toBeTruthy();
    expect(textures.tiles.cobble).toBeTruthy();
    const scaleOf = (figure: string) => svgElementToTexture.mock.calls.find((c) => (c[0] as SVGSVGElement).getAttribute("data-figure") === figure)?.[1];
    expect(scaleOf("castle")).toBe(8);
    expect(scaleOf("building")).toBe(6);
    expect(scaleOf("foundation")).toBe(4);
    expect(scaleOf("decor")).toBe(4);
  });

  it("skips decorations when the world asks for none", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} world={{ castleType: "campsite", decor: false }} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(Object.keys(onReady.mock.calls[0][0].world).some((k) => k.startsWith("decor:"))).toBe(false);
  });
});
