import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MakeupQuests } from "./makeup-quests";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/quest-assignments", () => ({
  completeAssignment: vi.fn(),
  markAssignmentStuck: vi.fn(),
  reviseAssignment: vi.fn(),
  skipAssignment: vi.fn(),
  updateAssignmentNotes: vi.fn(),
}));

vi.mock("@/hooks/use-quest-timer", () => ({
  useQuestTimer: () => ({
    activeTimer: null,
    elapsedSeconds: 0,
    isPaused: false,
    startTimer: vi.fn(),
    stopTimer: vi.fn(),
    cancelTimer: vi.fn(),
    pauseTimer: vi.fn(),
    resumeTimer: vi.fn(),
  }),
  formatElapsed: () => "00:00",
}));

afterEach(cleanup);

// 2026-09-04 is a Friday.
const TODAY = "2026-09-04";

const assignment = (id: string, date: string, status = "pending") => ({
  assignment: { id, status, date, notes: null, statusReason: null },
  quest: {
    id: `q-${id}`,
    title: `Quest ${id}`,
    description: null,
    estimatedMinutes: 20,
    rewardXp: null,
    rewardDescription: null,
    rewardAvatarItem: null,
    requireNotes: false,
  },
  subject: { id: "s1", name: "Math", color: "#ef4444" },
});

describe("MakeupQuests", () => {
  it("renders nothing when there is nothing to catch up on", () => {
    const { container } = render(
      <MakeupQuests assignments={[]} today={TODAY} isChildView={true} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists carried-over quests with the day each was owed from", () => {
    render(
      <MakeupQuests
        assignments={[assignment("a1", "2026-09-03"), assignment("a2", "2026-08-31")]}
        today={TODAY}
        isChildView={true}
        reason="always"
      />
    );
    expect(screen.getByText("Catch-Up Quests")).toBeInTheDocument();
    expect(screen.getByText(/From Yesterday/)).toBeInTheDocument();
    expect(screen.getByText(/From Monday/)).toBeInTheDocument();
  });

  it("says it is a make-up day when a parent marked this date", () => {
    render(
      <MakeupQuests
        assignments={[assignment("a1", "2026-09-03")]}
        today={TODAY}
        isChildView={true}
        reason="marked_day"
      />
    );
    expect(screen.getByText(/Today is a make-up day/)).toBeInTheDocument();
  });

  it("tells a grown-up how to take work off the list for good", () => {
    render(
      <MakeupQuests
        assignments={[assignment("a1", "2026-09-03")]}
        today={TODAY}
        isChildView={false}
      />
    );
    expect(screen.getByText("Missed Quests")).toBeInTheDocument();
    expect(screen.getByText(/mark it Not Needed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not Needed" })).toBeInTheDocument();
  });

  it("never locks catch-up work behind today's schedule order", () => {
    // Two quests from different days, both actionable — structured mode orders
    // *today*, and yesterday's leftovers aren't part of today's plan.
    render(
      <MakeupQuests
        assignments={[assignment("a1", "2026-09-03"), assignment("a2", "2026-09-02")]}
        today={TODAY}
        isChildView={true}
      />
    );
    expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(2);
    expect(screen.queryByText(/first/)).not.toBeInTheDocument();
  });
});
