import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Avatar, AvatarFigure, CompanionFigure, VillagerFigure, MountFigure } from "./avatar";
import { DEFAULT_AVATAR, MOUNTS, SKIN_TONES } from "@/lib/utils/avatar-catalog";
import { VILLAGERS } from "@/lib/realm/villagers";
import { crownById } from "@/lib/utils/crown-catalog";

afterEach(cleanup);
const SHAPES = "rect,path,circle,polygon,ellipse,line";
const config = { ...DEFAULT_AVATAR, companion: "cat", accessory: "cape" };

/** The y (row 2 of every pair, in emitted order) of every number in an SVG path's `d`. Assumes M/L/Z-style paths (no curves). */
function pathYs(d: string): number[] {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return nums.filter((_, i) => i % 2 === 1);
}

function polygonYs(points: string): number[] {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => Number(pair.split(",")[1]));
}

/** The lowest y a shape reaches (its topmost pixel), for checking it stays below the rider's head. */
function shapeMinY(shape: Element): number {
  switch (shape.tagName.toLowerCase()) {
    case "rect":
      return Number(shape.getAttribute("y"));
    case "circle":
      return Number(shape.getAttribute("cy")) - Number(shape.getAttribute("r"));
    case "ellipse":
      return Number(shape.getAttribute("cy")) - Number(shape.getAttribute("ry"));
    case "polygon":
      return Math.min(...polygonYs(shape.getAttribute("points") ?? ""));
    case "path":
      return Math.min(...pathYs(shape.getAttribute("d") ?? ""));
    default:
      throw new Error(`unexpected shape tag: ${shape.tagName}`);
  }
}

describe("AvatarFigure", () => {
  it("draws the hero without the crest or the companion", () => {
    const full = render(<Avatar config={config} name="Lily" size="xl" />).container.querySelectorAll(SHAPES).length;
    cleanup();
    const figure = render(<AvatarFigure config={config} />).container;
    expect(figure.querySelector('svg[data-figure="hero"]')).not.toBeNull();
    expect(figure.querySelectorAll(SHAPES).length).toBeGreaterThan(0);
    expect(figure.querySelectorAll(SHAPES).length).toBeLessThan(full);
  });
});

describe("CompanionFigure", () => {
  it("draws only the companion, and nothing without one", () => {
    const withCat = render(<CompanionFigure companion="cat" color="#f0a050" />).container;
    expect(withCat.querySelector('svg[data-figure="companion"]')).not.toBeNull();
    expect(withCat.querySelectorAll(SHAPES).length).toBeGreaterThan(0);
    cleanup();
    const none = render(<CompanionFigure companion={null} color="#f0a050" />).container;
    expect(none.querySelectorAll(SHAPES).length).toBe(0);
  });
});

describe("VillagerFigure", () => {
  it("draws a villager with its own figure attributes and no companion", () => {
    const v = VILLAGERS[0];
    const { container } = render(<VillagerFigure villager={v} />);
    const svg = container.querySelector('svg[data-figure="villager"]')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("data-figure-id")).toBe(v.id);
    expect(container.querySelector('svg[data-figure="companion"]')).toBeNull();
    expect(svg.querySelectorAll(SHAPES).length).toBeGreaterThan(0);
  });
});

