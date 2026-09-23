import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParentAlert } from "@/lib/actions/parent-alerts";

vi.mock("@/components/send-raven", () => ({
  SendRavenDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="send-raven-dialog" /> : null,
}));

vi.mock("@/components/parent-alert-bell", () => ({
  AlertsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="alerts-dialog" /> : null,
}));

let alerts: ParentAlert[] = [];
vi.mock("@/components/parent-alerts-context", () => ({
  useParentAlerts: () => ({ alerts, busy: false, dismiss: vi.fn(), dismissAll: vi.fn() }),
}));

vi.mock("@/lib/auth/client", () => ({
  signOut: vi.fn().mockResolvedValue({}),
}));

import { UserMenu } from "./user-menu";

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
});
afterEach(() => {
  cleanup();
  // Base UI's menu locks body scroll while open; a test that leaves the menu
  // open when it unmounts (rather than closing it first) can leak that lock
  // into the next test's assertions.
  document.body.style.overflow = "";
});

describe("UserMenu — Alerts in the account menu", () => {
  it("carries no badge and no unread styling when nothing is waiting", () => {
    render(<UserMenu userName="Jane" />);
    const trigger = screen.getByRole("button", { name: "Open your account menu" });
    expect(trigger).not.toHaveClass("alert-medallion--unread");
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("shows the unread count as a badge on the closed account button", () => {
    alerts = [alert({ id: "a1" }), alert({ id: "a2" })];
    render(<UserMenu userName="Jane" />);
    const trigger = screen.getByRole("button", {
      name: "Open your account menu — 2 alerts need your attention",
    });
    expect(trigger).toHaveClass("alert-medallion--unread");
    expect(within(trigger).getByText("2")).toBeInTheDocument();
  });

  it("caps a runaway count on the badge", () => {
    alerts = Array.from({ length: 120 }, (_, i) => alert({ id: `a${i}` }));
    render(<UserMenu userName="Jane" />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("lists Alerts with the count inside the open account menu, for a parent", async () => {
    const user = userEvent.setup();
    alerts = [alert({ id: "a1" })];
    render(<UserMenu userName="Jane" />);

    await user.click(screen.getByRole("button", { name: /Open your account menu/ }));

    expect(screen.getByText("Alerts (1)")).toBeInTheDocument();
  });

  it("opens the alerts dialog from the menu item", async () => {
    const user = userEvent.setup();
    alerts = [alert({ id: "a1" })];
    render(<UserMenu userName="Jane" />);

    await user.click(screen.getByRole("button", { name: /Open your account menu/ }));
    await user.click(screen.getByText("Alerts (1)"));

    expect(await screen.findByTestId("alerts-dialog")).toBeInTheDocument();
  });

  it("hides Alerts — from both the badge and the menu — in the hero (child) view", async () => {
    const user = userEvent.setup();
    alerts = [alert({ id: "a1" })];
    render(<UserMenu userName="Robin" isChildView />);

    const trigger = screen.getByRole("button", { name: "Open your account menu" });
    expect(trigger).not.toHaveClass("alert-medallion--unread");

    await user.click(trigger);
    expect(screen.queryByText(/^Alerts/)).not.toBeInTheDocument();
  });

  it("still offers Send a Raven and Settings alongside Alerts", async () => {
    const user = userEvent.setup();
    render(<UserMenu userName="Jane" />);

    await user.click(screen.getByRole("button", { name: /Open your account menu/ }));

    expect(screen.getByText("Send a Raven")).toBeInTheDocument();
    expect(screen.getByText("Settings").closest("a")).toHaveAttribute("href", "/settings");
    expect(screen.getByText(/Leave the Realm/)).toBeInTheDocument();
  });
});
