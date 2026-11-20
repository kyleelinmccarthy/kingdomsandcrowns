import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TodaySchedule } from "./today-schedule";

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

const subjects = [{ id: "s1", name: "Reading", color: "#ef4444" }];
const blocks = [{ id: "b1", subjectId: "s1", startTime: "09:00", endTime: "09:30" }];
const done = {
  assignment: { id: "a1", status: "completed", notes: null, drawing: null, seal: null, statusReason: null },
  quest: {
    id: "q1", title: "Read a chapter", description: null, estimatedMinutes: null,
    rewardXp: null, rewardDescription: null, rewardAvatarItem: null, requireNotes: false,
  },
  subject: { id: "s1", name: "Reading", color: "#ef4444" },
  rewards: { made: "+1 Ink · the Chronicle Hall needs 3 more", minutes: 5 },
};

describe("TodaySchedule", () => {
  it("shows what a finished quest made, in its time slot and among the unscheduled", () => {
    const unscheduled = { ...done, assignment: { ...done.assignment, id: "a2" }, quest: { ...done.quest, id: "q2", title: "Sing" }, subject: { id: "s2", name: "Music", color: null } };
    render(<TodaySchedule blocks={blocks as never} subjects={subjects as never} assignments={[done, unscheduled]} isChildView realmEnabled />);
    expect(screen.getAllByText(/\+1 Ink/)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Take it to the Realm" })).toHaveLength(2);
    expect(screen.getAllByText("+5 min in the Realm")).toHaveLength(2);
  });

  it("offers no way to the Realm unless the page says it is on", () => {
    render(<TodaySchedule blocks={blocks as never} subjects={subjects as never} assignments={[done]} isChildView />);
    expect(screen.getByText(/\+1 Ink/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Take it to the Realm" })).not.toBeInTheDocument();
  });
});
