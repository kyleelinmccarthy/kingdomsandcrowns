import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TroubleFigure, TROUBLE_KINDS } from "./trouble-figures";

afterEach(cleanup);

describe("TroubleFigure", () => {
  it("draws every kind in both skins with figure attributes", () => {
    for (const kind of TROUBLE_KINDS) {
      for (const skin of ["gentle", "monsters"] as const) {
        const { container } = render(<TroubleFigure kind={kind} skin={skin} />);
        const svg = container.querySelector('svg[data-figure="trouble"]')!;
        expect(svg.getAttribute("data-figure-id")).toBe(`${kind}:${skin}`);
        expect(svg.getAttribute("viewBox")).toBe("0 0 36 48");
        expect(svg.querySelectorAll("rect,path,circle,polygon,ellipse").length).toBeGreaterThan(1);
        cleanup();
      }
    }
  });
});
