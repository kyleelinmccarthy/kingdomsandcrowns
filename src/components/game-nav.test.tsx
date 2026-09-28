import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { GameBanner, GameNavBar } from "./game-nav";
import { drawing, drawingOf } from "@/test/icons";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/tavern"),
}));

vi.mock("@/components/user-menu", () => ({
  UserMenu: ({ userName, isChildView }: { userName: string; isChildView?: boolean }) => (
    <div data-testid="user-menu" data-child-view={isChildView ? "true" : "false"}>
      {userName}
    </div>
  ),
}));

// QuestHelper renders its own guide listing every destination, which would
// duplicate the medallion labels. It is tested separately; mock it here so the
// GameNavBar assertions target only the nav medallions.
vi.mock("@/components/quest-helper", () => ({
  QuestHelper: () => <div data-testid="quest-helper">Help</div>,
}));

afterEach(() => {
  cleanup();
  vi.mocked(usePathname).mockReturnValue("/tavern");
  // Base UI's menu locks body scroll while open; don't let one test's open menu leak into the next.
  document.body.style.overflow = "";
});

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
  /** The medallions along the bar, left to right, by the word under each. */
  function barLabels(): string[] {
    return [...document.querySelectorAll(".game-navbar-main .medallion-label")].map((el) => el.textContent?.trim() ?? "");
  }

  /** Opens a group's menu with a click and returns the names of what is in it. */
  async function openGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
    const menu = await screen.findByRole("menu");
    return within(menu).getAllByRole("menuitem");
  }

  it("lays out a hero's bar as Tavern · Quests · Spellbook · Realm · Rewards · Schedule", () => {
    render(<GameNavBar userName="Hero" isChildView />);
    expect(barLabels()).toEqual(["Tavern", "Quests", "Spellbook", "Realm", "Rewards", "Schedule"]);
  });

  it("lays out a grown-up's bar the same way — Quest Giver waits inside Quests", () => {
    render(<GameNavBar userName="Parent" />);
    expect(barLabels()).toEqual(["Tavern", "Quests", "Spellbook", "Realm", "Rewards", "Schedule"]);
    expect(screen.queryByText("Quest Giver")).not.toBeInTheDocument();
  });

  it("opens a group on a click, not on hover", async () => {
    const user = userEvent.setup();
    render(<GameNavBar userName="Parent" />);
    await user.hover(screen.getByRole("button", { name: /^Quests/ }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const items = await openGroup(user, "Quests");
    expect(items.map((item) => item.textContent)).toEqual(["Quest Giver", "Quest Log", "Side Quests"]);
  });

  it("gives a hero's Quests menu Quest Log and Side Quests, and no Quest Giver", async () => {
    const user = userEvent.setup();
    render(<GameNavBar userName="Hero" isChildView />);
    const items = await openGroup(user, "Quests");
    expect(items.map((item) => item.textContent)).toEqual(["Quest Log", "Side Quests"]);
  });

  it("puts Loot and Ranks in Rewards, each a link to its page", async () => {
    const user = userEvent.setup();
    render(<GameNavBar userName="Hero" isChildView />);
    const items = await openGroup(user, "Rewards");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Loot", "/loot"],
      ["Ranks", "/leaderboard"],
    ]);
  });

  it("opens a group's menu upward, above the bar at the bottom of the screen", async () => {
    const user = userEvent.setup();
    render(<GameNavBar userName="Hero" isChildView />);
    await openGroup(user, "Quests");
    expect(screen.getByRole("menu")).toHaveAttribute("data-side", "top");
  });

  it("opens a group with Enter, walks it with the arrows, and Escape closes it back onto the medallion", async () => {
    const user = userEvent.setup();
    render(<GameNavBar userName="Parent" />);
    const quests = screen.getByRole("button", { name: /^Quests/ });
    quests.focus();
    await user.keyboard("{Enter}");
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    await user.keyboard("{ArrowDown}");
    const first = items.findIndex((item) => item === document.activeElement);
    expect(first).toBeGreaterThanOrEqual(0);
    await user.keyboard("{ArrowDown}");
    expect(items[(first + 1) % items.length]).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(quests).toHaveFocus();
  });

  it("opens a group with Space, and with ArrowDown on its first destination", async () => {
    const user = userEvent.setup();
    render(<GameNavBar userName="Hero" isChildView />);
    const rewards = screen.getByRole("button", { name: /^Rewards/ });
    rewards.focus();
    await user.keyboard(" ");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await user.keyboard("{ArrowDown}");
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Loot" })).toHaveFocus());
  });

  it("lights a group when one of its pages is open, and marks that page inside it", async () => {
    vi.mocked(usePathname).mockReturnValue("/side-quests");
    const user = userEvent.setup();
    render(<GameNavBar userName="Hero" isChildView />);
    expect(screen.getByRole("button", { name: /^Quests/ })).toHaveClass("medallion--active");
    expect(screen.getByRole("button", { name: /^Rewards/ })).not.toHaveClass("medallion--active");
    const items = await openGroup(user, "Quests");
    expect(items.map((item) => item.getAttribute("aria-current"))).toEqual([null, "page"]);
  });

  it("renders user menu with userName", () => {
    render(<GameNavBar userName="Jane Doe" />);
    expect(screen.getByTestId("user-menu")).toHaveTextContent("Jane Doe");
  });

  it("passes isChildView through to the user menu, so it can gate the Alerts item", () => {
    render(<GameNavBar userName="Hero" isChildView />);
    expect(screen.getByTestId("user-menu")).toHaveAttribute("data-child-view", "true");
  });

  it("no longer mounts a standalone alert bell — Alerts now lives in the account menu", () => {
    const { container } = render(<GameNavBar userName="Parent" />);
    expect(container.querySelector(".alert-tray")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Alerts/ })).not.toBeInTheDocument();
  });

  it("renders the Help control alongside the destinations", () => {
    render(<GameNavBar userName="Test" />);
    expect(screen.getByText("Help")).toBeInTheDocument();
  });

  it("highlights active route", () => {
    render(<GameNavBar userName="Test" />);
    const tavernLink = screen.getByText("Tavern").closest("a");
    expect(tavernLink).toHaveClass("medallion--active");
  });

  it("does not highlight inactive routes or groups", () => {
    render(<GameNavBar userName="Test" />);
    expect(screen.getByText("Spellbook").closest("a")).not.toHaveClass("medallion--active");
    expect(screen.getByRole("button", { name: /^Quests/ })).not.toHaveClass("medallion--active");
  });

  it("shows the Spellbook as an open book", () => {
    const book = drawingOf("book");
    render(<GameNavBar userName="Hero" isChildView />);
    const spellbook = screen.getByRole("link", { name: /^Spellbook — / });
    expect(drawing(spellbook.querySelector("svg"))).toBe(book);
  });

  it("renders corner ornaments on navbar", () => {
    const { container } = render(<GameNavBar userName="Test" />);
    const corners = container.querySelectorAll("[class*='game-navbar-corner']");
    expect(corners).toHaveLength(4);
  });
});
