import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmLegend } from "./realm-legend";

afterEach(cleanup);

describe("RealmLegend", () => {
  it("names all five verbs on a keyboard, as one legible run of text", () => {
    render(<RealmLegend showStick={false} />);
    // The exact rendered string, not just substrings: JSX collapses a whitespace-only text
    // node across a line break, so "move" and "1-4" can run together into "move1-4" while
    // every `.toContain` check above still passes. Anything that reads the raw text run
    // (a braille display, an AT that concatenates rather than walking the box model, copy-
    // paste, a QA tool) would get that garbled string even though it looks fine on screen,
    // where the key's own `margin-left` supplies the missing space. This assertion is the
    // one that would have caught it.
    expect(screen.getByTestId("realm-legend").textContent).toBe(
      "WASD move 1-4 cast E interact Click cast"
    );
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
