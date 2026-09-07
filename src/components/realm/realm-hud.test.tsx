import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHud } from "./realm-hud";

afterEach(cleanup);

describe("RealmHud", () => {
  it("shows the hero's minutes and the one-minute banner", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
    expect(screen.queryByText(/one minute left/i)).not.toBeInTheDocument();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={1} warning={true} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.getByText("One minute left in the Realm today.")).toBeInTheDocument();
  });
  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });
  it("links back to the Tavern", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={3} warning={false} preview={null} hudScale={1.25} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });
  it("shows the selector only in the preview HUD", () => {
    render(
      <RealmHud
        heroName="Lily"
        minutesRemaining={null}
        warning={false}
        preview={{ note: null }}
        hudScale={1}
        error=""
        selector={<span>picker</span>}
        onRetry={() => {}}
        paused={false}
        toast={null}
        calm={false}
        kingdomError=""
        onKingdomRetry={() => {}}
        mana={null}
        cleared={null}
        notice={null}
      />
    );
    expect(screen.getByText("picker")).toBeInTheDocument();
    cleanup();
    render(
      <RealmHud
        heroName="Lily"
        minutesRemaining={3}
        warning={false}
        preview={null}
        hudScale={1}
        error=""
        selector={<span>picker</span>}
        onRetry={() => {}}
        paused={false}
        toast={null}
        calm={false}
        kingdomError=""
        onKingdomRetry={() => {}}
        mana={null}
        cleared={null}
        notice={null}
      />
    );
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });
  it("marks the counter paused and shows a toast", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast="The Village Well stands." calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
    expect(screen.getByRole("status")).not.toHaveClass("realm-hud-toast--plain");
  });

  it("renders a plain, non-animated toast when the profile is calm", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast="The Village Well stands." calm={true} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.getByRole("status")).toHaveClass("realm-hud-toast--plain");
  });

  it("shows the kingdom error with its own retry", () => {
    const onKingdomRetry = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="The villagers are resting. Try again." onKingdomRetry={onKingdomRetry} mana={null} cleared={null} notice={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Wake the villagers" }));
    expect(onKingdomRetry).toHaveBeenCalled();
  });

  it("logs no console errors when a preview selector is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RealmHud
        heroName="Lily"
        minutesRemaining={null}
        warning={false}
        preview={{ note: null }}
        hudScale={1}
        error=""
        selector={<span>picker</span>}
        onRetry={() => {}}
        paused={false}
        toast={null}
        calm={false}
        kingdomError=""
        onKingdomRetry={() => {}}
        mana={null}
        cleared={null}
        notice={null}
      />
    );
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });

  it("shows mana, the cleared count, and a notice", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={42} cleared={3} notice="The fog thins." />);
    const bar = screen.getByRole("progressbar", { name: "Mana" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Cleared: 3")).toBeInTheDocument();
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
  });
  it("hides mana and the count in preview", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: null }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared:/)).not.toBeInTheDocument();
  });
});
