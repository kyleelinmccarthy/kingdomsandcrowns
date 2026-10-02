import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpellbookBuilder } from "./spellbook-builder";
import type { Spellbook } from "@/lib/actions/spells";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const saveSpell = vi.fn().mockResolvedValue({});
const clearSpell = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/spells", () => ({
  saveSpell: (...a: unknown[]) => saveSpell(...a),
  clearSpell: (...a: unknown[]) => clearSpell(...a),
}));

const book: Spellbook = {
  spells: [{ id: "s1", slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }],
  slots: 4,
  level: 1,
  unlocked: ["ember", "tide", "bolt", "orb", "slow"],
  schoolCounts: { element: 0, form: 0, modifier: 0 },
  subjectNamesBySchool: { element: ["Reading"], form: ["Math"], modifier: [] },
};

function renderBuilder() {
  return render(<SpellbookBuilder childId="c1" heroName="Lily" book={book} canEdit={true} />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SpellbookBuilder", () => {
  it("renders a filled page with its name and description", () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveTextContent("Ember Bolt");
    expect(screen.getByText("A bolt of ember.")).toBeInTheDocument();
  });

  it("keeps sealed parts unselectable and shows why", () => {
    renderBuilder();
    const stone = screen.getByRole("button", { name: "Element Stone" });
    expect(stone).toBeDisabled();
    expect(screen.getByText("5 more Reading quests or side quests to go.")).toBeInTheDocument();
  });

  it("says on each open tile what the part does in the Realm", () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: "Element Ember" })).toHaveTextContent("Fiery orange sparks.");
    expect(screen.getByRole("button", { name: "Form Bolt" })).toHaveTextContent("A fast shot that flies at one trouble.");
    expect(screen.getByRole("button", { name: "Modifier Slow" })).toHaveTextContent("Troubles it hits crawl for 2 seconds.");
    expect(screen.getByRole("button", { name: "Modifier None" })).toHaveTextContent("Just the spell, nothing extra.");
  });

  it("says what a sealed part does alongside how to unlock it", () => {
    renderBuilder();
    const stone = screen.getByRole("button", { name: "Element Stone" });
    expect(stone).toHaveTextContent("Tumbling brown pebbles.");
    expect(stone).toHaveTextContent("5 more Reading quests or side quests to go.");
  });

  it("shows what a form costs and what a modifier adds, in mana", () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: "Form Bolt" })).toHaveTextContent("10 mana");
    expect(screen.getByRole("button", { name: "Modifier Slow" })).toHaveTextContent("+5 mana");
    expect(screen.getByRole("button", { name: "Element Ember" })).not.toHaveTextContent("mana");
  });

  it("explains that an element is the spell's look and sound", () => {
    renderBuilder();
    expect(screen.getByText("The element is your spell's color, sparkle and sound.")).toBeInTheDocument();
  });

  it("offers the word bank for the chosen parts", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await user.click(screen.getByRole("button", { name: "Element Tide" }));
    await user.click(screen.getByRole("button", { name: "Form Orb" }));
    expect(screen.getByRole("button", { name: "Adjective Ripple" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Noun Sphere" })).toBeInTheDocument();
  });

  it("saves the chosen parts and name into the selected page", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await user.click(screen.getByRole("button", { name: "Element Tide" }));
    await user.click(screen.getByRole("button", { name: "Form Orb" }));
    await user.click(screen.getByRole("button", { name: "Adjective Ripple" }));
    await user.click(screen.getByRole("button", { name: "Noun Sphere" }));
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    expect(saveSpell).toHaveBeenCalledWith("c1", 2, {
      elementId: "tide",
      formId: "orb",
      modifierId: null,
      adjective: "Ripple",
      noun: "Sphere",
    });
  });

  it("clears a page", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Clear page 1" }));
    expect(clearSpell).toHaveBeenCalledWith("c1", 1);
  });

  it("renders an orphan page beyond the hero's slots as disabled but clearable", async () => {
    const user = userEvent.setup();
    const shrunkBook: Spellbook = {
      ...book,
      spells: [...book.spells, { id: "s5", slot: 5, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }],
    };
    render(<SpellbookBuilder childId="c1" heroName="Lily" book={shrunkBook} canEdit={true} />);

    const page5 = screen.getByRole("button", { name: "Page 5" });
    expect(page5).toBeDisabled();
    expect(page5).toHaveTextContent("Beyond your pages");

    await user.click(screen.getByRole("button", { name: "Clear page 5" }));
    expect(clearSpell).toHaveBeenCalledWith("c1", 5);
  });
});
