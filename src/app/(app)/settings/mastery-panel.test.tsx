import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MasteryPanel } from "./mastery-panel";
import type { MasteryRow } from "@/lib/actions/deeds";

afterEach(cleanup);

const row = (skillId: string, label: string, area: MasteryRow["area"]): MasteryRow => ({
  skillId, label, area, level: 1, levelLabel: "Learning", lastPracticedAt: null,
});

describe("MasteryPanel", () => {
  it("lists Logic after the four subjects, with its skills", () => {
    render(
      <MasteryPanel
        mastery={[
          row("logic-g23", "Shape grids and balances", "logic"),
          row("add-100", "Addition within 100", "math"),
          row("science-g23", "Science facts", "science"),
        ]}
      />,
    );
    const heads = screen.getAllByText(/^(Math|Science|Logic)$/).map((e) => e.textContent);
    expect(heads).toEqual(["Math", "Science", "Logic"]);
    const logic = screen.getByText("Logic").closest("div")!;
    expect(within(logic).getByText("Shape grids and balances")).toBeInTheDocument();
  });
});
