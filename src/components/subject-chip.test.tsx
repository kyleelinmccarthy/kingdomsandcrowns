import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SubjectChip } from "./subject-chip";
import { AREA_LABELS } from "@/lib/utils/skills";

afterEach(cleanup);

describe("SubjectChip", () => {
  it("names the subject in its colour for every area", () => {
    for (const area of ["math", "reading", "language", "science"] as const) {
      render(<SubjectChip area={area} />);
      const chip = screen.getByLabelText(`Subject: ${AREA_LABELS[area].label}`);
      expect(chip.textContent).toBe(AREA_LABELS[area].label);
      expect(chip.getAttribute("style")).toContain(AREA_LABELS[area].color.replace("#", ""));
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
