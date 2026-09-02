import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeasonPanel } from "./season-panel";

afterEach(cleanup);

describe("SeasonPanel", () => {
  it("asks for a grade when the hero has none", () => {
    render(<SeasonPanel displayName="Lily" hasGrade={false} open={null} history={[]} />);
    expect(screen.getByText(/set a grade to begin the season/i)).toBeInTheDocument();
  });

  it("shows the open season and explains how it completes", () => {
    render(
      <SeasonPanel
        displayName="Lily"
        hasGrade={true}
        open={{ id: "s2", grade: "4", ordinal: 2, startDate: "2026-08-15", endDate: null, crownId: null }}
        history={[]}
      />
    );
    expect(screen.getByText(/grade 4/i)).toBeInTheDocument();
    expect(screen.getByText("2026–27")).toBeInTheDocument();
    expect(screen.getByText(/moving lily up a grade/i)).toBeInTheDocument();
  });

  it("lists earned crowns in the history", () => {
    render(
      <SeasonPanel
        displayName="Lily"
        hasGrade={true}
        open={null}
        history={[
          { id: "s1", grade: "3", ordinal: 1, startDate: "2025-08-15", endDate: "2026-06-01", crownId: "crown-copper" },
        ]}
      />
    );
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    expect(screen.getByText(/grade 3/i)).toBeInTheDocument();
  });
});
