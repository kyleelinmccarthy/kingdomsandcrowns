import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MissedDays } from "./missed-days";
import { excuseAssignment, moveAssignmentsToDate } from "@/lib/actions/excused-days";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/excused-days", () => ({
  excuseDay: vi.fn(),
  excuseAssignment: vi.fn(),
  unexcuseDay: vi.fn(),
  moveDayToDate: vi.fn(),
  moveAssignmentsToDate: vi.fn(),
}));

const missed = [
  { date: "2026-08-31", quests: [], unfinishedCount: 9, empty: true, brokeStreak: true },
  {
    date: "2026-08-27",
    quests: [
      { id: "a1", title: "Math", status: "completed" },
      { id: "a2", title: "Science", status: "pending" },
      { id: "a3", title: "Reading", status: "stuck" },
    ],
    unfinishedCount: 2,
    empty: false,
    brokeStreak: false,
  },
];

function renderPanel(canEdit = true) {
  return render(
    <MissedDays
      childId="c1"
      childName="Lily"
      today="2026-09-07"
      missed={missed}
      canEdit={canEdit}
      writableChildCount={2}
    />
  );
}

afterEach(cleanup);

describe("MissedDays", () => {
  it("renders nothing when there are no missed days", () => {
    const { container } = render(
      <MissedDays
        childId="c1"
        childName="Lily"
        today="2026-09-07"
        missed={[]}
        canEdit
        writableChildCount={2}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the day that broke the streak", () => {
    render(
      <MissedDays
        childId="c1"
        childName="Lily"
        today="2026-09-07"
        missed={missed}
        canEdit
        writableChildCount={2}
      />
    );
    expect(screen.getByText(/streak broke/i)).toBeInTheDocument();
  });

  it("offers excuse and move controls to an editing adult", () => {
    render(
      <MissedDays
        childId="c1"
        childName="Lily"
        today="2026-09-07"
        missed={missed}
        canEdit
        writableChildCount={2}
      />
    );
    expect(screen.getAllByRole("button", { name: /excuse day/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /move work/i })).toHaveLength(2);
  });

  it("shows the facts but no controls to a read-only guardian", () => {
    render(
      <MissedDays
        childId="c1"
        childName="Lily"
        today="2026-09-07"
        missed={missed}
        canEdit={false}
        writableChildCount={2}
      />
    );
    expect(screen.getByText(/9 quests still owed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excuse/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /move/i })).toBeNull();
  });

  it("offers apply-to-all only when the actor can write to more than one hero", () => {
    const { unmount } = render(
      <MissedDays
        childId="c1"
        childName="Lily"
        today="2026-09-07"
        missed={missed}
        canEdit
        writableChildCount={1}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /excuse day/i })[0]);
    expect(screen.queryByLabelText(/all heroes/i)).toBeNull();
    unmount();

    render(
      <MissedDays
        childId="c1"
        childName="Lily"
        today="2026-09-07"
        missed={missed}
        canEdit
        writableChildCount={2}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /excuse day/i })[0]);
    expect(screen.getByLabelText(/all heroes/i)).toBeInTheDocument();
  });

  // A day where most of the work got done shouldn't have to be excused whole
  // just because one quest was missed.
  it("lists the day's quests by name, with controls on the ones still owed", () => {
    renderPanel();
    expect(screen.getByText("Math")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excuse Science" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excuse Reading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Science" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excuse Math" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Math" })).toBeNull();
  });

  it("excuses just the one quest, with the reason and note given", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Excuse Science" }));
    fireEvent.change(screen.getByLabelText(/why was science missed/i), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: "Field trip" } });
    fireEvent.click(screen.getByRole("button", { name: "Excuse Quest" }));
    await vi.waitFor(() =>
      expect(excuseAssignment).toHaveBeenCalledWith("a2", "other", "Field trip")
    );
    // Apply-to-all is a day-level idea; quests differ between heroes.
    expect(screen.queryByLabelText(/all heroes/i)).toBeNull();
  });

  it("moves just the one quest to the chosen day", async () => {
    vi.mocked(moveAssignmentsToDate).mockResolvedValue({ moved: 1, blocked: 0 });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Move Science" }));
    fireEvent.change(screen.getByLabelText(/move science to/i), {
      target: { value: "2026-09-09" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move Quest" }));
    await vi.waitFor(() =>
      expect(moveAssignmentsToDate).toHaveBeenCalledWith(["a2"], "2026-09-09")
    );
  });

  it("names the quests but offers no per-quest controls to a read-only guardian", () => {
    renderPanel(false);
    expect(screen.getByText("Science")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excuse Science" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Science" })).toBeNull();
  });
});
