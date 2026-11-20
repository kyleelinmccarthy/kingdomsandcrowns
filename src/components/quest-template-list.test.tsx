import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/quests", () => ({ deleteQuest: vi.fn() }));
vi.mock("./quest-template-form", () => ({ QuestTemplateForm: () => null }));

import { QuestTemplateList } from "./quest-template-list";

afterEach(cleanup);

const quest = {
  id: "q1",
  title: "Garden survey",
  subjectId: "s1",
  description: null,
  estimatedMinutes: null,
  rewardXp: null,
  rewardDescription: null,
  rewardAvatarItem: null,
  includeInLearningLog: true,
  requireNotes: true,
};

describe("QuestTemplateList", () => {
  it("says a notes-asking quest takes Scribe's Notes or a drawing", () => {
    render(
      <QuestTemplateList
        childId="c1"
        quests={[quest]}
        subjects={[{ id: "s1", name: "Science", color: null }]}
        schoolDays={["mon"]}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTitle("Asks for Scribe's Notes or a drawing")).toBeInTheDocument();
    expect(screen.queryByTitle("Requires Scribe's Notes to complete")).toBeNull();
  });

  describe("hide completed quests", () => {
    afterEach(() => localStorage.clear());
    const props = {
      childId: "c1",
      quests: [quest],
      subjects: [{ id: "s1", name: "Science", color: null }],
      schoolDays: ["mon"],
      timeZone: "UTC",
      assignmentStatusByQuest: { q1: { status: "completed" } },
    } as unknown as Parameters<typeof QuestTemplateList>[0];

    it("hides a completed one-time quest by default", () => {
      render(<QuestTemplateList {...props} />);
      expect(screen.getByRole("checkbox")).toBeChecked();
      expect(screen.queryByText("Garden survey")).toBeNull();
    });

    it("honours a stored choice to show them", () => {
      localStorage.setItem("kingdomsandcrowns-hide-completed-quests", "false");
      render(<QuestTemplateList {...props} />);
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      expect(screen.getByText("Garden survey")).toBeInTheDocument();
    });

    it("stores a toggle and applies it at once", () => {
      render(<QuestTemplateList {...props} />);
      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.getByText("Garden survey")).toBeInTheDocument();
      expect(localStorage.getItem("kingdomsandcrowns-hide-completed-quests")).toBe("false");
    });
  });
});
