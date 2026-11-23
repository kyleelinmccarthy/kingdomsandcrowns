import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MapMark } from "@/lib/realm3d/hud-bus";
import { NO_GOAL } from "@/lib/realm3d/guide";
import { glyphScaleFor, headingDegrees, MAP_WINDOW } from "@/lib/realm3d/minimap";
import { WORLD_HALF, type Landmark, type RealmWorld } from "@/lib/realm3d/worldgen";
import { WORLD_MAP_GLYPH, WorldMap } from "./world-map";

/** A stand-in island: the map asks a world for its landmarks, its roads and one biome per baked cell. */
const landmarks: Landmark[] = [
  { id: "summit-1", name: "Cloudfoot", line: "The whole realm, from up here.", position: { x: 40, z: -60 }, y: 40, radius: 15, biome: "crag", kind: "summit" },
  { id: "cove-1", name: "Gullbay", line: "A curve of sand.", position: { x: -120, z: 30 }, y: -4, radius: 12, biome: "shore", kind: "cove" },
];
const world = {
  landmarks,
  roads: [{ id: "road-1", from: "summit-1", to: "cove-1", points: [{ x: 0, z: 0 }, { x: 40, z: -60 }], halfWidth: 1.9 }],
  biomeAt: () => "meadow" as const,
  heightAt: () => 0,
} as unknown as RealmWorld;

afterEach(cleanup);
// jsdom has no 2D canvas: the land bake says "no context" and the map draws without it.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});

function mount(over: Partial<React.ComponentProps<typeof WorldMap>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <WorldMap world={world} found={new Set(["cove-1"])} castle goal={NO_GOAL} marks={[]} hero={{ x: 12, z: -34, facing: 0 }} onClose={onClose} {...over} />,
  );
  return { view, onClose };
}

describe("the big map", () => {
  it("is a dialog named for what it is", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Map of the island" })).toBeInTheDocument();
  });

  it("shows the whole island, north up", () => {
    const { view } = mount();
    const svg = view.container.querySelector(".r3-worldmap-frame svg")!;
    expect(svg.getAttribute("viewBox")).toBe(`${-WORLD_HALF} ${-WORLD_HALF} ${2 * WORLD_HALF} ${2 * WORLD_HALF}`);
  });

  it("lists the places found by name for a screen reader, and keeps the unfound ones secret", () => {
    mount();
    const list = screen.getByRole("list", { name: "Places found" });
    expect(within(list).getByText("Gullbay")).toBeInTheDocument();
    expect(within(list).queryByText("Cloudfoot")).toBeNull();
  });

  it("draws every place, hollow until found, as the corner map does", () => {
    const { view } = mount();
    expect(view.container.querySelectorAll(".r3-map-place")).toHaveLength(2);
    expect(view.container.querySelectorAll(".r3-map-place--found")).toHaveLength(1);
  });

  it("draws the marks the features handed it, where they stand", () => {
    const marks: MapMark[] = [
      { id: "trouble-0", x: 70, z: 90, kind: "trouble", label: "Fog" },
      { id: "ring-arch", x: -10, z: 5, kind: "ring", label: "The Ring" },
    ];
    const { view } = mount({ marks });
    const trouble = view.container.querySelector('[data-mark="trouble-0"]')!;
    expect(trouble).not.toBeNull();
    expect(trouble.getAttribute("transform")).toContain("translate(70 90)");
    expect(view.container.querySelector('[data-mark="ring-arch"]')).not.toBeNull();
  });

  it("puts the hero's arrow where they stand, turned the way they face", () => {
    const facing = Math.PI / 2;
    const { view } = mount({ hero: { x: 12, z: -34, facing } });
    const you = view.container.querySelector(".r3-worldmap-you")!;
    const transform = you.getAttribute("transform")!;
    expect(transform).toContain("translate(12 -34)");
    expect(transform).toContain(`rotate(${headingDegrees(facing)})`);
  });

  it("draws glyphs bigger than the minimap's but well under the full-island rule, so the village stays readable", () => {
    expect(WORLD_MAP_GLYPH).toBeCloseTo(glyphScaleFor(2 * WORLD_HALF) * 0.5);
    expect(WORLD_MAP_GLYPH).toBeGreaterThan(glyphScaleFor(MAP_WINDOW));
    const { view } = mount({ marks: [{ id: "trouble-0", x: 0, z: 0, kind: "trouble", label: "Fog" }] });
    expect(view.container.querySelector(".r3-worldmap-you")!.getAttribute("transform")).toContain(`scale(${WORLD_MAP_GLYPH})`);
    expect(view.container.querySelector('[data-mark="trouble-0"]')!.getAttribute("transform")).toContain(`scale(${WORLD_MAP_GLYPH})`);
    expect(view.container.querySelector(".r3-map-place")!.parentElement!.getAttribute("transform")).toContain(`scale(${WORLD_MAP_GLYPH})`);
  });

  it("closes from its own button", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Close the map" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
