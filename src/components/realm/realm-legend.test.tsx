import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmLegend } from "./realm-legend";

afterEach(cleanup);

describe("RealmLegend", () => {
  it("names all five verbs on a keyboard", () => {
    render(<RealmLegend showStick={false} />);
    const text = screen.getByTestId("realm-legend").textContent ?? "";
    for (const bit of ["WASD", "1-4", "E", "Click"]) expect(text).toContain(bit);
  });

  it("shows nothing on touch, where those keys do not exist", () => {
    const { container } = render(<RealmLegend showStick={true} />);
    expect(container.firstChild).toBeNull();
  });

  it("never mentions Space, which the input model no longer has", () => {
    render(<RealmLegend showStick={false} />);
    expect(screen.getByTestId("realm-legend").textContent).not.toMatch(/space/i);
  });
});
