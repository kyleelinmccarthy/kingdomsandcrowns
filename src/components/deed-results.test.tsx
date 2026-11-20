import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeedResults } from "./deed-results";
import type { RunSummary } from "@/lib/utils/deed-run-types";

afterEach(cleanup);

/** A finished Puzzle practice run: a `world` run earns no star, pays nothing, and belongs to no building. */
const WORLD: RunSummary = {
  correctCount: 2, total: 3, flawless: false, masteryChanges: ["Number cages: getting stronger!"], stars: 0, previousBest: 0, deedBest: 0,
  counted: false, crowned: false, kind: "world", building: null, minutesEarned: 0, sideQuestPayFull: false,
};

describe("DeedResults for Puzzle practice (a world run)", () => {
  it("says the puzzles are solved, how many were right, and what grew, with no stars row and no building", () => {
    const { container } = render(<DeedResults summary={WORLD} deedTitle="Puzzle practice" area="logic" onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Puzzles solved!" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3 right.")).toBeInTheDocument();
    expect(screen.getByText("Number cages: getting stronger!")).toBeInTheDocument();
    // No stars, no pay and no building to show (the button back to the page is the only side-quest word).
    expect(container.textContent).not.toMatch(/stars|New best|try again|built|minute|Side quest done/i);
    expect(screen.queryByRole("img", { name: /stars/ })).toBeNull();
  });

  it("stays Puzzles solved! on a flawless run: there is no Flawless! to chase", () => {
    render(<DeedResults summary={{ ...WORLD, correctCount: 3, flawless: true }} deedTitle="Puzzle practice" area="logic" onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Puzzles solved!" })).toBeInTheDocument();
    expect(screen.queryByText("Flawless!")).toBeNull();
  });
});
