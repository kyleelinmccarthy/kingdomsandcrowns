import { describe, it, expect } from "vitest";
import { spriteKey } from "./sprite-texture";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

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
