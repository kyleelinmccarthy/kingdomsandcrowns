import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParentAlert } from "@/lib/actions/parent-alerts";

const dismiss = vi.fn().mockResolvedValue(undefined);
const dismissAll = vi.fn().mockResolvedValue(undefined);
let alerts: ParentAlert[] = [];

vi.mock("@/components/parent-alerts-context", () => ({
  useParentAlerts: () => ({ alerts, busy: false, dismiss, dismissAll }),
}));

import { AlertsDialog } from "./parent-alert-bell";

function alert(overrides: Partial<ParentAlert> = {}): ParentAlert {
  return {
    id: "a1",
    type: "quest_skipped",
    childId: "c1",
    childName: "Robin",
    questTitle: "Long division",
    subjectName: "Maths",
    date: "2026-08-26",
    note: null,
    createdAt: "2026-08-26T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  alerts = [];
  dismiss.mockClear();
  dismissAll.mockClear();
});
afterEach(cleanup);

describe("AlertsDialog", () => {
  it("says so plainly when there is nothing waiting", () => {
    render(<AlertsDialog open onClose={() => {}} />);
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });

  it("leaves the native dialog closed until opened", () => {
    const { container } = render(<AlertsDialog open={false} onClose={() => {}} />);
    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("lists what each hero skipped or got stuck on, with the count in the title", () => {
    alerts = [
      alert({ id: "a1", type: "quest_skipped", questTitle: "Long division" }),
      alert({ id: "a2", type: "quest_stuck", childName: "Wren", questTitle: "Spelling" }),
    ];
    render(<AlertsDialog open onClose={() => {}} />);

    expect(screen.getByText("Alerts (2)")).toBeInTheDocument();
    expect(screen.getByText('Robin skipped "Long division"')).toBeInTheDocument();
    expect(screen.getByText('Wren got stuck on "Spelling"')).toBeInTheDocument();
  });

  it("dismisses a single alert", async () => {
    const user = userEvent.setup();
    alerts = [alert({ id: "a1" })];
    render(<AlertsDialog open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^Dismiss: Robin skipped/ }));

    expect(dismiss).toHaveBeenCalledWith("a1");
  });

  it("dismisses everything at once", async () => {
    const user = userEvent.setup();
    alerts = [alert({ id: "a1" }), alert({ id: "a2" })];
    render(<AlertsDialog open onClose={() => {}} />);

    await user.click(screen.getByText("Dismiss all"));

    expect(dismissAll).toHaveBeenCalled();
  });

  it("keeps the overflow honest when there are more alerts than rows", () => {
    alerts = Array.from({ length: 9 }, (_, i) => alert({ id: `a${i}` }));
    render(<AlertsDialog open onClose={() => {}} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("View all 9 in the Tavern →")).toBeInTheDocument();
  });

  it("closes when the Tavern link is followed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    alerts = [alert({ id: "a1" })];
    render(<AlertsDialog open onClose={onClose} />);

    await user.click(screen.getByText("View in the Tavern →"));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the dialog's own close control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AlertsDialog open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });
});
