import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestTemplateForm } from "./quest-template-form";

// jsdom doesn't support HTMLDialogElement methods
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/quests", () => ({
  createQuest: vi.fn().mockResolvedValue({ id: "q1", title: "Test" }),
  updateQuest: vi.fn().mockResolvedValue(undefined),
}));

const subjects = [
  { id: "s1", name: "Math", color: "#ef4444" },
  { id: "s2", name: "Reading", color: "#3b82f6" },
];

const schoolDays = ["mon", "tue", "wed", "thu", "fri"];

afterEach(cleanup);

describe("QuestTemplateForm", () => {
  it("renders create form fields when open", () => {
    render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        open={true}
        onClose={vi.fn()}
        schoolDays={schoolDays}
        timeZone="America/Denver"
      />
    );
    expect(screen.getByLabelText("Quest Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Discipline")).toBeInTheDocument();
    expect(screen.getByLabelText("Estimated Duration (minutes)")).toBeInTheDocument();
    expect(screen.getByLabelText("Description (optional)")).toBeInTheDocument();
    expect(screen.getByText("Create Quest")).toBeInTheDocument();
  });

  it("renders edit form with pre-filled values", () => {
    const quest = {
      id: "q1",
      title: "Read Chapter 5",
      subjectId: "s2",
      description: "Pages 50-75",
      estimatedMinutes: 30,
      rewardXp: null,
      rewardDescription: null,
      rewardAvatarItem: null,
    };
    render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        quest={quest}
        open={true}
        onClose={vi.fn()}
        schoolDays={schoolDays}
        timeZone="America/Denver"
      />
    );
    expect(screen.getByLabelText("Quest Title")).toHaveValue("Read Chapter 5");
    expect(screen.getByLabelText("Discipline")).toHaveValue("s2");
    expect(screen.getByLabelText("Estimated Duration (minutes)")).toHaveValue(30);
    expect(screen.getByLabelText("Description (optional)")).toHaveValue("Pages 50-75");
    expect(screen.getByText("Update Quest")).toBeInTheDocument();
  });

  it("shows subject options", () => {
    render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        open={true}
        onClose={vi.fn()}
        schoolDays={schoolDays}
        timeZone="America/Denver"
      />
    );
    expect(screen.getByText("Math")).toBeInTheDocument();
    expect(screen.getByText("Reading")).toBeInTheDocument();
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        open={true}
        onClose={onClose}
        schoolDays={schoolDays}
        timeZone="America/Denver"
      />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("only offers school days as weekly repeat day options", async () => {
    const user = userEvent.setup();
    render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        open={true}
        onClose={vi.fn()}
        schoolDays={schoolDays}
        timeZone="America/Denver"
      />
    );
    await user.click(screen.getByText("On a schedule"));
    await user.click(screen.getByText("Weekly"));
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.queryByText("Sat")).not.toBeInTheDocument();
    expect(screen.queryByText("Sun")).not.toBeInTheDocument();
  });

  it("shows Once, Daily, Weekly, and Monthly frequency options with an interval input for Weekly", async () => {
    const user = userEvent.setup();
    render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        open={true}
        onClose={vi.fn()}
        schoolDays={schoolDays}
        timeZone="America/Denver"
      />
    );
    await user.click(screen.getByText("On a schedule"));
    expect(screen.getByText("Once")).toBeInTheDocument();
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();

    // Scheduling opens on "Once", so the weekly interval only appears once Weekly is picked.
    await user.click(screen.getByText("Weekly"));
    expect(screen.getByLabelText("Repeat every")).toBeInTheDocument();

    await user.click(screen.getByText("Monthly"));
    expect(screen.queryByLabelText("Repeat every")).not.toBeInTheDocument();
    expect(screen.queryByText("Mon")).not.toBeInTheDocument();
  });
  describe("availability choice", () => {
    const quest = {
      id: "q1",
      title: "Read Chapter 5",
      subjectId: "s2",
      description: null,
      estimatedMinutes: null,
      rewardXp: null,
      rewardDescription: null,
      rewardAvatarItem: null,
    };
    const schedule = {
      id: "sch1",
      frequency: "weekly",
      daysOfWeek: JSON.stringify(["mon", "wed"]),
      intervalWeeks: 1,
      startDate: "2026-08-24",
      endDate: null,
    };

    it("preselects neither option for a new quest, so 'Anytime' can't happen by default", () => {
      render(
        <QuestTemplateForm
          childId="c1"
          subjects={subjects}
          open={true}
          onClose={vi.fn()}
          schoolDays={schoolDays}
          timeZone="America/Denver"
        />
      );
      expect(screen.getByText("Anytime")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByText("On a schedule")).toHaveAttribute("aria-pressed", "false");
      // Neither branch's detail is showing yet.
      expect(screen.queryByText("Frequency")).not.toBeInTheDocument();
    });

    it("refuses to save a new quest until the parent picks one", async () => {
      const user = userEvent.setup();
      render(
        <QuestTemplateForm
          childId="c1"
          subjects={subjects}
          open={true}
          onClose={vi.fn()}
          schoolDays={schoolDays}
          timeZone="America/Denver"
        />
      );
      await user.type(screen.getByLabelText("Quest Title"), "New Quest");
      await user.click(screen.getByText("Create Quest"));
      expect(await screen.findByText("Choose when this quest is available")).toBeInTheDocument();
    });

    it("explains what Anytime actually means once picked", async () => {
      const user = userEvent.setup();
      render(
        <QuestTemplateForm
          childId="c1"
          subjects={subjects}
          open={true}
          onClose={vi.fn()}
          schoolDays={schoolDays}
          timeZone="America/Denver"
        />
      );
      await user.click(screen.getByText("Anytime"));
      expect(screen.getByText(/any day until it's completed/)).toBeInTheDocument();
      expect(screen.getByText(/won't appear in Today's Quests/)).toBeInTheDocument();
    });

    it("opens an edit on the quest's real state — scheduled quest shows its schedule", () => {
      render(
        <QuestTemplateForm
          childId="c1"
          subjects={subjects}
          quest={quest}
          schedule={schedule}
          open={true}
          onClose={vi.fn()}
          schoolDays={schoolDays}
          timeZone="America/Denver"
        />
      );
      expect(screen.getByText("On a schedule")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("Anytime")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByText("Frequency")).toBeInTheDocument();
      expect(screen.getByLabelText("Repeat every")).toHaveValue(1);
    });

    it("opens an edit on the quest's real state — unscheduled quest reads as Anytime", () => {
      render(
        <QuestTemplateForm
          childId="c1"
          subjects={subjects}
          quest={quest}
          schedule={null}
          open={true}
          onClose={vi.fn()}
          schoolDays={schoolDays}
          timeZone="America/Denver"
        />
      );
      expect(screen.getByText("Anytime")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("On a schedule")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByText(/any day until it's completed/)).toBeInTheDocument();
    });
  });
});

describe("QuestTemplateForm schedule-gap warning", () => {
  // Math (s1) is taught Mon and Wed. Reading (s2) is absent from the map
  // entirely — it has no class time on any day.
  const blockDaysBySubject = { s1: ["mon", "wed"] };

  const quest = {
    id: "q1",
    title: "Times Tables",
    subjectId: "s1",
    description: null,
    estimatedMinutes: null,
    rewardXp: null,
    rewardDescription: null,
    rewardAvatarItem: null,
  };

  // Editing a real quest pins the start date and repeat days, so these assertions
  // don't shift with the day the suite happens to run on. 2026-08-24 is a Monday.
  const schedule = {
    id: "sch1",
    frequency: "weekly",
    daysOfWeek: JSON.stringify(["mon", "wed"]),
    intervalWeeks: 1,
    startDate: "2026-08-24",
    endDate: null,
  };

  function renderForm() {
    return render(
      <QuestTemplateForm
        childId="c1"
        subjects={subjects}
        quest={quest}
        schedule={schedule}
        open={true}
        onClose={vi.fn()}
        schoolDays={schoolDays}
        timeZone="America/Denver"
        blockDaysBySubject={blockDaysBySubject}
      />
    );
  }

  it("stays quiet when every repeat day is taught", () => {
    renderForm();
    expect(screen.queryByText(/has no class time/i)).not.toBeInTheDocument();
  });

  it("warns as soon as a repeat day with no class time is added", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByText("Fri"));
    expect(screen.getByText(/Math has no class time on Fri/i)).toBeInTheDocument();
  });

  it("names every untaught day, not just the first", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByText("Tue"));
    await user.click(screen.getByText("Fri"));
    expect(screen.getByText(/Math has no class time on Tue and Fri/i)).toBeInTheDocument();
  });

  it("calls out a discipline that is not on the schedule at all", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Discipline"), "s2");
    expect(screen.getByText(/Reading isn't on the weekly schedule at all/i)).toBeInTheDocument();
  });

  it("explains the consequence rather than just flagging it", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByText("Fri"));
    expect(screen.getByText(/lands at the bottom of Today's Quests/i)).toBeInTheDocument();
    expect(screen.getByText(/structured day a hero can't reach it/i)).toBeInTheDocument();
  });

  it("offers a way to close the gap", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Discipline"), "s2");
    expect(
      screen.getByText(/Add Reading to the weekly schedule/i).closest("a")
    ).toHaveAttribute("href", "/schedule?child=c1");
  });

  it("clears once the repeat is pulled back onto taught days", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByText("Fri"));
    expect(screen.getByText(/has no class time on Fri/i)).toBeInTheDocument();

    await user.click(screen.getByText("Fri"));
    expect(screen.queryByText(/has no class time/i)).not.toBeInTheDocument();
  });

  it("says nothing at all once the quest is switched to Anytime", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByText("Fri"));
    expect(screen.getByText(/has no class time on Fri/i)).toBeInTheDocument();

    await user.click(screen.getByText("Anytime"));
    expect(screen.queryByText(/has no class time/i)).not.toBeInTheDocument();
  });
});
