import { describe, it, expect, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import { RealmMinimap } from "./realm-minimap";
import type { MinimapView } from "@/lib/realm/minimap";

afterEach(cleanup);

/** Let a MutationObserver callback run: it is a microtask, not a frame. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const fits: MinimapView["frame"] = { follows: false, x: { min: 0, max: 1 }, y: { min: 0, max: 1 } };
/** A world twice as wide as the window on both axes: the map is a window that pans. */
const window2: MinimapView["frame"] = { follows: true, x: { min: -0.5, max: 1.5 }, y: { min: -0.5, max: 1.5 } };

const view: MinimapView = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  frame: fits,
  hero: { x: 0.5, y: 0.5, angle: 0 },
  areas: [
    { id: "path-1", kind: "trail", shape: "rect", x: 0.5, y: 0.4, w: 0.05, h: 0.05 },
    { id: "pond", kind: "water", shape: "rect", x: 0.2, y: 0.2, w: 0.2, h: 0.1 },
    { id: "decor-1", kind: "forest", shape: "blob", x: 0.8, y: 0.8, w: 0.1, h: 0.1 },
  ],
  marks: [
    { id: "castle", kind: "castle", x: 0.5, y: 0.1, filled: true },
    { id: "well", kind: "site", x: 0.25, y: 0.25, filled: false },
    { id: "mill", kind: "site", x: 0.75, y: 0.25, filled: true },
    { id: "bridge", kind: "objective", x: 0.5, y: 0.9, filled: false },
    { id: "t1", kind: "trouble", x: 0.1, y: 0.8, filled: true },
  ],
  home: { x: 0.5, y: 0.1 },
  goal: { x: 0.5, y: 0.9 },
};

