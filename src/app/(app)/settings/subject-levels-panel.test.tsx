import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const setSubjectOffset = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/learning-profile", () => ({ setSubjectOffset: (...a: unknown[]) => setSubjectOffset(...a) }));

import { SubjectLevelsPanel } from "./subject-levels-panel";

afterEach(() => { cleanup(); setSubjectOffset.mockClear(); });

const props = {
  childId: "c1",
  childGrade: "3" as const,
  estimated: false,
  offsets: { math: 0, reading: 0, language: 0, science: 0 },
};

describe("SubjectLevelsPanel", () => {
  it("shows every strand at grade level, grouped with reading and language arts under ELA", () => {
    render(<SubjectLevelsPanel {...props} />);
    expect(screen.getByText("ELA")).toBeInTheDocument();
    for (const label of ["Math", "Reading", "Language Arts", "Science"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Grade 3 · at grade level")).toHaveLength(4);
  });

  /**
   * getByText, never getByLabelText: the point is that a sighted grown-up can READ what the
   * switch does. An accessible name alone passed the old assertion while the visible row was
   * just a strand name, a gap line, and a bare toggle — so this test exists to fail if the
   * copy ever retreats back into an attribute.
   */
  it("labels every strand's toggle in text a grown-up can actually see", () => {
    render(<SubjectLevelsPanel {...props} />);
    const visible = screen.getAllByText("Not at grade level");
    expect(visible).toHaveLength(4);
    // Each one sits in the same row as its own strand's switch, so no strand is left bare.
    for (const label of ["Math", "Reading", "Language Arts", "Science"]) {
      const row = screen.getByRole("switch", { name: `${label} is not at grade level` }).closest("div")!;
      expect(within(row).getByText("Not at grade level")).toBeInTheDocument();
    }
  });

  it("hides the grade picker until a grown-up says the strand is not at grade level", () => {
    render(<SubjectLevelsPanel {...props} />);
    expect(screen.queryByLabelText("Math level")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /math is not at grade level/i }));
    expect(screen.getByLabelText("Math level")).toBeInTheDocument();
  });

  it("saves the gap, not the grade, so a promotion carries it", () => {
    render(<SubjectLevelsPanel {...props} offsets={{ ...props.offsets, math: 1 }} />);
    fireEvent.change(screen.getByLabelText("Math level"), { target: { value: "5" } });
    expect(setSubjectOffset).toHaveBeenCalledWith("c1", "math", 2);
  });

  it("returns a strand to grade level when the toggle goes off", () => {
    render(<SubjectLevelsPanel {...props} offsets={{ ...props.offsets, reading: -1 }} />);
    fireEvent.click(screen.getByRole("switch", { name: /reading is not at grade level/i }));
    expect(setSubjectOffset).toHaveBeenCalledWith("c1", "reading", 0);
  });

  it("shows the saved value rather than a copy, so switching children cannot write one child's levels onto another", () => {
    const { rerender } = render(<SubjectLevelsPanel {...props} offsets={{ ...props.offsets, math: 1 }} />);
    expect(screen.getByText("Grade 4 · 1 ahead")).toBeInTheDocument();
    rerender(<SubjectLevelsPanel {...props} childId="c2" childGrade="6" offsets={props.offsets} />);
    expect(screen.queryByText("Grade 4 · 1 ahead")).not.toBeInTheDocument();
    expect(screen.getAllByText("Grade 6 · at grade level")).toHaveLength(4);
  });

  it("keeps the other strands' pickers hidden while one strand's save is in flight", () => {
    render(<SubjectLevelsPanel {...props} />);
    fireEvent.click(screen.getByRole("switch", { name: /math is not at grade level/i }));
    expect(screen.getByLabelText("Math level")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reading level")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Language Arts level")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Science level")).not.toBeInTheDocument();
  });

  it("says a grade is estimated when the hero has only a birth year", () => {
    render(<SubjectLevelsPanel {...props} estimated={true} />);
    expect(screen.getByText(/estimated grade 3 from age/i)).toBeInTheDocument();
  });

  it("explains rather than guesses when a hero has neither a grade nor a birth year", () => {
    render(<SubjectLevelsPanel {...props} childGrade={null} />);
    expect(screen.getByText("Subject Levels")).toBeInTheDocument();
    expect(
      screen.getByText(/set a grade or birth year in hero details to unlock subject levels/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("Math")).not.toBeInTheDocument();
  });

  it("never uses a word about the child that a child should not read", () => {
    render(<SubjectLevelsPanel {...props} offsets={{ math: -2, reading: 0, language: 0, science: 0 }} />);
    expect(document.body.textContent).not.toMatch(/struggling|remedial|slow|failing/i);
    cleanup();

    // Also render the estimated-grade path: its "Estimated grade N from age..." copy is
    // only shown when `estimated` is true, so a banned word planted there is invisible
    // to every other test in this file.
    render(
      <SubjectLevelsPanel
        {...props}
        estimated={true}
        offsets={{ math: -2, reading: 0, language: 0, science: 0 }}
      />
    );
    expect(document.body.textContent).not.toMatch(/struggling|remedial|slow|failing/i);
  });
});
