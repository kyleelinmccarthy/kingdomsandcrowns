import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SubjectChip } from "./subject-chip";
import { AREA_LABELS } from "@/lib/utils/skills";

afterEach(cleanup);

describe("SubjectChip", () => {
  it("names the subject in its colour for every area", () => {
    for (const area of ["math", "reading", "language", "science"] as const) {
      const { container } = render(<SubjectChip area={area} />);
      // Queried by the chip's own `data-subject` attribute rather than getByText/getByLabelText:
      // the visible label is combined with a leading sr-only "Subject: " prefix (not an aria-label
      // on the plain span, which ARIA disallows), and a text matcher would also match the render
      // container (same full text content) since the chip is its only child.
      const chip = container.querySelector(`[data-subject="${area}"]`);
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toBe(`Subject: ${AREA_LABELS[area].label}`);
      expect(chip!.getAttribute("style")).toContain(AREA_LABELS[area].color.replace("#", ""));
      cleanup();
    }
    expect(AREA_LABELS).toEqual({
      math: { label: "Math", color: "#3b82f6" },
      reading: { label: "Reading", color: "#22c55e" },
      language: { label: "Language", color: "#a855f7" },
      science: { label: "Science", color: "#f97316" },
    });
  });
});
