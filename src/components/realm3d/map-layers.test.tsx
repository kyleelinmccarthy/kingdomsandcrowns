import { act, cleanup, renderHook } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import { useBakedLand } from "./map-layers";

afterEach(cleanup);

/**
 * jsdom has no 2D canvas, so the bake is handed one that only takes paint, and a `toDataURL`
 * that counts how often a picture was made: the thing under test is that it is made once.
 */
const made = vi.fn(() => "data:image/png;base64,LAND");
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({ fillStyle: "", fillRect: () => {} })) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toDataURL = made as unknown as HTMLCanvasElement["toDataURL"];
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
});

const island = (): RealmWorld => ({ biomeAt: () => "meadow" }) as unknown as RealmWorld;

describe("the baked land", () => {
  it("is painted once per island: a second map gets the picture on its first render", () => {
    vi.useFakeTimers();
    try {
      const world = island();
      const first = renderHook(() => useBakedLand(world));
      expect(first.result.current).toBeNull();
      act(() => void vi.runAllTimers());
      expect(first.result.current).toBe("data:image/png;base64,LAND");
      expect(made).toHaveBeenCalledTimes(1);

      // The big map opening later: the land is there at once, and nothing is painted again.
      const second = renderHook(() => useBakedLand(world));
      expect(second.result.current).toBe("data:image/png;base64,LAND");
      act(() => void vi.runAllTimers());
      expect(made).toHaveBeenCalledTimes(1);

      // A different island is its own picture.
      const other = renderHook(() => useBakedLand(island()));
      expect(other.result.current).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
