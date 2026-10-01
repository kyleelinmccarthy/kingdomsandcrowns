import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UpkeepTaskCard, type UpkeepCardData } from "./upkeep-task-card";

vi.mock("@/lib/actions/upkeep-assignments", () => ({
  markUpkeepDone: vi.fn(),
  approveUpkeep: vi.fn(),
  rejectUpkeep: vi.fn(),
  excuseUpkeep: vi.fn(),
  uncompleteUpkeep: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TODAY = "2026-09-02";

function data(overrides: Partial<UpkeepCardData["task"]> = {}, assignmentOverrides = {}): UpkeepCardData {
  return {
    assignment: {
      id: "a1",
      status: "pending",
      date: TODAY,
      notes: null,
      statusReason: null,
      ...assignmentOverrides,
    },
    task: {
      id: "t1",
      title: "Feed the chickens",
      description: null,
      valueCents: 250,
      isRequired: true,
      rewardXp: null,
      ...overrides,
    },
  };
}

afterEach(cleanup);

describe("UpkeepTaskCard", () => {
  it("shows the task title", () => {
    render(<UpkeepTaskCard data={data()} isChildView today={TODAY} />);
    expect(screen.getByText("Feed the chickens")).toBeInTheDocument();
  });

  it("shows wages in gold to a hero", () => {
    render(<UpkeepTaskCard data={data()} isChildView today={TODAY} />);
    expect(screen.getByText("2 gp 5 sp")).toBeInTheDocument();
  });

  it("shows wages in dollars to a parent", () => {
    render(<UpkeepTaskCard data={data()} isChildView={false} today={TODAY} />);
    expect(screen.getByText("$2.50")).toBeInTheDocument();
  });

  it("shows no wages for an unpaid task", () => {
    render(<UpkeepTaskCard data={data({ valueCents: null })} isChildView today={TODAY} />);
    expect(screen.queryByText(/\d+ (gp|sp|cp)/)).not.toBeInTheDocument();
  });

  it("marks an optional task as optional", () => {
    render(<UpkeepTaskCard data={data({ isRequired: false })} isChildView today={TODAY} />);
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("shows a required past pending task as missed", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { date: "2026-09-01" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });

  it("does not call an optional past pending task missed", () => {
    render(
      <UpkeepTaskCard
        data={data({ isRequired: false }, { date: "2026-09-01" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.queryByText("Missed")).not.toBeInTheDocument();
  });

  it("offers a done control on a pending task", () => {
    render(<UpkeepTaskCard data={data()} isChildView today={TODAY} />);
    expect(screen.getByRole("button", { name: /mark done/i })).toBeInTheDocument();
  });

  it("offers approve and send-back to a parent on an awaiting task", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { status: "awaiting_approval" })}
        isChildView={false}
        today={TODAY}
      />
    );
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send back/i })).toBeInTheDocument();
  });

  it("does not offer approval to a hero", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { status: "awaiting_approval" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows the reason a task was sent back", () => {
    render(
      <UpkeepTaskCard
        data={data({}, { statusReason: "The coop still needs sweeping" })}
        isChildView
        today={TODAY}
      />
    );
    expect(screen.getByText(/coop still needs sweeping/i)).toBeInTheDocument();
  });
});
