import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestAssignmentCard } from "./quest-assignment-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/quest-assignments", () => ({
  completeAssignment: vi.fn().mockResolvedValue({ activityId: "a1" }),
  markAssignmentStuck: vi.fn().mockResolvedValue(undefined),
  reviseAssignment: vi.fn().mockResolvedValue(undefined),
  skipAssignment: vi.fn().mockResolvedValue(undefined),
  updateAssignmentNotes: vi.fn().mockResolvedValue(undefined),
}));

import {
  markAssignmentStuck,
  reviseAssignment,
  skipAssignment,
  updateAssignmentNotes,
} from "@/lib/actions/quest-assignments";

vi.mock("@/hooks/use-quest-timer", () => ({
  useQuestTimer: () => mockTimerHook,
  formatElapsed: (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  },
}));

let mockTimerHook: {
  activeTimer: { assignmentId: string; startedAt: number } | null;
  elapsedSeconds: number;
  startTimer: ReturnType<typeof vi.fn>;
  stopTimer: ReturnType<typeof vi.fn>;
  cancelTimer: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.mocked(skipAssignment).mockClear();
  vi.mocked(updateAssignmentNotes).mockClear();
  vi.mocked(markAssignmentStuck).mockClear();
  vi.mocked(reviseAssignment).mockClear();
  mockTimerHook = {
    activeTimer: null,
    elapsedSeconds: 0,
    startTimer: vi.fn(),
    stopTimer: vi.fn().mockReturnValue({
      startedAt: new Date(),
      endedAt: new Date(),
      durationMinutes: 5,
    }),
    cancelTimer: vi.fn(),
  };
});

afterEach(cleanup);

const baseData = {
  assignment: { id: "qa1", status: "pending", notes: null, statusReason: null },
  quest: { id: "q1", title: "Read Chapter 5", description: "Pages 50-75", estimatedMinutes: 30, rewardXp: null, rewardDescription: null, rewardAvatarItem: null, requireNotes: false },
  subject: { id: "s1", name: "Math", color: "#ef4444" },
};