describe("MountFigure and the mounted rider", () => {
  it("draws every mount with figure attributes", () => {
    for (const m of MOUNTS) {
      const { container } = render(<MountFigure mount={m.id} color="#8b5e3c" />);
      const svg = container.querySelector('svg[data-figure="mount"]')!;
      expect(svg.getAttribute("data-figure-id")).toBe(m.id);
      expect(svg.getAttribute("viewBox")).toBe("0 0 36 48");
      expect(svg.querySelectorAll("rect,path,circle,polygon,ellipse").length).toBeGreaterThan(2);
      cleanup();
    }
  });
  it("draws the mounted rider without legs or boots, shifted up", () => {
    const walking = render(<AvatarFigure config={config} />).container.querySelectorAll(SHAPES).length;
    cleanup();
    const riding = render(<AvatarFigure config={config} mounted />).container;
    expect(riding.querySelector('svg[data-figure="hero"]')!.getAttribute("data-mounted")).toBe("true");
    expect(riding.querySelectorAll(SHAPES).length).toBeLessThan(walking);
  });
  it("keeps every mount shape within the band beneath the rider's head (y >= 18, x within 2..34)", () => {
    for (const m of MOUNTS) {
      const { container } = render(<MountFigure mount={m.id} color="#8b5e3c" />);
      const shapes = container.querySelectorAll("rect,path,circle,polygon,ellipse");
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of Array.from(shapes)) {
        expect(shapeMinY(shape)).toBeGreaterThanOrEqual(18);
        if (shape.tagName.toLowerCase() === "rect") {
          const x = Number(shape.getAttribute("x"));
          const width = Number(shape.getAttribute("width"));
          expect(x).toBeGreaterThanOrEqual(2);
          expect(x + width).toBeLessThanOrEqual(34);
        }
      }
      cleanup();
    }
  });
});

describe("CrownLayer", () => {
  it("draws no crown by default and a tier-coloured circlet when one is worn, in both the figure and the full avatar", () => {
    const { container: bare } = render(<AvatarFigure config={DEFAULT_AVATAR} />);
    expect(bare.querySelector('[data-layer="crown"]')).toBeNull();
    const { container } = render(<AvatarFigure config={{ ...DEFAULT_AVATAR, crown: "crown-silver" }} />);
    const layer = container.querySelector('[data-layer="crown"]')!;
    expect(layer.getAttribute("data-crown")).toBe("crown-silver");
    expect(layer.querySelector("rect")!.getAttribute("fill")).toBe(crownById("crown-silver")!.color);
    const { container: full } = render(<Avatar config={{ ...DEFAULT_AVATAR, crown: "crown-copper" }} name="Lily" />);
    expect(full.querySelector('[data-layer="crown"]')!.querySelector("rect")!.getAttribute("fill")).toBe("#b87333");
  });
  it("draws nothing for a crown id the catalog does not know", () => {
    const { container } = render(<AvatarFigure config={{ ...DEFAULT_AVATAR, crown: "crown-of-lies" }} />);
    expect(container.querySelector('[data-layer="crown"]')).toBeNull();
  });
});

describe("bare legs under short legwear", () => {
  const skin = SKIN_TONES.find((s) => s.id === DEFAULT_AVATAR.skinTone)!.hex;
  /** Skin-coloured rects below the waist (y ≥ 28, in the figure's own coordinates). */
  function skinLegRects(legwear: string) {
    const svg = render(<Avatar config={{ ...DEFAULT_AVATAR, legwear }} name="Lily" size="xl" />).container;
    return [...svg.querySelectorAll("rect")].filter(
      (r) => r.getAttribute("fill") === skin && Number(r.getAttribute("y")) >= 28,
    );
  }

  it.each(["shorts", "skirt", "battle-kilt"])("shows the legs under %s", (legwear) => {
    expect(skinLegRects(legwear).length).toBeGreaterThan(0);
  });

  it("does not show skin under full-length pants", () => {
    expect(skinLegRects("pants")).toHaveLength(0);
  });
});

describe("flame crest", () => {
  it("is a flame-shaped silhouette in the crest colour, not rows of one-pixel stripes", () => {
    const { container } = render(
      <Avatar config={{ ...DEFAULT_AVATAR, background: "flame", backgroundColor: "#a855f7" }} name="Noah" size="xl" />,
    );
    const crest = container.querySelector('[data-layer="crest"]')!;
    expect(crest.getAttribute("data-crest")).toBe("flame");
    expect([...crest.querySelectorAll("rect")].filter((r) => r.getAttribute("height") === "1")).toHaveLength(0);
    const outline = crest.querySelector("path")!;
    expect(outline.getAttribute("fill")).toBe("#a855f720");
    expect(outline.getAttribute("stroke")).toBe("#a855f740");
  });
});
