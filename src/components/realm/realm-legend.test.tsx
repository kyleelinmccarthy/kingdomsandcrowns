import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmLegend } from "./realm-legend";

afterEach(cleanup);

describe("RealmLegend", () => {
  it("names all five verbs on a keyboard, as one legible run of text", () => {
    render(<RealmLegend showStick={false} spellPages={4} />);
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
    const { container } = render(<RealmLegend showStick={true} spellPages={4} />);
    expect(container.firstChild).toBeNull();
  });

  it("names the cast keys the ability bar really binds, not a frozen 1-4", () => {
    // From level 10 `spellSlots` gives a hero a fifth page, which the bar draws a `5` keycap
    // for and binds — while this always-on-screen pill went on promising four.
    render(<RealmLegend showStick={false} spellPages={5} />);
    expect(screen.getByTestId("realm-legend").textContent).toBe("WASD move 1-5 cast E interact Click cast");
    cleanup();
    // A single page is not a range.
    render(<RealmLegend showStick={false} spellPages={1} />);
    expect(screen.getByTestId("realm-legend").textContent).toBe("WASD move 1 cast E interact Click cast");
  });

  it("never mentions Space, which the input model no longer has", () => {
    render(<RealmLegend showStick={false} spellPages={4} />);
    expect(screen.getByTestId("realm-legend").textContent).not.toMatch(/space/i);
  });
});
