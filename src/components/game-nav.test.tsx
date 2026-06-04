import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GameBanner, GameNavBar } from "./game-nav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/tavern"),
}));

vi.mock("@/components/user-menu", () => ({
  UserMenu: ({ userName }: { userName: string }) => (
    <div data-testid="user-menu">{userName}</div>
  ),
}));

// QuestHelper renders its own guide listing every destination, which would
// duplicate the medallion labels. It is tested separately; mock it here so the
// GameNavBar assertions target only the nav medallions.
vi.mock("@/components/quest-helper", () => ({
  QuestHelper: () => <div data-testid="quest-helper">Help</div>,
}));

afterEach(cleanup);

describe("GameBanner", () => {
  it("renders the Kingdoms & Crowns brand", () => {
    render(<GameBanner />);
    expect(screen.getByText("Kingdoms & Crowns")).toBeInTheDocument();
  });

  it("renders the crown logo", () => {
    const { container } = render(<GameBanner />);
    const logo = container.querySelector("img.game-banner-logo");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/crown.svg");
  });

  it("links to tavern", () => {
    render(<GameBanner />);
    const link = screen.getByText("Kingdoms & Crowns").closest("a");
    expect(link).toHaveAttribute("href", "/tavern");
  });

});

describe("GameNavBar", () => {
  it("renders all navigation items", () => {
    render(<GameNavBar userName="Test User" />);
    expect(screen.getByText("Tavern")).toBeInTheDocument();
    expect(screen.getByText("Quest Log")).toBeInTheDocument();
    expect(screen.getByText("Loot")).toBeInTheDocument();
    expect(screen.getByText("Ranks")).toBeInTheDocument();
  });

  it("renders user menu with userName", () => {
    render(<GameNavBar userName="Jane Doe" />);
    expect(screen.getByTestId("user-menu")).toHaveTextContent("Jane Doe");
  });

  it("renders the Help control alongside the destinations", () => {
    render(<GameNavBar userName="Test" />);
    expect(screen.getByText("Help")).toBeInTheDocument();
  });

  it("shows the parent-only Quest Giver in the parent view", () => {
    render(<GameNavBar userName="Parent" />);
    expect(screen.getByText("Quest Giver")).toBeInTheDocument();
    expect(screen.getByText("Ranks")).toBeInTheDocument();
  });

  it("hides parent-only destinations in the child view", () => {
    render(<GameNavBar userName="Hero" isChildView />);
    expect(screen.queryByText("Quest Giver")).not.toBeInTheDocument();
    expect(screen.getByText("Ranks")).toBeInTheDocument();
  });

  it("highlights active route", () => {
    render(<GameNavBar userName="Test" />);
    const tavernLink = screen.getByText("Tavern").closest("a");
    expect(tavernLink).toHaveClass("medallion--active");
  });

  it("does not highlight inactive routes", () => {
    render(<GameNavBar userName="Test" />);
    const questsLink = screen.getByText("Quest Log").closest("a");
    expect(questsLink).not.toHaveClass("medallion--active");
  });

  it("renders corner ornaments on navbar", () => {
    const { container } = render(<GameNavBar userName="Test" />);
    const corners = container.querySelectorAll("[class*='game-navbar-corner']");
    expect(corners).toHaveLength(4);
  });
});
