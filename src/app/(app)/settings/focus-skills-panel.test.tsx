import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setFocusSkills = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/learning-focus", () => ({ setFocusSkills: (...a: unknown[]) => setFocusSkills(...a) }));

import { FocusSkillsPanel, type FocusOption } from "./focus-skills-panel";
import { focusOptions, focusWindow } from "@/lib/utils/focus";

afterEach(() => {
  cleanup();
  setFocusSkills.mockReset().mockResolvedValue(undefined);
  refresh.mockClear();
});

// Deliberately out of area order: the panel owns the order of its groups.
const options: FocusOption[] = [
  { id: "s1", label: "Place value", area: "science", grade: "3" },
  { id: "m1", label: "Add within 10", area: "math", grade: "3" },
  { id: "m2", label: "Subtract within 10", area: "math", grade: "3" },
  { id: "r1", label: "Rhyming words", area: "reading", grade: "3" },
  { id: "l1", label: "Nouns", area: "language", grade: "3" },
  { id: "g1", label: "Shape grids and balances", area: "logic", grade: "2" },
];

function box(label: string) {
  return screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
}

describe("FocusSkillsPanel", () => {
  it("shows the heading and help, with skills grouped under their area labels in order", () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    expect(screen.getByText("Focus this month")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pick up to three skills you're teaching now. Side quests and riddle stones will bring them up more often.",
      ),
    ).toBeInTheDocument();
    const names = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(names).toEqual(["Math", "Reading", "Language Arts", "Science", "Logic"]);
    const logic = screen.getByRole("group", { name: "Logic" });
    expect(within(logic).getByRole("checkbox", { name: "Shape grids and balances" })).toBeInTheDocument();
    const math = screen.getByRole("group", { name: "Math" });
    expect(within(math).getByText("Math")).toBeInTheDocument();
    expect(within(math).getByRole("checkbox", { name: "Add within 10" })).toBeInTheDocument();
    expect(within(math).getByRole("checkbox", { name: "Subtract within 10" })).toBeInTheDocument();
    expect(within(math).queryByRole("checkbox", { name: "Nouns" })).not.toBeInTheDocument();
  });

  it("says where a logic focus is practiced, under logic only", () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    const line = "Practiced in Puzzle practice and, soon, the Realm's locks.";
    expect(within(screen.getByRole("group", { name: "Logic" })).getByText(line)).toBeInTheDocument();
    expect(screen.getAllByText(line)).toHaveLength(1);
  });

  it("starts with the saved picks checked and Save disabled", () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={["m1"]} />);
    expect(box("Add within 10").checked).toBe(true);
    expect(box("Nouns").checked).toBe(false);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("makes a fourth pick impossible: at three, the other boxes are disabled and a note says why", () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    expect(screen.queryByText("Three is the most.")).not.toBeInTheDocument();
    fireEvent.click(box("Add within 10"));
    fireEvent.click(box("Rhyming words"));
    fireEvent.click(box("Nouns"));
    expect(screen.getByText("Three is the most.")).toBeInTheDocument();
    expect(box("Subtract within 10")).toBeDisabled();
    expect(box("Place value")).toBeDisabled();
    // The picked ones stay clickable, so one can be swapped out.
    expect(box("Nouns")).not.toBeDisabled();
    fireEvent.click(box("Subtract within 10"));
    expect(box("Subtract within 10").checked).toBe(false);
    fireEvent.click(box("Nouns"));
    expect(screen.queryByText("Three is the most.")).not.toBeInTheDocument();
    expect(box("Subtract within 10")).not.toBeDisabled();
  });

  it("saves the chosen ids, says Saved., and keeps the selection", async () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    fireEvent.click(box("Rhyming words"));
    fireEvent.click(box("Add within 10"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(setFocusSkills).toHaveBeenCalledWith("c1", ["r1", "m1"]);
    expect(refresh).toHaveBeenCalled();
    expect(box("Rhyming words").checked).toBe(true);
    expect(box("Add within 10").checked).toBe(true);
    // Nothing to save again until something changes.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("can save an empty set after unpicking everything", async () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={["m1"]} />);
    fireEvent.click(box("Add within 10"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(setFocusSkills).toHaveBeenCalledWith("c1", []));
  });

  it("shows the server's message and keeps the selection when saving fails", async () => {
    setFocusSkills.mockRejectedValue(new Error("That skill isn't one this hero can focus on."));
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    fireEvent.click(box("Nouns"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That skill isn't one this hero can focus on."),
    );
    expect(box("Nouns").checked).toBe(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("disables Save while saving", async () => {
    let finish!: () => void;
    setFocusSkills.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    fireEvent.click(box("Nouns"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled());
    finish();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
  });

  it("clears the Saved. note as soon as the selection changes again", async () => {
    render(<FocusSkillsPanel childId="c1" options={options} selected={[]} />);
    fireEvent.click(box("Nouns"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    fireEvent.click(box("Place value"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("names the grade where a label repeats within an area, and only there", () => {
    // A grade-3 hero's window: two "Spelling" pools and two "Science facts" pools, a grade apart.
    const window = focusOptions(focusWindow({ math: "3", reading: "3", language: "3", science: "3" }));
    render(<FocusSkillsPanel childId="c1" options={window} selected={[]} />);
    const language = screen.getByRole("group", { name: "Language Arts" });
    expect(within(language).getByRole("checkbox", { name: "Spelling (Grade 2)" })).toBeInTheDocument();
    expect(within(language).getByRole("checkbox", { name: "Spelling (Grade 4)" })).toBeInTheDocument();
    expect(within(language).getByRole("checkbox", { name: "Spelling and verbs" })).toBeInTheDocument();
    const science = screen.getByRole("group", { name: "Science" });
    expect(within(science).getByRole("checkbox", { name: "Science facts (Grade 2)" })).toBeInTheDocument();
    expect(within(science).getByRole("checkbox", { name: "Science facts (Grade 4)" })).toBeInTheDocument();
    // Unique labels stay as they are.
    const reading = screen.getByRole("group", { name: "Reading" });
    expect(within(reading).getByRole("checkbox", { name: "Sight words" })).toBeInTheDocument();
    expect(within(reading).getByRole("checkbox", { name: "Main idea" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Multiplication facts" })).toBeInTheDocument();
    const names = screen.getAllByRole("checkbox").map((b) => b.closest("label")!.textContent);
    expect(new Set(names).size).toBe(names.length);
  });

  it("says a trail-only skill is played only as reading trails, so a pick with trails off is not a surprise (H3)", () => {
    // A grade-5 hero's reading window holds read-g6 (trail-only) beside read-g4 (multiple choice).
    const window = focusOptions(focusWindow({ reading: "5" }));
    render(<FocusSkillsPanel childId="c1" options={window} selected={[]} />);
    expect(box("Author's purpose and point of view")).toHaveAccessibleDescription(/played only as reading trails/i);
    expect(box("Reading between the lines")).not.toHaveAccessibleDescription(/reading trails/i);
  });

  it("says a rune-only skill is played only as rune spellcraft, beside it and no other", () => {
    // A grade-1 hero's language window holds spell-g1 (rune-only) beside lang-g1 (multiple choice).
    const window = focusOptions(focusWindow({ language: "1" }));
    render(<FocusSkillsPanel childId="c1" options={window} selected={[]} />);
    expect(box("Spelling (Grade 1)")).toHaveAccessibleDescription("Played only as rune spellcraft");
    expect(screen.getAllByText("Played only as rune spellcraft")).toHaveLength(1);
    expect(box("Sentences and word kinds")).not.toHaveAccessibleDescription(/rune/i);
    expect(screen.queryByText(/reading trails/i)).not.toBeInTheDocument();
  });

  it("calls kindergarten by its name", () => {
    const window = focusOptions(focusWindow({ reading: "1" }));
    render(<FocusSkillsPanel childId="c1" options={window} selected={[]} />);
    expect(box("Sight words (Kindergarten)")).toBeInTheDocument();
    expect(box("Sight words (Grade 2)")).toBeInTheDocument();
  });

  it("offers nothing to pick when no skills are in reach", () => {
    render(<FocusSkillsPanel childId="c1" options={[]} selected={[]} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
