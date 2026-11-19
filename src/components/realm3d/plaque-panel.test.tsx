import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Plaque } from "@/lib/realm/improvements";
import { PlaquePanel } from "./plaque-panel";

afterEach(cleanup);

const plaque = (over: Partial<Plaque> = {}): Plaque => ({
  improvementId: "village-banners", level: 1, label: "Banners", builtBy: "Emma", season: "Autumn 2026", sources: ["Fractions p.12", "Maps"], stars: 3, ...over,
});

const show = (plaques: Plaque[], id = "village-banners", onClose = () => {}) => render(<PlaquePanel improvementId={id} plaques={plaques} onClose={onClose} />);

describe("the plaque panel", () => {
  it("reads who built it, when, and the quests whose work paid for it", () => {
    show([plaque()]);
    expect(screen.getByRole("dialog", { name: "Banners plaque" })).toBeInTheDocument();
    expect(screen.getByText("Banners · built by Emma · Autumn 2026 · from: Fractions p.12, Maps")).toBeInTheDocument();
  });

  it("shows the stars the build run earned", () => {
    show([plaque({ stars: 2 })]);
    expect(screen.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
  });

  it("leaves the season out when it is not known", () => {
    show([plaque({ season: null })]);
    expect(screen.getByText("Banners · built by Emma · from: Fractions p.12, Maps")).toBeInTheDocument();
  });

  it("leaves the quests out when none are known", () => {
    show([plaque({ sources: [] })]);
    expect(screen.getByText("Banners · built by Emma · Autumn 2026")).toBeInTheDocument();
    show([plaque({ sources: [], season: null })]);
    expect(screen.getByText("Banners · built by Emma")).toBeInTheDocument();
  });

  it("lists each built level, oldest first, whichever order they arrive in", () => {
    show([
      plaque({ level: 2, builtBy: "Emma", season: "Winter 2026", sources: ["Spelling"], stars: 1 }),
      plaque({ level: 1, builtBy: "Em", season: "Autumn 2026", sources: ["Maps"], stars: 3 }),
    ]);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Banners · built by Em · Autumn 2026 · from: Maps")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Level 1")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Banners · built by Emma · Winter 2026 · from: Spelling")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("img", { name: "1 of 3 stars" })).toBeInTheDocument();
  });

  it("shows only the plaques of the improvement that was read", () => {
    show([plaque(), plaque({ improvementId: "village-lamps", label: "Lamps", builtBy: "Noah" })]);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/Noah/)).toBeNull();
  });

  it("renders every word as text, never as markup", () => {
    const { container } = show([plaque({ builtBy: "<b>Emma</b>", sources: ["<img src=x onerror=alert(1)>", "a & b"] })]);
    expect(screen.getByText("Banners · built by <b>Emma</b> · Autumn 2026 · from: <img src=x onerror=alert(1)>, a & b")).toBeInTheDocument();
    expect(container.querySelector("b, img[src='x']")).toBeNull();
  });

  it("closes from its button", () => {
    const onClose = vi.fn();
    show([plaque()], "village-banners", onClose);
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says so, kindly, when there is nothing to read", () => {
    show([], "village-banners");
    expect(screen.getByText("Nothing is written here yet.")).toBeInTheDocument();
  });
});
