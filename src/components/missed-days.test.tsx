import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MissedDays } from "./missed-days";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/excused-days", () => ({
  excuseDay: vi.fn(),
  unexcuseDay: vi.fn(),
  moveDayToDate: vi.fn(),
  moveAssignmentsToDate: vi.fn(),
}));

const missed = [
  { date: "2026-08-31", unfinishedCount: 9, empty: true, brokeStreak: true },
  { date: "2026-08-27", unfinishedCount: 2, empty: false, brokeStreak: false },
];

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
    expect(screen.getAllByRole("button", { name: /excuse/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /move/i })).toHaveLength(2);
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
    fireEvent.click(screen.getAllByRole("button", { name: /excuse/i })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: /excuse/i })[0]);
    expect(screen.getByLabelText(/all heroes/i)).toBeInTheDocument();
  });
});
