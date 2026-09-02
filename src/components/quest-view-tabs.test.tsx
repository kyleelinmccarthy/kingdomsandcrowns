import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuestViewTabs } from "./quest-view-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe("QuestViewTabs", () => {
  it("always shows the school tabs", () => {
    render(<QuestViewTabs active="today" showUpkeep={false} />);
    expect(screen.getByRole("button", { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /complete adventure/i })).toBeInTheDocument();
  });

  it("hides Upkeep when the module is off", () => {
    render(<QuestViewTabs active="today" showUpkeep={false} />);
    expect(screen.queryByRole("button", { name: /upkeep/i })).not.toBeInTheDocument();
  });

  it("shows Upkeep when the module is on", () => {
    render(<QuestViewTabs active="today" showUpkeep />);
    expect(screen.getByRole("button", { name: /upkeep/i })).toBeInTheDocument();
  });
});
