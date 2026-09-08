import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SpellBar } from "./spell-bar";
import { resolvePages, FADED_PAGE } from "@/lib/realm/spells/pages";

afterEach(cleanup);
const page = (slot: number, elementId = "ember", formId = "bolt") => ({ id: `s${slot}`, slot, elementId, formId, modifierId: null, adjective: "Ember", noun: "Bolt" });
// Slots 3-5 use distinct forms (not the default "bolt") so their mana costs
// don't collide with slot 0's "Ember Bolt, 10 mana" — the fixture's adjective
// and noun are hardcoded to "Ember"/"Bolt" regardless of element/form, so any
// two pages sharing a form would render an identical, ambiguous button label.
const pages = resolvePages([page(0), page(1, "tide", "orb"), page(2, "nope"), page(3, "ember", "burst"), page(4, "ember", "wall"), page(5, "ember", "sprite")], 12);

describe("SpellBar", () => {
  it("lists pages with names and costs, marks the selected one, and dims what the hero cannot afford", () => {
    render(<SpellBar pages={pages} selectedSlot={1} mana={12} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} />);
    const orb = screen.getByRole("button", { name: "Ember Bolt, 15 mana" });
    expect(orb).toHaveAttribute("aria-pressed", "true");
    expect(orb.className).toContain("realm-spell--dim");
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button").length).toBe(6);
  });

  it("selects on tap, deselects on a second tap, and keeps faded pages unselectable", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={0} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    const faded = screen.getByRole("button", { name: FADED_PAGE });
    expect(faded).toBeDisabled();
  });

  it("selects with number keys and deselects with Escape", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: "3" }); // faded page: ignored
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("ignores a repeated key and a digit held with a modifier", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.keyDown(window, { key: "2", repeat: true });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  it("shows only four pages under fewer choices", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={true} onSelect={() => {}} raised={false} hudScale={1} />);
    expect(screen.getAllByRole("button").length).toBe(4);
  });

  it("adds the raised class to clear the touch stick", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={() => {}} raised={true} hudScale={1} />);
    expect(screen.getByRole("toolbar", { name: "Spellbook" }).className).toContain("realm-spellbar--raised");
  });

  it("scales the toolbar font size with hudScale", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1.25} />);
    expect(screen.getByRole("toolbar", { name: "Spellbook" })).toHaveStyle({ fontSize: "15px" });
  });
});