describe("QuestAssignmentCard", () => {
  it("renders quest title and details for pending assignment", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={false} />);
    expect(screen.getByText("Read Chapter 5")).toBeInTheDocument();
    expect(screen.getByText("Pages 50-75")).toBeInTheDocument();
    expect(screen.getByText("~30min")).toBeInTheDocument();
  });

  it("shows Mark Done and Skip buttons for parent view", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={false} />);
    expect(screen.getByText("Mark Done")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("shows Start and Quick Complete buttons for child view", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Quick Complete")).toBeInTheDocument();
  });

  it("shows timer display when timer is running", () => {
    mockTimerHook.activeTimer = { assignmentId: "qa1", startedAt: Date.now() - 125000 };
    mockTimerHook.elapsedSeconds = 125;
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    expect(screen.getByText("02:05")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls startTimer when Start is clicked", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    await user.click(screen.getByText("Start"));
    expect(mockTimerHook.startTimer).toHaveBeenCalledWith("qa1");
  });

  it("disables Start button when another timer is active", () => {
    mockTimerHook.activeTimer = { assignmentId: "other-assignment", startedAt: Date.now() };
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    expect(screen.getByText("Start")).toBeDisabled();
  });

  it("shows quick complete duration input when Quick Complete is clicked", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    await user.click(screen.getByText("Quick Complete"));
    expect(screen.getByLabelText("Duration in minutes")).toBeInTheDocument();
    expect(screen.getByText("Submit")).toBeInTheDocument();
  });

  it("offers a Scribe's Notes field on quick complete even when notes are optional", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    await user.click(screen.getByText("Quick Complete"));
    const notes = screen.getByLabelText("Scribe's Notes");
    expect(notes).toBeInTheDocument();
    expect(notes).toHaveAttribute("placeholder", expect.stringContaining("(optional)"));
    // Optional notes must not block submitting.
    expect(screen.getByText("Submit")).not.toBeDisabled();
  });

  it("requires Scribe's Notes before submitting when the quest demands them", async () => {
    const user = userEvent.setup();
    const data = { ...baseData, quest: { ...baseData.quest, requireNotes: true } };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    await user.click(screen.getByText("Quick Complete"));
    expect(screen.getByLabelText("Scribe's Notes")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("(required)"),
    );
    expect(screen.getByText("Submit")).toBeDisabled();
    await user.type(screen.getByLabelText("Scribe's Notes"), "Read pages 50-75");
    expect(screen.getByText("Submit")).not.toBeDisabled();
  });

  it("locks a hero out of quests that are not next in structured mode", () => {
    render(
      <QuestAssignmentCard
        data={baseData}
        isChildView={true}
        structuredNext={{ id: "other-quest", title: "Math Drills" }}
      />
    );
    expect(screen.getByText('Complete "Math Drills" first')).toBeInTheDocument();
    expect(screen.queryByText("Start")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick Complete")).not.toBeInTheDocument();
  });

  it("leaves the quest that is next in structured mode fully actionable", () => {
    render(
      <QuestAssignmentCard
        data={baseData}
        isChildView={true}
        structuredNext={{ id: "q1", title: "Read Chapter 5" }}
      />
    );
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Quick Complete")).toBeInTheDocument();
  });

  it("hides Skip from a hero whose parent has not allowed it", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
  });

  it("lets a hero skip with a reason once a parent allows it", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} allowChildSkip={true} />);
    await user.click(screen.getByText("Skip"));
    await user.type(screen.getByLabelText("Reason for skipping"), "Too hard today");
    expect(screen.getByText("Your grown-up will be told.")).toBeInTheDocument();
    await user.click(screen.getByText("Skip Quest"));
    expect(skipAssignment).toHaveBeenCalledWith("qa1", "Too hard today");
  });

  it("still hides Skip from a hero on a quest that is not their turn", () => {
    render(
      <QuestAssignmentCard
        data={baseData}
        isChildView={true}
        allowChildSkip={true}
        structuredNext={{ id: "other-quest", title: "Math Drills" }}
      />
    );
    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
  });

  it("asks a grown-up why before it skips, and does not tell them off about it", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={false} />);
    await user.click(screen.getByText("Skip"));
    expect(skipAssignment).not.toHaveBeenCalled();
    expect(screen.queryByText("Your grown-up will be told.")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason for skipping"), "co-op day");
    await user.click(screen.getByText("Skip Quest"));
    expect(skipAssignment).toHaveBeenCalledWith("qa1", "co-op day");
  });

  it("will not skip without a reason, however hard the button is pressed", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} allowChildSkip={true} />);
    await user.click(screen.getByText("Skip"));
    expect(screen.getByText("Skip Quest")).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for skipping"), "   ");
    expect(screen.getByText("Skip Quest")).toBeDisabled();
    expect(skipAssignment).not.toHaveBeenCalled();
  });

  it("will not set a quest aside as stuck without saying what went wrong", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    await user.click(screen.getByText("I'm Stuck"));
    expect(screen.getByText("Get Help & Move On")).toBeDisabled();
    await user.type(screen.getByLabelText("What you are stuck on"), "  ");
    expect(screen.getByText("Get Help & Move On")).toBeDisabled();
    expect(markAssignmentStuck).not.toHaveBeenCalled();
  });

  it("shows completed state", () => {
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed" },
    };
    render(<QuestAssignmentCard data={data} isChildView={false} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Mark Done")).not.toBeInTheDocument();
  });

  it("offers Add Notes on a completed quest that has none yet", () => {
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed" },
    };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    expect(screen.getByText("Add Notes")).toBeInTheDocument();
  });

  it("shows a completed quest's notes and offers to edit them", () => {
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed", notes: "Read pages 50-75" },
    };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    expect(screen.getByText("Read pages 50-75")).toBeInTheDocument();
    expect(screen.getByText("Edit Notes")).toBeInTheDocument();
    expect(screen.queryByText("Add Notes")).not.toBeInTheDocument();
  });

  it("lets a hero write notes onto an already-completed quest", async () => {
    const user = userEvent.setup();
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed" },
    };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    await user.click(screen.getByText("Add Notes"));
    await user.type(screen.getByLabelText("Scribe's Notes"), "Finished the whole chapter");
    await user.click(screen.getByText("Save Notes"));
    expect(updateAssignmentNotes).toHaveBeenCalledWith("qa1", "Finished the whole chapter");
  });

  it("seeds the notes editor with the notes already on the quest", async () => {
    const user = userEvent.setup();
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed", notes: "Read pages 50-75" },
    };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    await user.click(screen.getByText("Edit Notes"));
    expect(screen.getByLabelText("Scribe's Notes")).toHaveValue("Read pages 50-75");
  });

  it("will not let a required-notes quest be left blank by an edit", async () => {
    const user = userEvent.setup();
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed", notes: "Read pages 50-75" },
      quest: { ...baseData.quest, requireNotes: true },
    };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    await user.click(screen.getByText("Edit Notes"));
    await user.clear(screen.getByLabelText("Scribe's Notes"));
    expect(screen.getByText("Save Notes")).toBeDisabled();
    expect(updateAssignmentNotes).not.toHaveBeenCalled();
  });

  it("keeps notes editing off a pending quest — completing it is how notes get written", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    expect(screen.queryByText("Add Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit Notes")).not.toBeInTheDocument();
  });

  it("shows skipped state with the reason it was skipped for", () => {
    const data = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "skipped", statusReason: "Sick day" },
    };
    render(<QuestAssignmentCard data={data} isChildView={false} />);
    expect(screen.getByText("Skipped: Sick day")).toBeInTheDocument();
    expect(screen.queryByText("Mark Done")).not.toBeInTheDocument();
  });

  it("never passes Scribe's Notes off as the reason a quest was skipped", () => {
    const data = {
      ...baseData,
      assignment: {
        ...baseData.assignment,
        status: "skipped",
        notes: "Read pages 50-75",
        statusReason: "Sick day",
      },
    };
    render(<QuestAssignmentCard data={data} isChildView={false} />);
    expect(screen.getByText("Skipped: Sick day")).toBeInTheDocument();
    expect(screen.queryByText(/Read pages 50-75/)).not.toBeInTheDocument();
  });

  it("offers a hero the stuck escape hatch even when skipping is switched off", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={true} allowChildSkip={false} />);
    expect(screen.getByText("I'm Stuck")).toBeInTheDocument();
    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
  });

  it("sets a quest aside with the hero's reason and warns them a grown-up is told", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={baseData} isChildView={true} />);
    await user.click(screen.getByText("I'm Stuck"));
    expect(screen.getByText("Your grown-up will be told so they can help.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("What you are stuck on"), "step 3 makes no sense");
    await user.click(screen.getByText("Get Help & Move On"));
    expect(markAssignmentStuck).toHaveBeenCalledWith("qa1", "step 3 makes no sense");
  });

  it("keeps the stuck escape hatch off a quest that is not the hero's turn", () => {
    render(
      <QuestAssignmentCard
        data={baseData}
        isChildView={true}
        structuredNext={{ id: "other", title: "Math Drills" }}
      />
    );
    expect(screen.queryByText("I'm Stuck")).not.toBeInTheDocument();
  });

  it("shows a stuck quest's reason, and gives the hero no buttons to press", () => {
    const stuck = {
      ...baseData,
      assignment: { id: "qa1", status: "stuck", notes: null, statusReason: "I got lost on step 3" },
    };
    render(<QuestAssignmentCard data={stuck} isChildView={true} />);
    expect(screen.getByText(/Stuck — help is on the way: I got lost on step 3/)).toBeInTheDocument();
    expect(screen.queryByText("Back to To-Do")).not.toBeInTheDocument();
  });

  it("lets a grown-up finish, shelve or reopen a stuck quest", () => {
    const stuck = { ...baseData, assignment: { id: "qa1", status: "stuck", notes: null, statusReason: null } };
    render(<QuestAssignmentCard data={stuck} isChildView={false} />);
    expect(screen.getByText(/Stuck — needs a grown-up/)).toBeInTheDocument();
    expect(screen.getByText("Mark Done")).toBeInTheDocument();
    expect(screen.getByText("Back to To-Do")).toBeInTheDocument();
    expect(screen.getByText("Skip for Today")).toBeInTheDocument();
  });

  it("asks a grown-up why before it shelves a stuck quest for the day", async () => {
    const user = userEvent.setup();
    const stuck = { ...baseData, assignment: { id: "qa1", status: "stuck", notes: null, statusReason: "I got lost on step 3" } };
    render(<QuestAssignmentCard data={stuck} isChildView={false} />);
    await user.click(screen.getByText("Skip for Today"));
    expect(screen.getByText("Skip Quest")).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for skipping"), "we will sit down with it tomorrow");
    await user.click(screen.getByText("Skip Quest"));
    expect(skipAssignment).toHaveBeenCalledWith("qa1", "we will sit down with it tomorrow");
  });

  it("keeps the undo of a completion away from the hero who marked it done", () => {
    const completed = {
      ...baseData,
      assignment: { id: "qa1", status: "completed", notes: null, statusReason: null },
    };
    render(<QuestAssignmentCard data={completed} isChildView={true} />);
    expect(screen.queryByText("Not Done")).not.toBeInTheDocument();
  });

  it("lets a grown-up skip a quest a hero wrongly marked complete", async () => {
    const user = userEvent.setup();
    const completed = {
      ...baseData,
      assignment: { id: "qa1", status: "completed", notes: "all done!", statusReason: null },
    };
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByText("Not Done"));
    expect(
      screen.getByText(/Any XP and rewards it earned are returned/)
    ).toBeInTheDocument();
    expect(screen.getByText("Skip for Today")).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for skipping"), "never opened the book");
    await user.click(screen.getByText("Skip for Today"));
    expect(reviseAssignment).toHaveBeenCalledWith("qa1", "skipped", "never opened the book");
  });

  it("lets a grown-up put a wrongly-completed quest back on the hero's list", async () => {
    const user = userEvent.setup();
    const completed = {
      ...baseData,
      assignment: { id: "qa1", status: "completed", notes: null, statusReason: null },
    };
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByText("Not Done"));
    await user.click(screen.getByText("Back to To-Do"));
    expect(reviseAssignment).toHaveBeenCalledWith("qa1", "pending", undefined);
  });

  it("lets a grown-up undo a skip", async () => {
    const user = userEvent.setup();
    const skipped = { ...baseData, assignment: { id: "qa1", status: "skipped", notes: null, statusReason: null } };
    render(<QuestAssignmentCard data={skipped} isChildView={false} />);
    await user.click(screen.getByText("Undo Skip"));
    expect(reviseAssignment).toHaveBeenCalledWith("qa1", "pending", undefined);
  });

  describe("catch-up cards", () => {
    it("says which day the work was owed from", () => {
      render(
        <QuestAssignmentCard data={baseData} isChildView={true} missedFrom="Yesterday" />
      );
      expect(screen.getByText(/From Yesterday/)).toBeInTheDocument();
    });

    it("offers a grown-up's skip as \"Not Needed\" — that's what excusing missed work is", async () => {
      const user = userEvent.setup();
      render(
        <QuestAssignmentCard data={baseData} isChildView={false} missedFrom="Monday" />
      );
      await user.click(screen.getByText("Not Needed"));
      await user.type(screen.getByLabelText("Reason for skipping"), "we covered it in the car");
      await user.click(screen.getByText("Mark Not Needed"));
      expect(skipAssignment).toHaveBeenCalledWith("qa1", "we covered it in the car");
    });

    it("hands a hero back a quest they got stuck on", () => {
      const stuck = {
        ...baseData,
        assignment: { id: "qa1", status: "stuck", notes: null, statusReason: "step 3" },
      };
      render(<QuestAssignmentCard data={stuck} isChildView={true} missedFrom="Monday" />);
      expect(screen.getByText("Start")).toBeInTheDocument();
      expect(screen.getByText("Quick Complete")).toBeInTheDocument();
      // Already stuck — saying so again would tell a grown-up nothing new.
      expect(screen.queryByText("I'm Stuck")).not.toBeInTheDocument();
    });

    it("leaves a stuck quest on its own day alone", () => {
      const stuck = {
        ...baseData,
        assignment: { id: "qa1", status: "stuck", notes: null, statusReason: "step 3" },
      };
      render(<QuestAssignmentCard data={stuck} isChildView={true} />);
      expect(screen.queryByText("Start")).not.toBeInTheDocument();
    });

    it("shows no missed-day chip on an ordinary card", () => {
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      expect(screen.queryByText(/^From /)).not.toBeInTheDocument();
    });
  });

  it("renders subject color dot", () => {
    const { container } = render(<QuestAssignmentCard data={baseData} isChildView={false} />);
    const dot = container.querySelector(".rounded-full");
    expect(dot).toHaveStyle({ backgroundColor: "#ef4444" });
  });
});
