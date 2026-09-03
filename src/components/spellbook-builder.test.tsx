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
    expect(screen.getByText("Log 5 more Reading quests.")).toBeInTheDocument();
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
});
