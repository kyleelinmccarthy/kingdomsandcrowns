import { describe, expect, it } from "vitest";
import { forgetKey, keyChanged, makePaintKeys } from "./paint-keys";

describe("numbers before strings", () => {
  it("says changed the first time, then not while the numbers hold", () => {
    const keys = makePaintKeys(2);
    expect(keyChanged(keys, 0, 12, 34)).toBe(true);
    expect(keyChanged(keys, 0, 12, 34)).toBe(false);
    expect(keyChanged(keys, 0, 12, 34)).toBe(false);
  });

  it("says changed when any one of the five moves, and keeps slots apart", () => {
    const keys = makePaintKeys(2);
    keyChanged(keys, 0, 1, 2, 3, 4, 5);
    keyChanged(keys, 1, 1, 2, 3, 4, 5);
    expect(keyChanged(keys, 0, 1, 2, 3, 4, 6)).toBe(true);
    expect(keyChanged(keys, 1, 1, 2, 3, 4, 5)).toBe(false);
  });

  it("forgets a slot, so a plate shown again is written again", () => {
    const keys = makePaintKeys(1);
    keyChanged(keys, 0, 7);
    forgetKey(keys, 0);
    expect(keyChanged(keys, 0, 7)).toBe(true);
  });
});
