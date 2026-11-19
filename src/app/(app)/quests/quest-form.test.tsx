import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuestForm } from "./quest-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/quest-assignments", () => ({
  createAssignment: vi.fn(),
  completeAssignment: vi.fn(),
  getQuestFormData: vi.fn(async () => ({ todayAssignments: [], todaysBlocks: [], latestStatusByQuestId: {}, effectiveMode: "unstructured" })),
  markAssignmentStuck: vi.fn(),
}));

vi.mock("@/hooks/use-quest-timer", () => ({
  useQuestTimer: () => ({ startTimer: vi.fn() }),
}));

afterEach(cleanup);

const subjects = [{ id: "s1", name: "Math", color: "#ef4444" }];

function quest(requireNotes: boolean) {
  return {
    id: "q1",
    subjectId: "s1",
    title: "Garden plan",
    description: null,
    estimatedMinutes: null,
    hasSchedule: false,
    requireNotes,
    sortOrder: 0,
  };
}

function renderForm(requireNotes: boolean) {
  render(
    <QuestForm
      childId="c1"
      subjects={subjects}
      quests={[quest(requireNotes)]}
      todayAssignments={[]}
      today="2026-09-03"
      timeZone="UTC"
    />,
  );
}

describe("QuestForm notes hint", () => {
  it("points a notes-required quest to the quest card's drawing", () => {
    renderForm(true);
    expect(screen.getByPlaceholderText("Write your Scribe's Notes, or draw it from the quest card.")).toBeInTheDocument();
  });

  it("keeps the usual example when notes are optional", () => {
    renderForm(false);
    expect(screen.getByPlaceholderText("e.g. Learned how to multiply fractions")).toBeInTheDocument();
  });
});
