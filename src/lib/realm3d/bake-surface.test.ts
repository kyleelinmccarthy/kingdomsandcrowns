import { describe, expect, it } from "vitest";
import { bakeSurface, GLOW_MIN } from "./bake-surface";

const cloth = { transparent: false, metalness: 0, glow: 0 };

describe("bakeSurface — which shared material a figure's part is baked into", () => {
  it("bakes cloth, skin, hair and the face as plain lit surface", () => {
    expect(bakeSurface(cloth)).toBe("lit");
    expect(bakeSurface({ ...cloth, metalness: 0.2 })).toBe("lit");
  });

  it("bakes steel — a breastplate, a crown, a buckle — as metal", () => {
    expect(bakeSurface({ ...cloth, metalness: 0.62 })).toBe("steel");
    expect(bakeSurface({ ...cloth, metalness: 0.3 })).toBe("steel");
  });

  it("keeps a part that makes its own light glowing, even when it is metal", () => {
    expect(bakeSurface({ ...cloth, glow: GLOW_MIN })).toBe("glow");
    expect(bakeSurface({ ...cloth, metalness: 0.8, glow: 1.2 })).toBe("glow");
    // A faint warm tint on a crown is still a crown, not a lamp.
    expect(bakeSurface({ ...cloth, metalness: 0.8, glow: GLOW_MIN - 0.01 })).toBe("steel");
  });

  it("keeps a see-through part see-through, whatever else it is", () => {
    expect(bakeSurface({ transparent: true, metalness: 0.7, glow: 2 })).toBe("glass");
  });
});
