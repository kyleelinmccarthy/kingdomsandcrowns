import { describe, expect, it } from "vitest";
import { screenshot } from "./screens";

describe("screenshot", () => {
  it("points at the versioned screens folder at the default 1280×800 capture size", () => {
    expect(screenshot("realm-village", "A village")).toEqual({
      src: "/marketing/screens/r3/realm-village.jpg",
      alt: "A village",
      width: 1280,
      height: 800,
    });
  });

  it("keeps a custom capture size", () => {
    expect(screenshot("x", "y", 1280, 560).height).toBe(560);
  });
});
