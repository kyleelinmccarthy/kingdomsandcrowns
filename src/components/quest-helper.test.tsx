import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { drawing, drawingOf } from "@/test/icons";

vi.mock("@/components/send-raven", () => ({ SendRavenDialog: () => null }));

import { QuestHelper } from "./quest-helper";

afterEach(cleanup);

/** Opens the Help guide the way a child does: by pressing the Help medallion. */
async function openGuide(isChildView?: boolean) {
  const user = userEvent.setup();
  render(<QuestHelper isChildView={isChildView} />);
  await user.click(screen.getByRole("button", { name: /Open the guide/ }));
  return screen.getByRole("heading", { name: "Getting around" }).parentElement as HTMLElement;
}

/** The guide's row for one place: its name, its sentence and its icon. */
function row(guide: HTMLElement, label: string): HTMLElement {
  return within(guide).getByText(label, { selector: "span" }).closest("li") as HTMLElement;
}

describe("QuestHelper — the guide to getting around", () => {
  it("shows the Spellbook as the same open book the bar shows", async () => {
    const guide = await openGuide(true);
    expect(drawing(row(guide, "Spellbook").querySelector("svg"))).toBe(drawingOf("book"));
  });
});
