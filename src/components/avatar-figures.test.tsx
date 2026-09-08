import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Avatar, AvatarFigure, CompanionFigure, VillagerFigure, MountFigure } from "./avatar";
import { DEFAULT_AVATAR, MOUNTS } from "@/lib/utils/avatar-catalog";
import { VILLAGERS } from "@/lib/realm/villagers";

afterEach(cleanup);
const SHAPES = "rect,path,circle,polygon,ellipse,line";
const config = { ...DEFAULT_AVATAR, companion: "cat", accessory: "cape" };

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
});
