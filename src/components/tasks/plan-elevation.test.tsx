import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IMPROVEMENTS, IMPROVEMENT_COLORS, planElevation, type ImprovementId } from "@/lib/realm/improvements";
import { piecesLaid } from "@/lib/realm3d/bench-pieces";
import type { BenchSite } from "@/components/use-deed-flow";
import { PlanElevation } from "./plan-elevation";

afterEach(cleanup);

const site = (improvementId: ImprovementId, level: number, solved: number, benchTasks = 3): BenchSite => ({
  stage: 0, complete: false, solved, benchTasks, plan: { improvementId, level },
});
const drawing = () => screen.getByRole("img", { name: /going up$/ });
const laid = () => drawing().querySelectorAll("[data-laid]").length;
const base = () => drawing().querySelectorAll("[data-base]").length;

describe("PlanElevation", () => {
  it("is named for the plan and its level", () => {
    render(<PlanElevation site={site("well-house", 1, 0)} calm={false} />);
    expect(drawing().getAttribute("aria-label")).toBe("The Well House, level 1, going up");
    cleanup();
    render(<PlanElevation site={site("village-banners", 3, 0)} calm={false} />);
    expect(drawing().getAttribute("aria-label")).toBe("The Banners, level 3, going up");
  });

  it("before any right answer lays nothing, and promises only what is true", () => {
    render(<PlanElevation site={site("well-house", 1, 0)} calm={false} />);
    expect(laid()).toBe(0);
    expect(screen.getByText("Right answers raise the next part.")).toBeTruthy();
  });

  it("lays more of this level's boxes as answers come right, paced over the run's bench tasks", () => {
    const added = planElevation("well-house", 1).added.length;
    expect(added).toBeGreaterThan(3);
    const seen: number[] = [];
    for (const solved of [0, 1, 2, 3]) {
      render(<PlanElevation site={site("well-house", 1, solved)} calm={false} />);
      seen.push(laid());
      expect(laid()).toBe(piecesLaid(solved, 3, added));
      cleanup();
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(4);
    expect(seen[3]).toBe(added);
  });

  it("never lays more than the level adds", () => {
    const added = planElevation("village-statue", 1).added.length;
    render(<PlanElevation site={site("village-statue", 1, 9)} calm={false} />);
    expect(laid()).toBe(added);
  });

  it("draws the earlier levels as already standing, and a first level has none", () => {
    render(<PlanElevation site={site("village-banners", 2, 0)} calm={false} />);
    expect(base()).toBe(planElevation("village-banners", 2).base.length);
    expect(base()).toBeGreaterThan(0);
    cleanup();
    render(<PlanElevation site={site("village-banners", 1, 0)} calm={false} />);
    expect(base()).toBe(0);
  });

  it("lays the added boxes from the ground up, flipped into the picture, in the plan's own colours", () => {
    const added = planElevation("well-house", 1).added;
    render(<PlanElevation site={site("well-house", 1, 3)} calm={false} />);
    const rects = [...drawing().querySelectorAll("[data-laid]")];
    expect(rects).toHaveLength(added.length);
    const bottoms = rects.map((r) => Number(r.getAttribute("y")) + Number(r.getAttribute("height")));
    // Lower boxes are laid first: their bottoms sit lower in the picture (a larger y), never rising as the order goes on.
    for (let i = 1; i < bottoms.length; i += 1) expect(bottoms[i]).toBeLessThanOrEqual(bottoms[i - 1] + 1e-6);
    const colours = new Set(rects.map((r) => r.getAttribute("fill")));
    for (const c of colours) expect(Object.values(IMPROVEMENT_COLORS)).toContain(c);
  });

  it("fits every box, base and added, inside its picture", () => {
    for (const id of Object.keys(IMPROVEMENTS) as ImprovementId[]) {
      for (const level of [1, 2, 3]) {
        render(<PlanElevation site={site(id, level, 3)} calm={false} />);
        const [x0, y0, w, h] = drawing().getAttribute("viewBox")!.split(" ").map(Number);
        for (const r of drawing().querySelectorAll("rect")) {
          const x = Number(r.getAttribute("x"));
          const y = Number(r.getAttribute("y"));
          expect(x, `${id} ${level}`).toBeGreaterThanOrEqual(x0 - 1e-6);
          expect(y, `${id} ${level}`).toBeGreaterThanOrEqual(y0 - 1e-6);
          expect(x + Number(r.getAttribute("width"))).toBeLessThanOrEqual(x0 + w + 1e-6);
          expect(y + Number(r.getAttribute("height"))).toBeLessThanOrEqual(y0 + h + 1e-6);
        }
        cleanup();
      }
    }
  });

  it("drops in what the latest right answer laid, and keeps it still in calm play", () => {
    render(<PlanElevation site={site("well-house", 1, 1)} calm={false} />);
    expect(drawing().querySelectorAll(".bench-piece--drop").length).toBe(laid());
    cleanup();
    render(<PlanElevation site={site("well-house", 1, 1)} calm />);
    expect(drawing().querySelectorAll(".bench-piece--drop")).toHaveLength(0);
  });

  it("names the part that went in, once there is one", () => {
    render(<PlanElevation site={site("well-house", 1, 3)} calm={false} />);
    expect(screen.getByText(/in place/)).toBeTruthy();
  });

  it("draws nothing for a site that is no plan's", () => {
    const { container } = render(<PlanElevation site={{ stage: 1, complete: false, solved: 1, benchTasks: 3 }} calm={false} />);
    expect(container.firstChild).toBeNull();
  });
});
