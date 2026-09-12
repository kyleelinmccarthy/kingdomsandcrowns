import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SpellBar } from "./spell-bar";
import { resolvePages, withEmptyPages, FADED_PAGE } from "@/lib/realm/spells/pages";

afterEach(cleanup);
const page = (slot: number, elementId = "ember", formId = "bolt") => ({ id: `s${slot}`, slot, elementId, formId, modifierId: null, adjective: "Ember", noun: "Bolt" });
// Slots 4-6 use distinct forms (not the default "bolt") so their mana costs
// don't collide with slot 1's "Ember Bolt, 10 mana" — the fixture's adjective
// and noun are hardcoded to "Ember"/"Bolt" regardless of element/form, so any
// two pages sharing a form would render an identical, ambiguous button label.
const pages = resolvePages([page(1), page(2, "tide", "orb"), page(3, "nope"), page(4, "ember", "burst"), page(5, "ember", "wall"), page(6, "ember", "sprite")], 12);

describe("SpellBar", () => {
  it("lists pages with names and costs, marks the selected one, and dims what the hero cannot afford", () => {
    render(<SpellBar pages={pages} selectedSlot={2} mana={12} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} />);
    const orb = screen.getByRole("button", { name: "Ember Bolt, 15 mana" });
    expect(orb).toHaveAttribute("aria-pressed", "true");
    expect(orb.className).toContain("realm-spell--dim");
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button").length).toBe(6);
  });

  it("casts on tap, casts again on a second tap of the page already selected, and keeps faded pages unselectable", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={1} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }));
    expect(onSelect).toHaveBeenLastCalledWith(2);
    // The page that is already selected: a tap casts it again rather than putting it away, so a
    // thumb and a number key mean the same thing.
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    expect(onSelect).not.toHaveBeenCalledWith(null);
    const faded = screen.getByRole("button", { name: FADED_PAGE });
    expect(faded).toBeDisabled();
  });

  it("casts and selects with number keys, and puts the spell away with Escape", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(window, { key: "3" }); // faded page: ignored
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("casts on a number key instead of only selecting", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("does not toggle a spell off when its key is pressed twice — a second press casts again", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={1} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalledWith(null);
  });

  it("ignores a repeated key and a digit held with a modifier", () => {
    const onSelect = vi.fn();
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    fireEvent.keyDown(window, { key: "2", repeat: true });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });

  it("shows only four pages under fewer choices", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={true} onSelect={() => {}} raised={false} hudScale={1} />);
    expect(screen.getAllByRole("button").length).toBe(4);
  });

  it("under fewer choices, shows the first four saved-spell pages even when they land past page four, never an Empty chip in their place", () => {
    const onSelect = vi.fn();
    const sixPages = withEmptyPages(
      resolvePages([page(1), page(2, "tide", "orb"), page(5, "ember", "wall"), page(6, "ember", "sprite")], 6),
      6
    );
    render(<SpellBar pages={sixPages} selectedSlot={null} mana={100} fewerChoices={true} onSelect={onSelect} raised={false} hudScale={1} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(4);
    expect(buttons.some((b) => b.className.includes("realm-spell--empty"))).toBe(false);
    // Number keys 1-4 map to pages 1, 2, 5, 6 in that order.
    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(window, { key: "3" });
    expect(onSelect).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(window, { key: "4" });
    expect(onSelect).toHaveBeenLastCalledWith(6);
  });

  it("adds the raised class to clear the touch stick", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={() => {}} raised={true} hudScale={1} />);
    expect(screen.getByRole("toolbar", { name: "Spellbook" }).className).toContain("realm-spellbar--raised");
  });

  it("scales the toolbar font size with hudScale", () => {
    render(<SpellBar pages={pages} selectedSlot={null} mana={100} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1.25} />);
    expect(screen.getByRole("toolbar", { name: "Spellbook" })).toHaveStyle({ fontSize: "15px" });
  });

  it("shows an empty page as a dashed chip that opens the Spellbook hint, and skips it for keys", () => {
    const onSelect = vi.fn();
    const withEmpties = withEmptyPages(resolvePages([page(2, "tide", "orb")], 3), 3);
    render(<SpellBar pages={withEmpties} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    const empty = screen.getByRole("button", { name: /^Empty page 1\./ });
    expect(empty.className).toContain("realm-spell--empty");
    // NOT aria-disabled (B10): this chip is the only opener of the hint that explains where
    // spells come from, and its name has to say so, or a screen-reader child is told the one
    // route to that explanation is unavailable.
    expect(empty).not.toHaveAttribute("aria-disabled");
    expect(empty).toHaveAccessibleName("Empty page 1. Make a spell in your Spellbook.");
    expect(empty).toHaveAttribute("title", "Make a spell in your Spellbook");
    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(empty);
    const hint = screen.getByRole("dialog", { name: "Empty page" });
    expect(hint.textContent).toContain("Your spellbook has room. Make a spell to fill this page.");
    expect(screen.getByRole("link", { name: "Open the Spellbook" })).toHaveAttribute("href", "/spellbook");
    fireEvent.keyDown(hint, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Empty page" })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(empty);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Empty page" })).not.toBeInTheDocument();
  });

  it("returns focus to the empty page button that opened the hint, on both Close and Escape", () => {
    const withEmpties = withEmptyPages(resolvePages([page(2, "tide", "orb")], 3), 3);
    render(<SpellBar pages={withEmpties} selectedSlot={null} mana={100} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} />);
    const empty = screen.getByRole("button", { name: /^Empty page 1\./ });
    fireEvent.click(empty);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(empty).toHaveFocus();
    fireEvent.click(empty);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Empty page" }), { key: "Escape" });
    expect(empty).toHaveFocus();
  });

  it("marks only the selected slot refused, so the shake lands on the spell that cost too much", () => {
    render(<SpellBar pages={pages} selectedSlot={2} mana={4} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} refused={true} />);
    expect(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }).className).toContain("realm-spell--refused");
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }).className).not.toContain("realm-spell--refused");
    cleanup();
    render(<SpellBar pages={pages} selectedSlot={2} mana={4} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} refused={false} />);
    expect(screen.getByRole("button", { name: "Ember Bolt, 15 mana" }).className).not.toContain("realm-spell--refused");
    cleanup();
    // A refusal with nothing selected — a cast the hero could not pay for, put away before the
    // refusal landed —
    // marks no slot at all; the pip strip still carries the red on its own.
    render(<SpellBar pages={pages} selectedSlot={null} mana={4} fewerChoices={false} onSelect={() => {}} raised={false} hudScale={1} refused={true} />);
    expect(document.querySelectorAll(".realm-spell--refused")).toHaveLength(0);
  });
});
