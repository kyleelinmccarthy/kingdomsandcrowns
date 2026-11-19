import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, createEvent } from "@testing-library/react";
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

vi.mock("@/lib/actions/chronicle-seals", () => ({
  sealEntry: vi.fn().mockResolvedValue(undefined),
  unsealEntry: vi.fn().mockResolvedValue(undefined),
}));

import { sealEntry, unsealEntry } from "@/lib/actions/chronicle-seals";
import { SEAL_PHRASES } from "@/lib/utils/seals";

import {
  completeAssignment,
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
  vi.mocked(completeAssignment).mockClear();
  vi.mocked(markAssignmentStuck).mockClear();
  vi.mocked(reviseAssignment).mockClear();
  vi.mocked(sealEntry).mockClear();
  vi.mocked(unsealEntry).mockClear();
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
  assignment: { id: "qa1", status: "pending", notes: null, drawing: null, seal: null, statusReason: null },
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
      "Scribe's Notes, or a drawing (one is required) — what did you do?",
    );
    expect(screen.getByLabelText("Scribe's Notes")).not.toBeRequired();
    expect(screen.getByText("Submit")).toBeDisabled();
    await user.type(screen.getByLabelText("Scribe's Notes"), "Read pages 50-75");
    expect(screen.getByText("Submit")).not.toBeDisabled();
  });

  it("does not let punctuation-only or whitespace-only text satisfy required Scribe's Notes", async () => {
    const user = userEvent.setup();
    const data = { ...baseData, quest: { ...baseData.quest, requireNotes: true } };
    render(<QuestAssignmentCard data={data} isChildView={true} />);
    await user.click(screen.getByText("Quick Complete"));
    const notes = screen.getByLabelText("Scribe's Notes");
    for (const bypass of ["'", ".", "   ", "..."]) {
      await user.clear(notes);
      await user.type(notes, bypass);
      expect(screen.getByText("Submit")).toBeDisabled();
    }
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
    expect(updateAssignmentNotes).toHaveBeenCalledWith("qa1", "Finished the whole chapter", null);
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
      assignment: { id: "qa1", status: "stuck", notes: null, drawing: null, seal: null, statusReason: "I got lost on step 3" },
    };
    render(<QuestAssignmentCard data={stuck} isChildView={true} />);
    expect(screen.getByText(/Stuck — help is on the way: I got lost on step 3/)).toBeInTheDocument();
    expect(screen.queryByText("Back to To-Do")).not.toBeInTheDocument();
  });

  it("lets a grown-up finish, shelve or reopen a stuck quest", () => {
    const stuck = { ...baseData, assignment: { id: "qa1", status: "stuck", notes: null, drawing: null, seal: null, statusReason: null } };
    render(<QuestAssignmentCard data={stuck} isChildView={false} />);
    expect(screen.getByText(/Stuck — needs a grown-up/)).toBeInTheDocument();
    expect(screen.getByText("Mark Done")).toBeInTheDocument();
    expect(screen.getByText("Back to To-Do")).toBeInTheDocument();
    expect(screen.getByText("Skip for Today")).toBeInTheDocument();
  });

  it("asks a grown-up why before it shelves a stuck quest for the day", async () => {
    const user = userEvent.setup();
    const stuck = { ...baseData, assignment: { id: "qa1", status: "stuck", notes: null, drawing: null, seal: null, statusReason: "I got lost on step 3" } };
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
      assignment: { id: "qa1", status: "completed", notes: null, drawing: null, seal: null, statusReason: null },
    };
    render(<QuestAssignmentCard data={completed} isChildView={true} />);
    expect(screen.queryByText("Not Done")).not.toBeInTheDocument();
  });

  it("lets a grown-up skip a quest a hero wrongly marked complete", async () => {
    const user = userEvent.setup();
    const completed = {
      ...baseData,
      assignment: { id: "qa1", status: "completed", notes: "all done!", drawing: null, seal: null, statusReason: null },
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
      assignment: { id: "qa1", status: "completed", notes: null, drawing: null, seal: null, statusReason: null },
    };
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByText("Not Done"));
    await user.click(screen.getByText("Back to To-Do"));
    expect(reviseAssignment).toHaveBeenCalledWith("qa1", "pending", undefined);
  });

  it("lets a grown-up undo a skip", async () => {
    const user = userEvent.setup();
    const skipped = { ...baseData, assignment: { id: "qa1", status: "skipped", notes: null, drawing: null, seal: null, statusReason: null } };
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
        assignment: { id: "qa1", status: "stuck", notes: null, drawing: null, seal: null, statusReason: "step 3" },
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
        assignment: { id: "qa1", status: "stuck", notes: null, drawing: null, seal: null, statusReason: "step 3" },
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

  describe("excused work", () => {
    const excused = {
      ...baseData,
      assignment: { id: "qa1", status: "excused", notes: null, drawing: null, seal: null, statusReason: "Sick day" },
    };

    it("reads as excused to a hero, with nothing to undo", () => {
      render(<QuestAssignmentCard data={excused} isChildView={true} />);
      expect(screen.getByText(/excused/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
    });

    it("lets a grown-up put it back on the list", () => {
      render(<QuestAssignmentCard data={excused} isChildView={false} />);
      expect(screen.getByRole("button", { name: /undo excuse/i })).toBeInTheDocument();
    });

    it("is never startable", () => {
      render(<QuestAssignmentCard data={excused} isChildView={true} />);
      expect(screen.queryByText("Start")).not.toBeInTheDocument();
    });
  });

  describe("moved work", () => {
    it("says which day it came from", () => {
      const moved = {
        ...baseData,
        assignment: {
          id: "qa1",
          status: "pending",
          notes: null,
          drawing: null,
          seal: null,
          statusReason: null,
          originalDate: "2026-08-31",
        },
      };
      render(<QuestAssignmentCard data={moved} isChildView={true} />);
      expect(screen.getByText(/moved from Monday, Aug 31/i)).toBeInTheDocument();
    });

    it("says nothing on a card that was never moved", () => {
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      expect(screen.queryByText(/moved from/i)).not.toBeInTheDocument();
    });
  });

  describe("what a finished quest made", () => {
    const done = { ...baseData, assignment: { ...baseData.assignment, status: "completed" } };
    const made = "+1 Ink \u00b7 the Library's Reading Wing needs 3 more";

    it("shows the line and a link to the Realm to a hero", () => {
      render(<QuestAssignmentCard data={{ ...done, rewards: { made, minutes: null } }} isChildView={true} realmEnabled />);
      expect(screen.getByText(made)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Take it to the Realm" })).toHaveAttribute("href", "/realm");
    });

    it("shows a grown-up the line but no link", () => {
      render(<QuestAssignmentCard data={{ ...done, rewards: { made, minutes: null } }} isChildView={false} realmEnabled />);
      expect(screen.getByText(made)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Take it to the Realm" })).not.toBeInTheDocument();
    });

    it("has no link when the Realm is off, and when the page did not say", () => {
      const { rerender } = render(<QuestAssignmentCard data={{ ...done, rewards: { made, minutes: null } }} isChildView={true} realmEnabled={false} />);
      expect(screen.getByText(made)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Take it to the Realm" })).not.toBeInTheDocument();
      rerender(<QuestAssignmentCard data={{ ...done, rewards: { made, minutes: null } }} isChildView={true} />);
      expect(screen.queryByRole("link", { name: "Take it to the Realm" })).not.toBeInTheDocument();
    });

    it("shows the Realm minutes the quest earned, when they come with it", () => {
      render(<QuestAssignmentCard data={{ ...done, rewards: { made, minutes: 5 } }} isChildView={true} realmEnabled />);
      expect(screen.getByText("+5 min in the Realm")).toBeInTheDocument();
    });

    it("shows no minutes line without minutes", () => {
      render(<QuestAssignmentCard data={{ ...done, rewards: { made, minutes: null } }} isChildView={true} realmEnabled />);
      expect(screen.queryByText(/min in the Realm/)).not.toBeInTheDocument();
    });

    it("shows nothing extra on a finished quest that made nothing", () => {
      render(<QuestAssignmentCard data={{ ...done, rewards: { made: null, minutes: null } }} isChildView={true} realmEnabled />);
      expect(screen.queryByRole("link", { name: "Take it to the Realm" })).not.toBeInTheDocument();
    });

    it("leaves a pending card as it was", () => {
      render(<QuestAssignmentCard data={{ ...baseData, rewards: { made, minutes: 5 } }} isChildView={true} realmEnabled />);
      expect(screen.queryByText(made)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Take it to the Realm" })).not.toBeInTheDocument();
      expect(screen.queryByText(/min in the Realm/)).not.toBeInTheDocument();
    });
  });
  describe("drawing", () => {
    const RECT = { left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240, x: 0, y: 0, toJSON: () => ({}) };
    const stored = { v: 1, strokes: [{ c: 2, w: 1, p: [10, 10, 60, 60] }] };
    const completedWithDrawing = {
      ...baseData,
      assignment: { ...baseData.assignment, status: "completed", notes: null, drawing: JSON.stringify(stored), seal: null },
    };

    function firePointer(el: Element, type: "pointerDown" | "pointerMove" | "pointerUp", x: number, y: number) {
      const ev = createEvent[type](el, { bubbles: true });
      Object.defineProperty(ev, "clientX", { value: x });
      Object.defineProperty(ev, "clientY", { value: y });
      Object.defineProperty(ev, "pointerId", { value: 1 });
      fireEvent(el, ev);
    }

    /** Clear is a two-tap confirm. */
    async function clearPad(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "Clear" }));
      await user.click(screen.getByRole("button", { name: "Tap again to clear" }));
    }

    /** Draw a dot on the open pad. */
    function dot(x = 100, y = 80) {
      const pad = screen.getByRole("img", { name: "Your drawing" });
      pad.getBoundingClientRect = () => RECT as DOMRect;
      firePointer(pad, "pointerDown", x, y);
      firePointer(pad, "pointerUp", x, y);
    }

    it("keeps the pad closed on quick complete until asked, and can hide it again", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      expect(screen.queryByRole("img", { name: "Your drawing" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add a drawing" }));
      expect(screen.getByRole("img", { name: "Your drawing" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Hide drawing" }));
      expect(screen.queryByRole("img", { name: "Your drawing" })).not.toBeInTheDocument();
    });

    it("lets a drawing alone complete a quest that asks for Scribe's Notes", async () => {
      const user = userEvent.setup();
      const data = { ...baseData, quest: { ...baseData.quest, requireNotes: true } };
      render(<QuestAssignmentCard data={data} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      expect(screen.getByText("Submit")).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Add a drawing" }));
      dot();
      expect(screen.getByText("Submit")).not.toBeDisabled();
      await user.click(screen.getByText("Submit"));
      expect(completeAssignment).toHaveBeenCalledTimes(1);
      const [id, payload] = vi.mocked(completeAssignment).mock.calls[0]!;
      expect(id).toBe("qa1");
      expect(payload!.drawing).toEqual({ v: 1, strokes: [{ c: 0, w: 1, p: [100, 80] }] });
    });

    it("sends no drawing when the pad was never used", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      await user.click(screen.getByText("Submit"));
      expect(completeAssignment).toHaveBeenCalledTimes(1);
      expect(vi.mocked(completeAssignment).mock.calls[0]![1]!.drawing).toBeUndefined();
    });

    it("sends no drawing after the page is cleared", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      await user.click(screen.getByRole("button", { name: "Add a drawing" }));
      dot();
      await clearPad(user);
      await user.click(screen.getByText("Submit"));
      expect(vi.mocked(completeAssignment).mock.calls[0]![1]!.drawing).toBeUndefined();
    });

    it("opens the editor on the stored drawing and saves an emptied page as null", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={{ ...completedWithDrawing, quest: { ...baseData.quest, requireNotes: false } }} isChildView={true} />);
      await user.click(screen.getByText("Edit Notes"));
      const pad = screen.getByRole("img", { name: "Your drawing" });
      expect(pad.querySelectorAll("path")).toHaveLength(1);
      await clearPad(user);
      await user.click(screen.getByText("Save Notes"));
      expect(updateAssignmentNotes).toHaveBeenCalledWith("qa1", "", null);
    });

    it("saves the stored drawing back unchanged when only the notes change", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={completedWithDrawing} isChildView={true} />);
      await user.click(screen.getByText("Edit Notes"));
      await user.type(screen.getByLabelText("Scribe's Notes"), "Drew a barn");
      await user.click(screen.getByText("Save Notes"));
      expect(updateAssignmentNotes).toHaveBeenCalledWith("qa1", "Drew a barn", stored);
    });

    it("lets a drawing stand in for notes when editing a quest that asks for them", async () => {
      const user = userEvent.setup();
      const data = { ...completedWithDrawing, quest: { ...baseData.quest, requireNotes: true } };
      render(<QuestAssignmentCard data={data} isChildView={true} />);
      await user.click(screen.getByText("Edit Notes"));
      expect(screen.getByText("Save Notes")).not.toBeDisabled();
      await clearPad(user);
      expect(screen.getByText("Save Notes")).toBeDisabled();
    });

    it("says a drawing counts, on both notes fields, when the quest asks for notes", async () => {
      const user = userEvent.setup();
      const ask = { ...baseData.quest, requireNotes: true };
      const { unmount } = render(<QuestAssignmentCard data={{ ...baseData, quest: ask }} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      expect(screen.getByLabelText("Scribe's Notes")).toHaveAttribute(
        "placeholder",
        "Scribe's Notes, or a drawing (one is required) — what did you do?",
      );
      unmount();
      render(<QuestAssignmentCard data={{ ...completedWithDrawing, quest: ask }} isChildView={true} />);
      await user.click(screen.getByText("Edit Notes"));
      const field = screen.getByLabelText("Scribe's Notes");
      expect(field).toHaveAttribute("placeholder", "Scribe's Notes, or a drawing (one is required) — what did you do?");
      expect(field).not.toBeRequired();
    });

    it("keeps the optional wording when the quest does not ask for notes", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      expect(screen.getByLabelText("Scribe's Notes")).toHaveAttribute(
        "placeholder",
        "Scribe's Notes (optional) — what did you do?",
      );
    });

    it("shows that a hidden drawing is kept, with a small thumbnail, and shows it again on request", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      expect(screen.queryByRole("button", { name: "Show drawing (kept)" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add a drawing" }));
      dot();
      await user.click(screen.getByRole("button", { name: "Hide drawing" }));
      expect(screen.queryByRole("img", { name: "Your drawing" })).not.toBeInTheDocument();
      const kept = screen.getByRole("img", { name: "Your drawing, kept" });
      expect(kept.querySelectorAll("path")).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Show drawing (kept)" }));
      expect(screen.getByRole("img", { name: "Your drawing" }).querySelectorAll("path")).toHaveLength(1);
      expect(screen.queryByRole("img", { name: "Your drawing, kept" })).not.toBeInTheDocument();
    });

    it("shows a kept drawing's thumbnail in the editor too when it is hidden", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={completedWithDrawing} isChildView={true} />);
      await user.click(screen.getByText("Edit Notes"));
      await user.click(screen.getByRole("button", { name: "Hide drawing" }));
      expect(screen.getByRole("img", { name: "Your drawing, kept" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Show drawing (kept)" })).toBeInTheDocument();
    });

    it("starts the next quick complete with a closed, empty pad after a successful submit", async () => {
      const user = userEvent.setup();
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      await user.click(screen.getByRole("button", { name: "Add a drawing" }));
      dot();
      await user.click(screen.getByText("Submit"));
      expect(completeAssignment).toHaveBeenCalledTimes(1);
      // The mocked refresh leaves the card pending, so the form can be opened again.
      await user.click(screen.getByText("Quick Complete"));
      expect(screen.queryByRole("img", { name: "Your drawing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Show drawing (kept)" })).not.toBeInTheDocument();
      await user.click(screen.getByText("Submit"));
      expect(vi.mocked(completeAssignment).mock.calls[1]![1]!.drawing).toBeUndefined();
    });

    it("keeps the drawing when a submit fails", async () => {
      const user = userEvent.setup();
      vi.mocked(completeAssignment).mockRejectedValueOnce(new Error("Nope"));
      render(<QuestAssignmentCard data={baseData} isChildView={true} />);
      await user.click(screen.getByText("Quick Complete"));
      await user.click(screen.getByRole("button", { name: "Add a drawing" }));
      dot();
      await user.click(screen.getByText("Submit"));
      expect(await screen.findByText("Nope")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Your drawing" }).querySelectorAll("path")).toHaveLength(1);
      await user.click(screen.getByText("Submit"));
      expect(vi.mocked(completeAssignment).mock.calls[1]![1]!.drawing).toEqual({
        v: 1,
        strokes: [{ c: 0, w: 1, p: [100, 80] }],
      });
    });

    it("shows a thumbnail of the drawing on a completed card, and none without one", () => {
      const { rerender } = render(<QuestAssignmentCard data={completedWithDrawing} isChildView={true} />);
      const thumb = screen.getByRole("img", { name: /drawing/i });
      expect(thumb.querySelectorAll("path")).toHaveLength(1);
      rerender(<QuestAssignmentCard data={{ ...completedWithDrawing, assignment: { ...completedWithDrawing.assignment, drawing: null } }} isChildView={true} />);
      expect(screen.queryByRole("img", { name: /drawing/i })).not.toBeInTheDocument();
    });

    it("shows no thumbnail for a stored drawing that is not the format", () => {
      const bad = { ...completedWithDrawing, assignment: { ...completedWithDrawing.assignment, drawing: "<svg onload=alert(1)>" } };
      render(<QuestAssignmentCard data={bad} isChildView={true} />);
      expect(screen.queryByRole("img", { name: /drawing/i })).not.toBeInTheDocument();
    });
  });
});

describe("a grown-up's seal", () => {
  const completed = {
    ...baseData,
    assignment: { id: "qa1", status: "completed", notes: "we measured the garden", drawing: null, seal: null, statusReason: null },
  };
  const sealed = (seal: unknown) => ({ ...completed, assignment: { ...completed.assignment, seal: JSON.stringify(seal) } });

  it("lets a grown-up seal a finished quest with a phrase", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByRole("button", { name: "Seal it" }));
    expect(SEAL_PHRASES).toHaveLength(6);
    for (const phrase of SEAL_PHRASES) expect(screen.getByRole("button", { name: phrase })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Press the seal" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: SEAL_PHRASES[2] }));
    expect(screen.getByRole("button", { name: SEAL_PHRASES[2] })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Press the seal" }));
    expect(sealEntry).toHaveBeenCalledWith("qa1", { phrase: 2 });
  });

  it("lets a grown-up seal with a note, counting the characters live", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByRole("button", { name: "Seal it" }));
    expect(screen.getByText("0/60")).toBeInTheDocument();
    const note = screen.getByLabelText("A note for the seal");
    expect(note).toHaveAttribute("maxlength", "60");
    await user.type(note, "You drew every tree");
    expect(screen.getByText("19/60")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Press the seal" }));
    expect(sealEntry).toHaveBeenCalledWith("qa1", { note: "You drew every tree" });
  });

  it("is exactly one of a phrase or a note: choosing one lets go of the other", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByRole("button", { name: "Seal it" }));
    await user.click(screen.getByRole("button", { name: SEAL_PHRASES[0] }));
    await user.type(screen.getByLabelText("A note for the seal"), "Hi");
    expect(screen.getByRole("button", { name: SEAL_PHRASES[0] })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: SEAL_PHRASES[1] }));
    expect(screen.getByLabelText("A note for the seal")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Press the seal" }));
    expect(sealEntry).toHaveBeenCalledWith("qa1", { phrase: 1 });
  });

  it("closes the panel on Cancel without sealing", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByRole("button", { name: "Seal it" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Press the seal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seal it" })).toBeInTheDocument();
    expect(sealEntry).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps the panel open", async () => {
    const user = userEvent.setup();
    vi.mocked(sealEntry).mockRejectedValueOnce(new Error("Only a finished quest can be sealed."));
    render(<QuestAssignmentCard data={completed} isChildView={false} />);
    await user.click(screen.getByRole("button", { name: "Seal it" }));
    await user.click(screen.getByRole("button", { name: SEAL_PHRASES[0] }));
    await user.click(screen.getByRole("button", { name: "Press the seal" }));
    expect(await screen.findByText("Only a finished quest can be sealed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Press the seal" })).toBeInTheDocument();
  });

  it("shows the seal on the card to a hero, with who pressed it, and no controls", () => {
    render(<QuestAssignmentCard data={sealed({ phrase: 1, by: "Mama Bear", at: 1_700_000_000 })} isChildView={true} />);
    const badge = screen.getByTestId("chronicle-seal");
    expect(badge).toHaveTextContent(SEAL_PHRASES[1]);
    expect(badge).toHaveTextContent("— Mama Bear");
    expect(screen.queryByRole("button", { name: "Seal it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove seal" })).not.toBeInTheDocument();
  });

  it("shows a note seal's own words", () => {
    render(<QuestAssignmentCard data={sealed({ note: "You drew every tree", by: "Dad", at: 5 })} isChildView={true} />);
    expect(screen.getByTestId("chronicle-seal")).toHaveTextContent("You drew every tree");
    expect(screen.getByTestId("chronicle-seal")).toHaveTextContent("— Dad");
  });

  it("gives a hero no seal controls on a finished quest, sealed or not", () => {
    render(<QuestAssignmentCard data={completed} isChildView={true} />);
    expect(screen.queryByRole("button", { name: "Seal it" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("chronicle-seal")).not.toBeInTheDocument();
  });

  it("offers a grown-up Remove seal on a sealed quest, and not Seal it", async () => {
    const user = userEvent.setup();
    render(<QuestAssignmentCard data={sealed({ phrase: 0, by: "Mama Bear", at: 1 })} isChildView={false} />);
    expect(screen.getByTestId("chronicle-seal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seal it" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove seal" }));
    expect(unsealEntry).toHaveBeenCalledWith("qa1");
  });

  it("shows nothing for a stored seal that is not the format", () => {
    render(<QuestAssignmentCard data={{ ...completed, assignment: { ...completed.assignment, seal: "<b>oops</b>" } }} isChildView={true} />);
    expect(screen.queryByTestId("chronicle-seal")).not.toBeInTheDocument();
  });

  it("offers no seal on a quest that is not finished", () => {
    render(<QuestAssignmentCard data={baseData} isChildView={false} />);
    expect(screen.queryByRole("button", { name: "Seal it" })).not.toBeInTheDocument();
  });
});
