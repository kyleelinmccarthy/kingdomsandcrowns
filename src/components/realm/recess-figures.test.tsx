import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GleamFigure, BannerFigure } from "./recess-figures";

afterEach(cleanup);

describe("recess figures", () => {
  it("draws a gleam and a banner on the sprite canvas", () => {
    const gleam = render(<GleamFigure />).container.querySelector('svg[data-figure="gleam"]')!;
    expect(gleam.getAttribute("viewBox")).toBe("0 0 36 48");
    expect(gleam.querySelectorAll("path,polygon,circle").length).toBeGreaterThan(0);
    cleanup();
    const banner = render(<BannerFigure />).container.querySelector('svg[data-figure="banner"]')!;
    expect(banner.querySelectorAll("rect,path,polygon").length).toBeGreaterThan(1);
  });
});
