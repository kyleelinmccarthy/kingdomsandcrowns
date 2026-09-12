import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmMinimap } from "./realm-minimap";
import type { MinimapView } from "@/lib/realm/minimap";

afterEach(cleanup);

const view: MinimapView = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  hero: { x: 0.5, y: 0.5, angle: 0 },
  dots: [
    { id: "well", kind: "site", x: 0.25, y: 0.25, filled: false },
    { id: "mill", kind: "site", x: 0.75, y: 0.25, filled: true },
    { id: "bridge", kind: "objective", x: 0.5, y: 0.9, filled: false },
    { id: "t1", kind: "trouble", x: 0.1, y: 0.8, filled: true },
  ],
};

describe("RealmMinimap", () => {
  it("draws one mark per dot plus the hero", () => {
    const { container } = render(<RealmMinimap view={view} />);
    expect(container.querySelectorAll(".realm-minimap-site")).toHaveLength(2);
    expect(container.querySelectorAll(".realm-minimap-dot")).toHaveLength(1);
    expect(container.querySelectorAll(".realm-minimap-hero")).toHaveLength(1);
  });

  it("names itself for a screen reader without using the word depth", () => {
    render(<RealmMinimap view={view} />);
    const map = screen.getByRole("img", { name: /map/i });
    expect(map).toBeInTheDocument();
    expect(map.getAttribute("aria-label")).not.toMatch(/depth|simple mode|advanced/i);
  });

  it("is inert: nothing inside it is focusable or clickable", () => {
    const { container } = render(<RealmMinimap view={view} />);
    expect(container.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    expect(getComputedStyle(container.firstElementChild as Element).pointerEvents).not.toBe("auto");
  });

  it("renders with no dots at all rather than throwing", () => {
    const { container } = render(<RealmMinimap view={{ ...view, dots: [] }} />);
    expect(container.querySelector(".realm-minimap-hero")).toBeInTheDocument();
  });
});
