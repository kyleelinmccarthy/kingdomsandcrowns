import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CastleFigure, BuildingFigure, FoundationFigure, DecorFigure, CASTLE_TIERS, DECOR_KINDS, WORLD_SPRITE_SCALE } from "./world-figures";
import { BUILDINGS } from "@/lib/utils/kingdom";

afterEach(cleanup);

/** Every drawn number must sit inside the 64×64 canvas. */
function assertInside(svg: SVGSVGElement) {
  expect(svg.getAttribute("viewBox")).toBe("0 0 64 64");
  for (const r of svg.querySelectorAll("rect")) {
    const x = Number(r.getAttribute("x")), y = Number(r.getAttribute("y")), w = Number(r.getAttribute("width")), h = Number(r.getAttribute("height"));
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(64); expect(y + h).toBeLessThanOrEqual(64);
  }
  for (const p of svg.querySelectorAll("polygon")) {
    for (const n of (p.getAttribute("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number)) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(64); }
  }
  for (const c of svg.querySelectorAll("circle, ellipse")) {
    const cx = Number(c.getAttribute("cx")), cy = Number(c.getAttribute("cy"));
    const rx = Number(c.getAttribute("r") ?? c.getAttribute("rx")), ry = Number(c.getAttribute("r") ?? c.getAttribute("ry"));
    expect(cx - rx).toBeGreaterThanOrEqual(0); expect(cx + rx).toBeLessThanOrEqual(64); expect(cy - ry).toBeGreaterThanOrEqual(0); expect(cy + ry).toBeLessThanOrEqual(64);
  }
  expect(svg.querySelectorAll("rect, polygon, circle, ellipse").length).toBeGreaterThanOrEqual(3);
}

describe("world figures", () => {
  it("draws every castle tier inside the canvas with its ids", () => {
    expect(CASTLE_TIERS).toEqual(["campsite", "cottage", "watchtower", "keep", "manor", "castle", "fortress", "citadel"]);
    for (const tier of CASTLE_TIERS) {
      const { container } = render(<CastleFigure tier={tier} />);
      const svg = container.querySelector<SVGSVGElement>(`svg[data-figure="castle"][data-figure-id="${tier}"]`)!;
      expect(svg).not.toBeNull();
      assertInside(svg);
      cleanup();
    }
  });
  it("draws every kingdom building", () => {
    for (const b of BUILDINGS) {
      const { container } = render(<BuildingFigure id={b.id} />);
      const svg = container.querySelector<SVGSVGElement>(`svg[data-figure="building"][data-figure-id="${b.id}"]`)!;
      expect(svg).not.toBeNull();
      assertInside(svg);
      cleanup();
    }
  });
  it("draws the foundation and every decoration", () => {
    const { container } = render(<FoundationFigure />);
    assertInside(container.querySelector<SVGSVGElement>('svg[data-figure="foundation"]')!);
    cleanup();
    expect(DECOR_KINDS).toEqual(["oak", "pine", "bush", "rock", "fence", "lantern"]);
    for (const kind of DECOR_KINDS) {
      const { container: c } = render(<DecorFigure kind={kind} />);
      assertInside(c.querySelector<SVGSVGElement>(`svg[data-figure="decor"][data-figure-id="${kind}"]`)!);
      cleanup();
    }
    expect(WORLD_SPRITE_SCALE).toEqual({ castle: 8, building: 6, foundation: 4, decor: 4 });
  });
});