const rotationOf = (el: Element | null) => Number(/rotate\(\s*(-?[\d.]+)/.exec(el?.getAttribute("transform") ?? "")?.[1] ?? NaN);
const translateOf = (el: Element | null) => {
  const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(el?.getAttribute("transform") ?? "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

describe("RealmMinimap", () => {
  it("draws the land as shapes, not as more dots", () => {
    const { container } = render(<RealmMinimap view={view} />);
    expect(container.querySelectorAll(".realm-minimap-land")).toHaveLength(3);
    expect(container.querySelector(".realm-minimap-land--water")).not.toBeNull();
    expect(container.querySelector(".realm-minimap-land--trail")).not.toBeNull();
    // A wood is a blob, water and roads are shaped to their footprint.
    expect(container.querySelector(".realm-minimap-land--forest")?.tagName.toLowerCase()).toBe("circle");
    expect(container.querySelector(".realm-minimap-land--water")?.tagName.toLowerCase()).toBe("rect");
    // ...and the world's own extent is drawn, so a child can see where the world stops.
    expect(container.querySelector(".realm-minimap-ground")).not.toBeNull();
    expect(container.querySelector(".realm-minimap-void")).not.toBeNull();
  });

  it("gives each kind its own silhouette rather than four identical squares", () => {
    const { container } = render(<RealmMinimap view={view} />);
    const shape = (cls: string) => container.querySelector(cls)?.getAttribute("d");
    const shapes = [".realm-minimap-castle", ".realm-minimap-objective", ".realm-minimap-site", ".realm-minimap-trouble"].map(shape);
    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(4);
    expect(container.querySelectorAll(".realm-minimap-site")).toHaveLength(2);
    expect(container.querySelector(".realm-minimap-site--raised")).not.toBeNull(); // the built one, filled
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

  it("renders with nothing on it at all rather than throwing", () => {
    const { container } = render(<RealmMinimap view={{ ...view, areas: [], marks: [], home: null, goal: null }} />);
    expect(container.querySelector(".realm-minimap-hero")).toBeInTheDocument();
    expect(container.querySelector(".realm-minimap-you")).toBeInTheDocument();
  });

  it("turns the hero's arrow the way the hero walks: the map's east, not the ground ring's", () => {
    // `view.hero.angle` is the scene's own angle, written for the ring that lies on the
    // ground. On a map that angle mirrors east and west, so the drawn arrow is its negative.
    const east = { ...view, hero: { x: 0.5, y: 0.5, angle: -Math.PI / 2 } };
    const { container } = render(<RealmMinimap view={east} />);
    expect(rotationOf(container.querySelector(".realm-minimap-hero"))).toBeCloseTo(-90, 6);
    expect(rotationOf(container.querySelector(".realm-minimap-you"))).toBeCloseTo(90, 6);
  });

  it("leaves the carrier to the scene and draws from it: the hero the child sees is this file's", async () => {
    const ref = createRef<SVGGElement>();
    const { container } = render(<RealmMinimap view={view} heroRef={ref} />);
    await settle();
    act(() => {
      ref.current!.setAttribute("transform", "translate(30 70) rotate(-90)");
    });
    await settle();
    // The scene's element is untouched...
    expect(ref.current!.getAttribute("transform")).toBe("translate(30 70) rotate(-90)");
    // ...and the visible hero followed it, turned the map's way.
    const you = container.querySelector(".realm-minimap-you");
    expect(translateOf(you)).toEqual({ x: 30, y: 70 });
    expect(rotationOf(you)).toBeCloseTo(90, 6);
  });

  it("never moves a map that holds the whole world", async () => {
    const ref = createRef<SVGGElement>();
    const { container } = render(<RealmMinimap view={view} heroRef={ref} />);
    await settle();
    act(() => {
      ref.current!.setAttribute("transform", "translate(90 10) rotate(0)");
    });
    await settle();
    expect(translateOf(ref.current!.parentElement)).toEqual({ x: 0, y: 0 });
  });

  it("pans with the hero once the world is bigger than the map, and holds at the world's edge", async () => {
    const ref = createRef<SVGGElement>();
    const big = { ...view, frame: window2, hero: { x: 0.5, y: 0.5, angle: 0 } };
    render(<RealmMinimap view={big} heroRef={ref} />);
    await settle();
    act(() => {
      ref.current!.setAttribute("transform", "translate(90 50) rotate(0)"); // 0.9 of the way east
    });
    await settle();
    const panned = translateOf(ref.current!.parentElement)!;
    expect(panned.x).toBeCloseTo(-40, 6); // the hero is put back at the map's centre
    expect(panned.y).toBeCloseTo(0, 6);
    act(() => {
      ref.current!.setAttribute("transform", "translate(-45 50) rotate(0)"); // the far west edge of the world
    });
    await settle();
    expect(translateOf(ref.current!.parentElement)!.x).toBeCloseTo(50, 6); // held: the world's edge is the map's edge
  });

  it("keeps home and the objective off the rim while they are on the map", () => {
    const { container } = render(<RealmMinimap view={view} />);
    expect((container.querySelector(".realm-minimap-rim--home") as SVGGElement).style.display).toBe("none");
    expect((container.querySelector(".realm-minimap-rim--goal") as SVGGElement).style.display).toBe("none");
  });

  it("pins home to the rim, pointing at it, once the hero walks off the edge of it", async () => {
    const ref = createRef<SVGGElement>();
    const big = { ...view, frame: window2, home: { x: 0.5, y: 0.5 }, hero: { x: 0.5, y: 0.5, angle: 0 } };
    const { container } = render(<RealmMinimap view={big} heroRef={ref} />);
    await settle();
    const home = container.querySelector(".realm-minimap-rim--home") as SVGGElement;
    expect(home.style.display).toBe("none"); // standing on it
    act(() => {
      ref.current!.setAttribute("transform", "translate(50 140) rotate(0)"); // a long way south of home
    });
    await settle();
    expect(home.style.display).not.toBe("none");
    expect(rotationOf(home)).toBeCloseTo(0, 6); // home is due north: the arrow points up
    expect(translateOf(home)!.y).toBeLessThan(20); // ...and sits on the map's north rim
  });
});
