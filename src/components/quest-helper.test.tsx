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

/** The places listed inside a group's row, each as its name and sentence run together. */
function inside(groupRow: HTMLElement): string[] {
  return within(groupRow).getAllByRole("listitem").map((item) => item.textContent ?? "");
}

describe("QuestHelper — the guide to getting around", () => {
  it("shows the Spellbook as the same open book the bar shows", async () => {
    const guide = await openGuide(true);
    expect(drawing(row(guide, "Spellbook").querySelector("svg"))).toBe(drawingOf("book"));
  });

  it("walks the bar in order, naming Quests and Rewards as menus", async () => {
    const guide = await openGuide(true);
    // The guide's first list is the bar; its direct children are the top-level places (nested lists hold a group's members).
    const bar = within(guide).getAllByRole("list")[0];
    const topLevel = within(bar).getAllByRole("listitem").filter((item) => item.parentElement === bar);
    expect(topLevel.map((item) => item.querySelector("span span")?.textContent)).toEqual([
      "Tavern",
      "Quests",
      "Spellbook",
      "Realm",
      "Rewards",
      "Schedule",
    ]);
  });

  it("lists a hero's Quest Log and Side Quests under Quests, and never Quest Giver", async () => {
    const guide = await openGuide(true);
    expect(inside(row(guide, "Quests"))).toEqual([
      expect.stringMatching(/^Quest Log/),
      expect.stringMatching(/^Side Quests/),
    ]);
    expect(within(guide).queryByText("Quest Giver")).not.toBeInTheDocument();
  });

  it("lists Quest Giver first under Quests for a grown-up", async () => {
    const guide = await openGuide(false);
    expect(inside(row(guide, "Quests"))).toEqual([
      expect.stringMatching(/^Quest Giver/),
      expect.stringMatching(/^Quest Log/),
      expect.stringMatching(/^Side Quests/),
    ]);
  });

  it("lists Loot and Ranks under Rewards", async () => {
    const guide = await openGuide(true);
    expect(inside(row(guide, "Rewards"))).toEqual([expect.stringMatching(/^Loot/), expect.stringMatching(/^Ranks/)]);
  });
});
